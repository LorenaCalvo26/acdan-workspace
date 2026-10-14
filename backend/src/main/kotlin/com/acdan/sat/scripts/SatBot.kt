package com.acdan.sat.scripts

import com.acdan.sat.controllers.ControllerResponse
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.providers.secrets.SecretsClient
import com.koupper.shared.annotations.Export
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * DTO para la solicitud de ejecución del bot autónomo del SAT.
 *
 * @property jobId Identificador único de trabajo.
 * @property rfc Registro Federal de Contribuyentes.
 * @property tipos Colección de tipos de documentos a solicitar (ej: "constancia", "32d").
 */
data class SatBotRequest(
    val jobId: String = UUID.randomUUID().toString(),
    val rfc: String = "",
    val tipos: List<String> = listOf("constancia", "32d"),
    val periodo: String = ""
)

/**
 * Worker autónomo para la descarga de documentos del SAT (Opinión 32-D y Constancias).
 * Exportado con [@Export] para Koupper Task Orchestration.
 *
 * Se ejecuta de forma asíncrona, gestiona la solución de captchas, navegación sigilosa con [SatBrowser]
 * y extracción de bytes PDF para almacenamiento seguro.
 */
@Export
val satBotJob: (SatBotRequest) -> ControllerResponse = { req ->

    val rfc = req.rfc.uppercase()
    val dynamo = app.getInstance(DynamoClient::class)
    val secrets = app.getInstance(SecretsClient::class)
    val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
    val docsTable = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
    val clientesTable = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
    val headless = env("SAT_HEADLESS", required = false, default = "true") == "true"
    // NO reconstruir la URL de OAuth (rompía el PKCE: code_verifier lo guarda la app).
    // Navegar a la app directamente: ella redirige al login con un code_challenge fresco
    // y su code_verifier propio, así el canje del código funciona y muestra el PDF.
    val startUrl = if (req.tipos.contains("32d"))
        "https://ptsc32d.clouda.sat.gob.mx/"
    else env(
        "SAT_LOGIN_URL", required = false,
        default = "https://loginda.siat.sat.gob.mx/nidp/app/login?id=ciec&sid=0&option=credential&sid=0"
    )

    val progreso = mutableMapOf<String, String>()
    var cfdiParcial = false
    fun setStatus(status: String, error: String? = null, intento: Int = 0) {
        dynamo.insertItem(jobsTable, mapOf(
            "pk" to req.jobId, "jobId" to req.jobId, "rfc" to rfc,
            "tipos" to req.tipos.joinToString(","), "status" to status,
            "intentoCaptcha" to intento.toString(), "error" to (error ?: ""),
            "periodo" to req.periodo, "updatedAt" to Instant.now().toString()
        ) + progreso)
    }

    var browser: SatBrowser? = null
    try {
        val ciec = secrets.getOrNull("sat:$rfc")
            ?: throw Exception("Sin Contraseña/CIEC en Secrets para sat:$rfc. Alta el cliente de nuevo.")
        setStatus("login")

        browser = SatBrowser(headless)
        val b = browser

        // Selectores del login SAT (plantilla nidp; ver DOM dump 2026-09-30):
        // inputs Ecom_User_ID#rfc, Ecom_Password#password, userCaptcha#userCaptcha,
        // captcha = único img data-uri, submit = input[type=submit] (NO button: ese es e.firma).
        val rfcSel = "#rfc"
        val passSel = "#password"
        val captchaInputSel = "#userCaptcha"
        val submitSel = "input[type='submit']"
        val debugDir = File("./storage/debug").apply { mkdirs() }
        val maxCaptchaLecturas = env("SAT_CAPTCHA_LECTURAS", required = false, default = "14").toInt()
        val maxLogins = env("SAT_MAX_LOGINS", required = false, default = "6").toInt()

        // Login CIEC contra la página de entrada de cada app del SAT (32-D y
        // Constancia usan logins nidp distintos y la sesión no siempre se hereda).
        // Si al llegar ya no hay captcha (el SSO arrastró la sesión), entra directo.
        // `estricto` exige evidencia positiva de sesión (RFC o Cerrar en el texto):
        // la app de acuses redirige al home público al fallar, saliendo de /nidp/
        // y un chequeo laxo lo daría por bueno por error.
        fun esPaginaError(txt: String) =
            txt.contains("403", true) || txt.contains("Forbidden", true) ||
                txt.contains("no se puede mostrar", true) || txt.contains("Service Unavailable", true)

        fun hacerLogin(entryUrl: String, app: String, estricto: Boolean = false): Boolean {
            setStatus("login")
            if (!b.navigate(entryUrl)) {
                // La home del portal a veces tarda: un reintento antes de rendirse.
                println("[satbot ${req.jobId}] $app: reintentando carga de login en 10s")
                Thread.sleep(10000)
                if (!b.navigate(entryUrl)) {
                    println("[satbot ${req.jobId}] $app: no cargó la página de login")
                    return false
                }
            }
            if (!b.waitFor(rfcSel)) {
                // Sin captcha puede ser SSO vigente... o una página de error del SAT.
                // Solo se acepta si hay evidencia de sesión, jamás en página de error.
                val txt0 = b.pageText()
                if (!b.exists("#userCaptcha") && !esPaginaError(txt0) &&
                    (txt0.contains(rfc) || txt0.contains("Cerrar", true) || txt0.contains("Buz", true))
                ) {
                    println("[satbot ${req.jobId}] $app: sin captcha al llegar, SSO vigente")
                    return true
                }
                println("[satbot ${req.jobId}] $app: no cargó el form SAT (selector RFC)")
                return false
            }
            println("[satbot ${req.jobId}] $app DOM: " + b.dumpDom())
            b.fill(rfcSel, rfc)
            b.fill(passSel, ciec)

            var logged = false
            var loginsUsados = 0
            var lecturasHechas = 0

            while (loginsUsados < maxLogins) {
                // --- Fase 1: conseguir un código de exactamente 6 caracteres ---
                var code = ""
                while (code.isBlank() && lecturasHechas < maxCaptchaLecturas) {
                    lecturasHechas++
                    setStatus("captcha", intento = loginsUsados + 1)
                    println("[satbot ${req.jobId}] $app fill rfc=" + b.fill(rfcSel, rfc) + " fill pass=" + b.fill(passSel, ciec))
                    val imgBytes = b.captchaDataUriBytes() ?: b.screenshotCaptcha("img[src^='data:image']")
                    if (imgBytes == null) {
                        println("[satbot ${req.jobId}] $app lectura $lecturasHechas: NO encontró imagen captcha")
                    } else {
                        println("[satbot ${req.jobId}] $app lectura $lecturasHechas: captchaBytes=${imgBytes.size} (logins=$loginsUsados/$maxLogins)")
                        File(debugDir, "${req.jobId}-$app-captcha-$lecturasHechas.png").writeBytes(imgBytes)
                        val lectura = runCatching { CaptchaSolver.solve(imgBytes) }
                            .getOrElse { CaptchaSolver.Lectura("", emptyList(), false) }
                        code = lectura.code
                        if (code.isNotBlank()) {
                            File(debugDir, "${req.jobId}-$app-captcha-$lecturasHechas-solucion.png").writeBytes(
                                CaptchaSolver.preprocess(imgBytes)
                            )
                        }
                        println("[satbot ${req.jobId}] $app lectura $lecturasHechas: lecturas=${lectura.lecturas} consenso=${lectura.consensoAlto} -> code='$code'")
                    }

                    if (code.isBlank()) {
                        // Lectura descartada: el SAT siempre manda 6, así que esto ya es un
                        // código malo. No se envía: se recarga la página por una imagen nueva,
                        // lo cual NO cuenta como intento de login.
                        println("[satbot ${req.jobId}] $app lectura $lecturasHechas: no salió un código de 6, se pide otra imagen (sin gastar login)")
                        Thread.sleep(1500)
                        if (!b.navigate(entryUrl)) break
                        if (!b.waitFor(rfcSel)) break
                    }
                }

                if (code.isBlank()) {
                    println("[satbot ${req.jobId}] $app: no salió código de 6 en $lecturasHechas lecturas")
                    if (loginsUsados + 1 >= maxLogins) break
                    // La página quedó en mal estado tras el login fallido: recargar la
                    // entrada y seguir con los logins restantes en vez de abortar todo.
                    println("[satbot ${req.jobId}] $app: recargando login para reintentar (van ${loginsUsados + 1}/$maxLogins logins)")
                    Thread.sleep(5000)
                    if (!b.navigate(entryUrl) || !b.waitFor(rfcSel)) break
                    b.fill(rfcSel, rfc)
                    b.fill(passSel, ciec)
                    continue
                }

                // --- Fase 2: usar ese código. Aquí sí se gasta un intento del SAT ---
                val typed = b.typeCaptcha(captchaInputSel, code)
                val enInput = b.readValue(captchaInputSel)
                println("[satbot ${req.jobId}] $app login ${loginsUsados + 1}/$maxLogins: typeCaptcha=$typed enInput='$enInput' (code='$code')")
                b.screenshot()?.let { File(debugDir, "${req.jobId}-$app-page-${loginsUsados + 1}.png").writeBytes(it) }
                println("[satbot ${req.jobId}] $app login ${loginsUsados + 1}: click submit=" + b.click(submitSel))
                loginsUsados++
                Thread.sleep(10000)
                val url = b.currentUrl()
                val txt = b.pageText()
                println("[satbot ${req.jobId}] $app login $loginsUsados: url post-submit=$url")
                println("[satbot ${req.jobId}] $app login $loginsUsados: SAT dice: " + txt.take(400))
                // Página de error del SAT (típico 403 por límite de intentos): enfriar
                // y abortar el login en vez de quemar intentos contra el bloqueo.
                if (esPaginaError(txt)) {
                    println("[satbot ${req.jobId}] $app: página de error del SAT, enfriando 3 min")
                    Thread.sleep(180_000)
                    break
                }
                // Login OK si: salimos de cualquier página nidp, o desapareció el
                // input captcha, o aparece Welcome + RFC (landing post-login).
                // (NO usar hasPdfFrame aquí: la página de login trae un iframe oculto.)
                // En modo estricto se exige además evidencia de sesión, porque un
                // login fallido puede redirigir fuera de nidp sin autenticar.
                val fueraNidp = !url.contains("/nidp/")
                val sinCaptcha = !b.exists("#userCaptcha")
                val evidencia = txt.contains(rfc) || txt.contains("Cerrar", true) || txt.contains("Welcome", true)
                if ((fueraNidp || sinCaptcha || txt.contains("Welcome", true)) && (!estricto || (sinCaptcha && evidencia))) {
                    logged = true
                    break
                }
                // Pausa anti-bloqueo entre intentos fallidos (ambas apps).
                Thread.sleep(20000)
            }
            if (!logged) println("[satbot ${req.jobId}] $app: login fallido tras $loginsUsados intentos")
            return logged
        }

        val docIds = mutableListOf<String>()
        val constanciaUrl = env(
            "SAT_CONSTANCIA_URL", required = false,
            default = "https://wwwmat.sat.gob.mx/app/seg/cont/accesoC?parametro=1&url=/operacion/43824/reimprime-tus-acuses-del-rfc&target=principal&tipoLogeo=c&hostServer=https://wwwmat.sat.gob.mx"
        )
        val cfdiUrl = env(
            "SAT_CFDI_URL", required = false,
            default = "https://portalcfdi.facturaelectronica.sat.gob.mx/"
        )
        req.tipos.forEach { tipo ->
            setStatus("descargando")
            if (tipo == "32d") {
                if (!hacerLogin(startUrl, "32d")) throw Exception("Login 32-D fallido: no se obtuvo acceso tras los intentos de captcha")
                if (!b.currentUrl().contains("reporteOpinion32D")) {
                    b.navigate("https://ptsc32d.clouda.sat.gob.mx/#/reporteOpinion32DContribuyente")
                }
            }
            // Constancia: login propio (la sesión del 32-D no se hereda) y luego
            // se generan/disparan descargas; sus botones no tienen selectores estables.
            var pdfDirecto: ByteArray? = null
            if (tipo == "constancia") {
                if (!hacerLogin(constanciaUrl, "constancia", estricto = true)) throw Exception("Login Constancia fallido: no se obtuvo acceso tras los intentos de captcha")
                println("[satbot ${req.jobId}] constancia: url=" + b.currentUrl())
                println("[satbot ${req.jobId}] constancia: FRAMES: " + b.dumpFrames())
                // La app de acuses vive en un iframe SessionBroker: navegar directo
                // a su URL evita una capa de navegación y menús intermedios.
                // (Ojo: filtrar solo SessionBroker; la página principal también
                // contiene "rei" por "reimprime" y navegar a ella no sirve.)
                val inner = b.urlsFrames().firstOrNull { it.contains("SessionBroker", true) }
                if (inner != null && !b.currentUrl().contains("SessionBroker")) {
                    println("[satbot ${req.jobId}] constancia: navegando directo al frame: " + inner.take(160))
                    b.navigate(inner)
                    Thread.sleep(8000)
                    println("[satbot ${req.jobId}] constancia: FRAMES tras nav directa: " + b.dumpFrames())
                }
                println("[satbot ${req.jobId}] constancia: APP: " + b.dumpApp())
                b.screenshot()?.let { File("./storage/debug/${req.jobId}-constancia-landing.png").writeBytes(it) }
                // Intentos de disparo (también dentro de frames): generar, buscar/listar y descargar.
                // Se rompe solo si ya hay BYTES de PDF (un iframe con src HTML no cuenta).
                // La app a veces DESCARGA el archivo en vez de mostrarlo: se captura el
                // evento de descarga del navegador en cada disparo.
                val disparos = listOf(
                    arrayOf("generar constancia", "generar"),
                    arrayOf("mis expedientes", "expedientes", "buscar", "consultar", "reimprimir"),
                    arrayOf("descargar", "imprimir", "descarga", "pdf")
                )
                fun esPdf(bytes: ByteArray) = bytes.size >= 5 &&
                    String(bytes.take(5).toByteArray(), Charsets.US_ASCII) == "%PDF-"
                for (d in disparos) {
                    if (b.downloadPdfBytes() != null) break
                    pdfDirecto = b.descargarPorEvento(20_000.0) { b.clickTextoEnFrames(*d) || b.clickTexto(*d) }
                        ?.takeIf { esPdf(it) }
                    if (pdfDirecto != null) {
                        println("[satbot ${req.jobId}] constancia: PDF por evento de descarga, ${pdfDirecto.size} bytes")
                        break
                    }
                    Thread.sleep(6000)
                    println("[satbot ${req.jobId}] constancia: tras disparo url=" + b.currentUrl() + " pdfFrame=" + b.hasPdfFrame())
                }
                println("[satbot ${req.jobId}] constancia: APP final: " + b.dumpApp())
                println("[satbot ${req.jobId}] constancia: PESTAÑAS: " + b.dumpPestanas())
                b.screenshot()?.let { File("./storage/debug/${req.jobId}-constancia-final.png").writeBytes(it) }
                // Falla rápida: si tras los disparos no hay visor y la página es el
                // portal público (sin sesión), esperar 180s es tiempo perdido.
                if (!b.hasPdfFrame()) {
                    val t = b.pageText()
                    if (!t.contains(rfc) && t.contains("Inicio de sesión", true)) {
                        throw Exception("Constancia sin sesión en la app de acuses (portal público). Revisar login/CIEC.")
                    }
                }
            }
            // CFDI: consultas del mes cerrado, captura de Emitidas/Recibidas y
            // descarga validada de XML, PDF y acuses disponibles por registro.
            if (tipo == "cfdi") {
                if (!hacerLogin(cfdiUrl, "cfdi", estricto = true)) throw Exception("Login CFDI fallido: no se obtuvo acceso tras los intentos de captcha")
                println("[satbot ${req.jobId}] cfdi: url=" + b.currentUrl())
                println("[satbot ${req.jobId}] cfdi: HOME: " + b.dumpApp())
                b.screenshot()?.let { File("./storage/debug/${req.jobId}-cfdi-home.png").writeBytes(it) }
                // Periodo: mes vencido (en octubre -> septiembre), del día 1 al fin de mes.
                val pm = if (req.periodo.isBlank()) CfdiStore.ultimoMesCerrado() else java.time.YearMonth.parse(req.periodo)
                progreso["periodo"] = pm.toString()
                setStatus("consultando_cfdi")
                val anio = pm.year.toString()
                val mes = "%02d".format(pm.monthValue)
                val ultimo = "%02d".format(pm.lengthOfMonth())
                println("[satbot ${req.jobId}] cfdi: periodo $anio-$mes (01 al $ultimo)")

                fun seleccionarCampo(selector: String, valor: String) {
                    check(b.seleccionar(selector, valor)) { "CFDI: no se pudo seleccionar $selector=$valor" }
                }

                val capturas = mutableListOf<Pair<String, com.fasterxml.jackson.databind.JsonNode>>()
                fun guardarConsulta(vista: String, inicio: java.time.LocalDateTime? = null, finRango: java.time.LocalDateTime? = null) {
                    val sufijo = inicio?.toString()?.replace(":", "-")?.let { "-$it" } ?: ""
                    val prefix = "${req.jobId}-cfdi-$vista$sufijo"
                    val completo = b.esperarResultadoCfdi()
                    File(debugDir, "$prefix-grid.html").writeText(b.htmlActual(), Charsets.UTF_8)
                    b.screenshot()?.let { File(debugDir, "$prefix-grid.png").writeBytes(it) }
                    val mapper = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper()
                    val captura = mapper.readTree(b.capturarGridCfdi())
                    (captura as com.fasterxml.jackson.databind.node.ObjectNode).put("periodo", pm.toString())
                    captura.put("vista", vista)
                    File(debugDir, "$prefix-grid.json").writeText(
                        mapper.writerWithDefaultPrettyPrinter().writeValueAsString(captura), Charsets.UTF_8
                    )
                    check(completo) { "CFDI $vista: no apareció un resultado confirmado; revisar $prefix-grid.html" }
                    val grids = captura.path("grids")
                    val filas = grids.sumOf { it.path("totalFilas").asInt() }
                    if (filas >= 500) {
                        fun consultarRango(desde: java.time.LocalDateTime, hasta: java.time.LocalDateTime) {
                            if (vista == "emisor") {
                                val formato = java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")
                                for ((selector, valor) in listOf(
                                    "#ctl00_MainContent_CldFechaInicial2_Calendario_text" to desde.format(formato), "#hfInicial" to desde.format(formato),
                                    "#ctl00_MainContent_CldFechaFinal2_Calendario_text" to hasta.format(formato), "#hfFinal" to hasta.format(formato)
                                )) check(b.fijarValor(selector, valor)) { "No se pudo subdividir rango CFDI" }
                            } else seleccionarCampo("#ctl00_MainContent_CldFecha_DdlDia", "%02d".format(desde.dayOfMonth))
                            for ((campo, valor) in listOf("Hora" to desde.hour, "Minuto" to desde.minute, "Segundo" to desde.second))
                                seleccionarCampo(if (vista == "emisor") "#ctl00_MainContent_CldFechaInicial2_Ddl$campo" else "#ctl00_MainContent_CldFecha_Ddl$campo", valor.toString())
                            for ((campo, valor) in listOf("Hora" to hasta.hour, "Minuto" to hasta.minute, "Segundo" to hasta.second))
                                seleccionarCampo(if (vista == "emisor") "#ctl00_MainContent_CldFechaFinal2_Ddl$campo" else "#ctl00_MainContent_CldFecha_Ddl${campo}Fin", valor.toString())
                            // No aceptar el grid anterior mientras llega el siguiente postback.
                            b.eval("document.querySelector('#ctl00_MainContent_tblResult')?.remove(); document.querySelector('#ctl00_MainContent_PnlNoResultados')?.replaceChildren();")
                            check(b.click("#ctl00_MainContent_BtnBusqueda")) { "No se pudo consultar subrango CFDI" }
                            guardarConsulta(vista, desde, hasta)
                        }
                        if (inicio == null) {
                            for (dia in 1..pm.lengthOfMonth()) {
                                val fecha = pm.atDay(dia)
                                consultarRango(fecha.atStartOfDay(), fecha.atTime(23, 59, 59))
                            }
                        } else {
                            val segundos = java.time.temporal.ChronoUnit.SECONDS.between(inicio, finRango!!)
                            check(segundos > 0) { "CFDI: límite SAT alcanzado aun en un solo segundo; el mes no se marca completo" }
                            val mitad = inicio.plusSeconds(segundos / 2)
                            consultarRango(inicio, mitad)
                            consultarRango(mitad.plusSeconds(1), finRango)
                        }
                        return
                    }
                    check(filas > 0 || captura.path("mensajeSinResultados").asText().contains(
                        Regex("no se encontr[óoa].*comprobantes|no existen (registros|comprobantes)|no se encontraron resultados", RegexOption.IGNORE_CASE)
                    )) { "CFDI $vista: grid sin filas identificables; revisar $prefix-grid.json" }
                    println("[satbot ${req.jobId}] cfdi: $vista periodo=$pm filas=$filas evidencia=$prefix-grid.{html,json,png}")
                    grids.forEach { println("[satbot ${req.jobId}] cfdi: $vista columnas=" + it.path("encabezados")) }
                    capturas.add(vista to captura)
                }

                // --- EMISORAS: llenar rango + Buscar + capturar grid ---
                check(b.navigate("https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaEmisor.aspx")) { "No cargó ConsultaEmisor" }
                Thread.sleep(8000)
                // Modo "por fechas" (el radio dispara postback: esperar a que asiente).
                check(b.click("#ctl00_MainContent_RdoFechas")) { "CFDI Emitidas: no se pudo activar búsqueda por fechas" }
                Thread.sleep(6000)
                // Fechas del periodo (mes vencido) en textbox + hidden de ASP.NET.
                val ini = "01/$mes/$anio"
                val fin = "$ultimo/$mes/$anio"
                for ((selector, valor) in listOf(
                    "#ctl00_MainContent_CldFechaInicial2_Calendario_text" to ini, "#hfInicial" to ini,
                    "#ctl00_MainContent_CldFechaFinal2_Calendario_text" to fin, "#hfFinal" to fin
                )) {
                    check(b.fijarValor(selector, valor) && b.readValue(selector) == valor) { "CFDI: no se pudo fijar $selector=$valor" }
                }
                for ((campo, valor) in listOf("Hora" to "0", "Minuto" to "0", "Segundo" to "0")) {
                    seleccionarCampo("#ctl00_MainContent_CldFechaInicial2_Ddl$campo", valor)
                }
                for ((campo, valor) in listOf("Hora" to "23", "Minuto" to "59", "Segundo" to "59")) {
                    seleccionarCampo("#ctl00_MainContent_CldFechaFinal2_Ddl$campo", valor)
                }
                seleccionarCampo("#ctl00_MainContent_DdlEstadoComprobante", "-1")
                println("[satbot ${req.jobId}] cfdi: Emitidas fechas $ini 00:00:00 -> $fin 23:59:59, todos los estados")
                b.screenshot()?.let { File("./storage/debug/${req.jobId}-cfdi-emisor-form.png").writeBytes(it) }
                check(b.click("#ctl00_MainContent_BtnBusqueda")) { "CFDI Emitidas: no se pudo pulsar Buscar CFDI" }
                guardarConsulta("emisor")

                // --- RECEPTORAS: año/mes completos (día vacío = todo el mes) ---
                check(b.navigate("https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx")) { "No cargó ConsultaReceptor" }
                Thread.sleep(8000)
                check(b.click("#ctl00_MainContent_RdoFechas")) { "CFDI Recibidas: no se pudo activar búsqueda por fechas" }
                Thread.sleep(6000)
                seleccionarCampo("#DdlAnio", anio)
                seleccionarCampo("#ctl00_MainContent_CldFecha_DdlMes", pm.monthValue.toString())
                seleccionarCampo("#ctl00_MainContent_CldFecha_DdlDia", "0")
                for ((campo, valor) in listOf(
                    "Hora" to "0", "Minuto" to "0", "Segundo" to "0",
                    "HoraFin" to "23", "MinutoFin" to "59", "SegundoFin" to "59"
                )) {
                    seleccionarCampo("#ctl00_MainContent_CldFecha_Ddl$campo", valor)
                }
                seleccionarCampo("#ctl00_MainContent_DdlEstadoComprobante", "-1")
                b.screenshot()?.let { File(debugDir, "${req.jobId}-cfdi-receptor-form.png").writeBytes(it) }
                check(b.click("#ctl00_MainContent_BtnBusqueda")) { "CFDI Recibidas: no se pudo pulsar Buscar CFDI" }
                guardarConsulta("receptor")
                // Conteo que REPORTÓ el SAT por vista (grids capturados, incluyendo
                // sub-rangos si el mes se partió por el límite de 500): base del espejo SAT vs Pilli.
                val filasSat = capturas.groupBy({ it.first }, { it.second })
                    .mapValues { (_, caps) -> caps.sumOf { cap -> cap.path("grids").sumOf { g -> g.path("totalFilas").asInt() } } }
                val satEmitidas = filasSat["emisor"] ?: filasSat["emitidas"] ?: 0
                val satRecibidas = filasSat["receptor"] ?: filasSat["recibidas"] ?: 0
                val pendientes = capturas.flatMap { (vista, captura) -> CfdiStore.registrar(rfc, pm, vista, captura) }
                progreso["cfdiTotal"] = pendientes.size.toString()
                var hechos = 0
                var errores = 0
                var fallosSeguidos = 0
                for (pendiente in pendientes) {
                    progreso["cfdiProcesados"] = hechos.toString()
                    progreso["cfdiErrores"] = errores.toString()
                    progreso["cfdiVista"] = pendiente.vista
                    setStatus("descargando_cfdi")
                    if (!CfdiStore.descargar(b, pendiente)) { errores++; fallosSeguidos++ } else fallosSeguidos = 0
                    hechos++
                    if (fallosSeguidos >= 3) {
                        errores += pendientes.size - hechos
                        println("[satbot ${req.jobId}] cfdi: se detienen las descargas tras 3 fallos seguidos; ${pendientes.size - hechos} registros pendientes de reintento")
                        break
                    }
                }
                progreso["cfdiProcesados"] = hechos.toString()
                progreso["cfdiErrores"] = errores.toString()
                cfdiParcial = errores > 0
                CfdiStore.cerrar(rfc, pm, req.jobId, pendientes.size, errores, satEmitidas, satRecibidas)
                println("[satbot ${req.jobId}] cfdi: persistidos=$hechos errores=$errores periodo=$pm")
                return@forEach
            }
            println("[satbot ${req.jobId}] $tipo: url=" + b.currentUrl() + " pdfFrame=" + b.hasPdfFrame())
            Thread.sleep(8000)
            println("[satbot ${req.jobId}] $tipo: APP: " + b.dumpApp())
            b.screenshot()?.let { File("./storage/debug/${req.jobId}-$tipo-landing.png").writeBytes(it) }
            // Si la Constancia ya bajó por evento, se salta la espera del visor.
            var pdf: ByteArray? = pdfDirecto
            if (pdf != null) println("[satbot ${req.jobId}] $tipo: PDF ya obtenido por evento, ${pdf.size} bytes")
            val deadline = System.currentTimeMillis() + 180_000
            var ticks = 0
            while (pdf == null && System.currentTimeMillis() < deadline) {
                val frame = b.hasPdfFrame()
                if (frame) {
                    pdf = b.downloadPdfBytes()
                    if (pdf != null) {
                        println("[satbot ${req.jobId}] $tipo: PDF bajado, ${pdf.size} bytes")
                        break
                    }
                }
                // La Constancia puede abrirse en un popup: revisar otras pestañas.
                if (pdf == null && tipo == "constancia") {
                    pdf = b.pdfEnPestanas()
                    if (pdf != null) {
                        println("[satbot ${req.jobId}] constancia: PDF bajado desde popup, ${pdf.size} bytes")
                        break
                    }
                }
                ticks++
                if (ticks % 10 == 0) {
                    println("[satbot ${req.jobId}] $tipo: esperando iframe... ticks=$ticks url=" + b.currentUrl() + " frame=$frame")
                }
                Thread.sleep(3000)
            }
            val pdfBytes = pdf ?: throw Exception("No apareció el iframe PDF para $tipo (timeout 180s)")
            if (pdfBytes.size < 5 || String(pdfBytes.take(5).toByteArray(), Charsets.US_ASCII) != "%PDF-") {
                throw Exception("El frame de $tipo no devolvió un PDF válido")
            }

            val docId = "${rfc}-${tipo}-${Instant.now().epochSecond}"
            val dir = File("./storage/$rfc").apply { mkdirs() }
            val pdfFile = File(dir, "$docId.pdf")
            pdfFile.writeBytes(pdfBytes)

            setStatus("extrayendo")
            val campos = PdfExtractor.extract(pdfFile.absolutePath, tipo)
            // JSON bien escapado: el front lo parsea tal cual. Reemplazar comillas por
            // apóstrofos (como antes) deformaba el texto y rompía valores con comillas.
            val camposJson = com.acdan.sat.controllers.Json.obj(campos, sinTruncar = setOf("raw"), max = 1000)
            dynamo.insertItem(docsTable, mapOf(
                "pk" to docId, "docId" to docId, "rfc" to rfc, "tipo" to tipo,
                "s3Key" to pdfFile.path,
                "campos" to camposJson,
                "createdAt" to Instant.now().toString()
            ))
            docIds.add(docId)

            // Notificaciones por email tras el dictamen 32-D (no bloquean el job).
            if (tipo == "32d") {
                runCatching {
                    val cliente = dynamo.getItem(clientesTable, "pk", rfc)
                    EmailNotifier.notificarDictamen(
                        emailCliente = cliente?.get("email")?.toString().orEmpty(),
                        nombreCliente = cliente?.get("nombre")?.toString().orEmpty(),
                        rfc = rfc,
                        folio = campos["folio"].orEmpty(),
                        fecha = campos["fechaEmision"].orEmpty(),
                        sentido = campos["sentido"].orEmpty()
                    )
                }.onFailure {
                    println("[satbot ${req.jobId}] notificación email falló: ${it.message}")
                }
            }
        }
        setStatus(if (cfdiParcial) "parcial" else "listo", if (cfdiParcial) "Algunos archivos CFDI no se pudieron descargar. Los registros se conservaron y se reintentarán." else null)
        // Éxito: la próxima corrida toca dentro de su frecuencia. Sin esto el
        // programador re-encolaría al cliente en cada tick para siempre.
        runCatching {
            val tabla = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
            val item = dynamo.getItem(tabla, "pk", rfc)
            if (item != null && req.tipos.any { it != "cfdi" }) {
                val dias = item["frecuenciaDias"]?.toString()?.toLongOrNull() ?: 25L
                val merged = item.toMutableMap()
                merged["proximoRun"] = Instant.now().plus(dias, java.time.temporal.ChronoUnit.DAYS).toString()
                merged["updatedAt"] = Instant.now().toString()
                dynamo.insertItem(tabla, merged.mapValues { it.value.toString() })
            }
        }.onFailure {
            println("[satbot ${req.jobId}] no se pudo avanzar proximoRun: ${it.message}")
        }
        ControllerResponse(200, """{"ok":true,"jobId":"${req.jobId}","docs":${docIds.size}}""")
    } catch (t: Throwable) {
        setStatus("error", t.message)
        runCatching {
            val cliente = dynamo.getItem(clientesTable, "pk", rfc)
            EmailNotifier.notificarFallo(
                rfc = rfc,
                nombreCliente = cliente?.get("nombre")?.toString().orEmpty().ifBlank { rfc },
                errorMensaje = t.message ?: "Error indeterminado durante la consulta SAT"
            )
        }.onFailure {
            println("[satbot ${req.jobId}] error notificando fallo por email: ${it.message}")
        }
        ControllerResponse(500, """{"error":"${t.message?.replace("\"", "'")}"}""")
    } finally {
        runCatching { browser?.close() }
    }
}
