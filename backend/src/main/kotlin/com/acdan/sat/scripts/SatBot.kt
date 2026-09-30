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
    val tipos: List<String> = listOf("constancia", "32d")
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
    val maxRetries = env("SAT_MAX_CAPTCHA_RETRIES", required = false, default = "3").toInt()
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

    fun setStatus(status: String, error: String? = null, intento: Int = 0) {
        dynamo.insertItem(jobsTable, mapOf(
            "pk" to req.jobId, "jobId" to req.jobId, "rfc" to rfc,
            "tipos" to req.tipos.joinToString(","), "status" to status,
            "intentoCaptcha" to intento.toString(), "error" to (error ?: ""),
            "updatedAt" to Instant.now().toString()
        ))
    }

    var browser: SatBrowser? = null
    try {
        val ciec = secrets.getOrNull("sat:$rfc")
            ?: throw Exception("Sin Contraseña/CIEC en Secrets para sat:$rfc. Alta el cliente de nuevo.")
        setStatus("login")

        browser = SatBrowser(headless)
        val b = browser
        if (!b.navigate(startUrl)) throw Exception("No cargó la página de login SAT")

        // Selectores exactos del login SAT (ver DOM dump 2026-09-30):
        // inputs Ecom_User_ID#rfc, Ecom_Password#password, userCaptcha#userCaptcha,
        // captcha = único img data-uri, submit = input[type=submit] (NO button: ese es e.firma).
        val rfcSel = "#rfc"
        val passSel = "#password"
        val captchaInputSel = "#userCaptcha"
        val submitSel = "input[type='submit']"

        if (!b.waitFor(rfcSel)) throw Exception("No cargó el form SAT (selector RFC)")
        println("[satbot ${req.jobId}] DOM: " + b.dumpDom())
        b.fill(rfcSel, rfc)
        b.fill(passSel, ciec)

        var logged = false
        val debugDir = File("./storage/debug").apply { mkdirs() }
        // Dos presupuestos separados:
        //  - lecturas: pedir imagen y resolverla NO cuenta como intento fallido del SAT,
        //    así que se pueden hacer varias (maxCaptchaLecturas) hasta obtener 6 caracteres.
        //  - logins: cada submit al SAT sí puede terminar en bloqueo de cuenta, por eso
        //    son pocos y solo se usan con un código que ya pasó la validación de largo.
        // Pedir imagen y resolverla NO es un intento de login, así que el presupuesto de
        // lecturas es amplio: solo se "gasta" cuando el código pasa el quorum de 3 votos.
        // Con ~1 de cada 3 imágenes cumpliendo quorum, 14 lecturas ~ 4-5 logins válidos.
        val maxCaptchaLecturas = env("SAT_CAPTCHA_LECTURAS", required = false, default = "14").toInt()
        val maxLogins = env("SAT_MAX_LOGINS", required = false, default = "4").toInt()
        var loginsUsados = 0
        var lecturasHechas = 0

        while (loginsUsados < maxLogins) {
            // --- Fase 1: conseguir un código de exactamente 6 caracteres ---
            var code = ""
            while (code.isBlank() && lecturasHechas < maxCaptchaLecturas) {
                lecturasHechas++
                setStatus("captcha", intento = loginsUsados + 1)
                println("[satbot ${req.jobId}] fill rfc=" + b.fill(rfcSel, rfc) + " fill pass=" + b.fill(passSel, ciec))
                val imgBytes = b.captchaDataUriBytes() ?: b.screenshotCaptcha("img[src^='data:image']")
                if (imgBytes == null) {
                    println("[satbot ${req.jobId}] lectura $lecturasHechas: NO encontró imagen captcha")
                } else {
                    println("[satbot ${req.jobId}] lectura $lecturasHechas: captchaBytes=${imgBytes.size} (logins=$loginsUsados/$maxLogins)")
                    File(debugDir, "${req.jobId}-captcha-$lecturasHechas.png").writeBytes(imgBytes)
                    val lectura = runCatching { CaptchaSolver.solve(imgBytes) }
                        .getOrElse { CaptchaSolver.Lectura("", emptyList(), false) }
                    code = lectura.code
                    if (code.isNotBlank()) {
                        File(debugDir, "${req.jobId}-captcha-$lecturasHechas-solucion.png").writeBytes(
                            CaptchaSolver.preprocess(imgBytes)
                        )
                    }
                    println("[satbot ${req.jobId}] lectura $lecturasHechas: lecturas=${lectura.lecturas} consenso=${lectura.consensoAlto} -> code='$code'")
                }

                if (code.isBlank()) {
                    // Lectura descartada: el SAT siempre manda 6, así que esto ya es un
                    // código malo. No se envía: se recarga la página por una imagen nueva,
                    // lo cual NO cuenta como intento de login.
                    println("[satbot ${req.jobId}] lectura $lecturasHechas: no salió un código de 6, se pide otra imagen (sin gastar login)")
                    Thread.sleep(1500)
                    if (!b.navigate(startUrl)) break
                    if (!b.waitFor(rfcSel)) break
                }
            }

            if (code.isBlank()) {
                throw Exception("No se obtuvo un captcha de ${CaptchaSolver.LARGO_ESPERADO} caracteres en $lecturasHechas lecturas")
            }

            // --- Fase 2: usar ese código. Aquí sí se gasta un intento del SAT ---
            val typed = b.typeCaptcha(captchaInputSel, code)
            val enInput = b.readValue(captchaInputSel)
            println("[satbot ${req.jobId}] login ${loginsUsados + 1}/$maxLogins: typeCaptcha=$typed enInput='$enInput' (code='$code')")
            b.screenshot()?.let { File(debugDir, "${req.jobId}-page-${loginsUsados + 1}.png").writeBytes(it) }
            println("[satbot ${req.jobId}] login ${loginsUsados + 1}: click submit=" + b.click(submitSel))
            loginsUsados++
            Thread.sleep(10000)
            val url = b.currentUrl()
            val txt = b.pageText()
            println("[satbot ${req.jobId}] login $loginsUsados: url post-submit=$url")
            println("[satbot ${req.jobId}] login $loginsUsados: SAT dice: " + txt.take(400))
            // Login OK si: salimos del form login, o desapareció el input captcha,
            // o aparece Welcome + RFC (landing post-login de NAM).
            // (NO usar hasPdfFrame aquí: la página de login trae un iframe oculto.)
            if (!url.contains("/nidp/app/login") || !b.exists("#userCaptcha") || txt.contains("Welcome", true)) {
                logged = true
                break
            }
            Thread.sleep(2000)
        }
        if (!logged) throw Exception("Login fallido tras $loginsUsados intentos de captcha (cada uno con un código de 6 caracteres)")

        val docIds = mutableListOf<String>()
        req.tipos.forEach { tipo ->
            setStatus("descargando")
            // Tras login la app auto-navega a #/reporteOpinion32DContribuyente y ahí
            // abre el PDF en un visor (con modal en #modal-root). Navegar a esa ruta.
            if (tipo == "32d" && !b.currentUrl().contains("reporteOpinion32D")) {
                b.navigate("https://ptsc32d.clouda.sat.gob.mx/#/reporteOpinion32DContribuyente")
            }
            println("[satbot ${req.jobId}] $tipo: url=" + b.currentUrl() + " pdfFrame=" + b.hasPdfFrame())
            Thread.sleep(8000)
            println("[satbot ${req.jobId}] $tipo: APP: " + b.dumpApp())
            b.screenshot()?.let { File("./storage/debug/${req.jobId}-$tipo-landing.png").writeBytes(it) }
            var pdf: ByteArray? = null
            val deadline = System.currentTimeMillis() + 180_000
            var ticks = 0
            while (System.currentTimeMillis() < deadline && pdf == null) {
                val frame = b.hasPdfFrame()
                if (frame) {
                    pdf = b.downloadPdfBytes()
                    if (pdf != null) {
                        println("[satbot ${req.jobId}] $tipo: PDF bajado, ${pdf.size} bytes")
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
        }
        setStatus("listo")
        ControllerResponse(200, """{"ok":true,"jobId":"${req.jobId}","docs":${docIds.size}}""")
    } catch (t: Throwable) {
        setStatus("error", t.message)
        ControllerResponse(500, """{"error":"${t.message?.replace("\"", "'")}"}""")
    } finally {
        runCatching { browser?.close() }
    }
}
