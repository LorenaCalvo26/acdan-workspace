package com.acdan.sat.scripts

import com.acdan.sat.controllers.ControllerResponse
import com.acdan.sat.schemas.SatSolicitarRequest
import com.acdan.sat.controllers.SatController
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.shared.annotations.Export
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth

private class PendienteScheduler(
    val item: Map<String, Any>,
    val tipos: List<String>,
    val mes: String
)

// Corre cada hora (jobs.json driver file + @Scheduled) y encola los vencidos.
// La próxima corrida es una fecha mensual elegida por el contador; después de
// cada éxito se repite el mismo día (ver Programacion.kt). Los clientes antiguos
// sin `programacion=mensual` conservan su frecuencia en días.
//
// Prioridad: el orden guardado en `ordenCfdi` solo se usa para los CFDI
// pendientes. No adelanta fechas ni cambia la programación de 32-D/constancia.
@Export
val schedulerTick: (Map<String, String>) -> ControllerResponse = {
    val dynamo = app.getInstance(DynamoClient::class)
    val table = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
    val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
    val all = dynamo.scanItems(table)
    // Un trabajo que lleva demasiado tiempo "en curso" significa que el robot
    // murió a media corrida (se apagó, se quedó sin memoria, falló el arranque).
    // Se marca como error para que no bloquee al cliente para siempre: el
    // barrido ocurre antes de calcular `enCurso`, así el mismo tick lo reencola.
    val timeoutMin = env("JOB_TIMEOUT_MIN", required = false, default = "30").toLongOrNull() ?: 30L
    val limite = Instant.now().minusSeconds(timeoutMin * 60)
    val enProgreso = setOf("queued", "login", "captcha", "descargando", "extrayendo", "consultando_cfdi", "descargando_cfdi")
    // Solo se da por muerto lo que YA estaba corriendo. Un trabajo "en cola"
    // puede llevar horas esperando su turno en una cartera grande: marcarlo
    // como fallido seria castigar a quien nunca se intento.
    val corriendoDeVerdad = enProgreso - "queued"
    var liberados = 0
    val jobsCrudos = dynamo.scanItems(jobsTable)
    val jobs = jobsCrudos.map { item ->
        val estado = item["status"]?.toString().orEmpty()
        val visto = runCatching { Instant.parse(item["updatedAt"].toString()) }.getOrNull()
        if (estado in corriendoDeVerdad && visto != null && visto.isBefore(limite)) {
            liberados++
            val actualizado = item.mapValues { it.value.toString() } + mapOf(
                "status" to "error",
                "motivo" to "sin_senal_del_robot",
                "updatedAt" to Instant.now().toString()
            )
            runCatching { dynamo.insertItem(jobsTable, actualizado) }
            actualizado
        } else item
    }
    // RFCs con corrida en curso: no se re-encolan (evita duplicados y tormentas de reintentos).
    val enCurso = jobs
        .filter { it["status"]?.toString() in enProgreso }
        .mapNotNull { it["rfc"]?.toString()?.uppercase() }
        .toMutableSet()
    val docsTable = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
    val historial = dynamo.scanItems(docsTable).filter { it["tipo"]?.toString() == "cfdi-resumen" }
    val cierres = historial.filter { it["estado"]?.toString() == "completo" }
    val ultimoCerrado = CfdiStore.ultimoMesCerrado()
    var encolados = 0
    var omitidos = 0
    val now = Instant.now()
    val cfg = CfdiConfigStore.leer()
    val hoy = LocalDate.now(Programacion.zona)
    val pendientes = mutableListOf<PendienteScheduler>()

    all.forEach { item ->
        val activo = item["activo"] != "false"
        if (!activo || item["tieneCiec"]?.toString() == "false") return@forEach
        val rfc = item["rfc"].toString().uppercase()
        if (rfc in enCurso) { omitidos++; return@forEach }
        val proximo = runCatching { Instant.parse(item["proximoRun"].toString()) }.getOrNull()
        val tipos = mutableListOf<String>()
        if (proximo == null || !proximo.isAfter(now)) {
            tipos.addAll(item["tipos"]?.toString()?.split(",")?.filter { it in setOf("constancia", "32d") } ?: listOf("constancia", "32d"))
        }
        val desde = runCatching { YearMonth.parse(item["cfdiDesde"].toString()) }.getOrNull()
            ?: historial.filter { it["rfc"]?.toString() == rfc }.mapNotNull { runCatching { YearMonth.parse(it["periodo"].toString()) }.getOrNull() }.minOrNull()
            ?: ultimoCerrado
        if (item["cfdiDesde"] == null && item["cfdiMensual"]?.toString() != "false")
            dynamo.insertItem(table, item.mapValues { it.value.toString() } + ("cfdiDesde" to desde.toString()))
        val completos = cierres.filter { it["rfc"]?.toString() == rfc }.mapNotNull { runCatching { YearMonth.parse(it["periodo"].toString()) }.getOrNull() }.toSet()
        val mes = CfdiMonthly.pendiente(desde, ultimoCerrado, completos)
        val ultimoFallo = jobs.filter { it["rfc"]?.toString() == rfc && it["periodo"]?.toString() == mes.toString() && it["status"]?.toString() in setOf("error", "parcial") }
            .mapNotNull { runCatching { Instant.parse(it["updatedAt"].toString()) }.getOrNull() }.maxOrNull()
        val fallosDelMes = if (mes == null) 0 else jobs.count {
            it["rfc"]?.toString()?.uppercase() == rfc && it["periodo"]?.toString() == mes.toString() &&
                it["status"]?.toString() in setOf("error", "parcial")
        }
        if (item["cfdiMensual"]?.toString() != "false" && mes != null &&
            hoy.dayOfMonth >= cfg.dia && fallosDelMes < cfg.reintentos &&
            (ultimoFallo == null || !ultimoFallo.plusSeconds(3600).isAfter(now))) tipos.add("cfdi")
        if (tipos.isNotEmpty()) {
            pendientes.add(PendienteScheduler(item, tipos.toList(), if ("cfdi" in tipos) mes.toString() else ""))
        }
    }

    // Primero los CFDI, en el orden que eligió la contadora. Los trabajos que
    // no incluyen CFDI mantienen el orden natural de Dynamo.
    val cfdi = pendientes
        .filter { "cfdi" in it.tipos }
        .sortedWith(compareBy(
            { it.item["ordenCfdi"]?.toString()?.toLongOrNull() ?: Long.MAX_VALUE },
            { it.item["rfc"]?.toString().orEmpty() }
        ))
    val resto = pendientes.filter { "cfdi" !in it.tipos }

    (cfdi + resto).forEach { p ->
        val rfc = p.item["rfc"].toString().uppercase()
        val resultado = SatController.solicitar(SatSolicitarRequest(rfc, p.tipos, p.mes))
        if (resultado.statusCode == 200) { encolados++; enCurso.add(rfc) } else omitidos++
    }

    // En Lambda (ROLE=api) encendemos un worker on-demand si quedó trabajo.
    // En el servidor local/worker (ROLE=all) el propio worker ya está escuchando.
    if (encolados > 0) EcsScaler.ensureWorker()

    // Paquetes del mes: si una cartera ya terminó de operar, se avisa al despacho.
    // Una cartera por tick para no agotar el tiempo de la Lambda.
    val paquetes = runCatching { com.acdan.sat.scripts.PaqueteAutomatico.revisar(ultimoCerrado, maximo = 1) }
        .getOrDefault(emptyList())

    // Si hay trabajo vencido y el robot lleva horas sin completar nada, algo se
    // rompió (llave vencida, tareas que no arrancan). Se avisa una vez al día.
    val aviso = runCatching { avisarBotDetenido(all, jobs, docsTable, now) }.getOrDefault(false)

    ControllerResponse(200, """{"ok":true,"encolados":$encolados,"omitidos":$omitidos,"liberados":$liberados,"aviso":$aviso,"paquetes":"${paquetes.joinToString(",")}"}""")
}

/**
 * true si toca mandar el aviso. Deja una marca diaria para no repetirlo cada hora.
 */
private fun avisarBotDetenido(
    clientes: List<Map<String, Any?>>,
    jobs: List<Map<String, Any?>>,
    docsTable: String,
    now: Instant
): Boolean {
    val horas = env("ALERTA_SIN_CORRER_HORAS", required = false, default = "6").toLongOrNull() ?: 6L
    val vencidos = clientes.count { c ->
        val activo = c["activo"] != "false" && c["tieneCiec"]?.toString() != "false"
        val prox = runCatching { Instant.parse(c["proximoRun"].toString()) }.getOrNull()
        activo && prox != null && !prox.isAfter(now)
    }
    if (vencidos == 0) return false

    val ultimoExito = jobs
        .filter { it["status"]?.toString() in setOf("listo") }
        .mapNotNull { runCatching { Instant.parse(it["updatedAt"].toString()) }.getOrNull() }
        .maxOrNull()
    if (ultimoExito != null && ultimoExito.isAfter(now.minusSeconds(horas * 3600))) return false

    val dynamo = app.getInstance(DynamoClient::class)
    val marca = "alerta-bot#" + LocalDate.now(Programacion.zona).toString()
    val yaAvisado = runCatching { dynamo.getItem(docsTable, "pk", marca) }.getOrNull() != null
    if (yaAvisado) return false

    val ultima = ultimoExito?.atZone(Programacion.zona)?.format(
        java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
    ) ?: "nunca"
    EmailNotifier.notificarBotDetenido(vencidos, ultima, horas)
    runCatching {
        dynamo.insertItem(docsTable, mapOf(
            "pk" to marca,
            "tipo" to "alerta-bot",
            "vencidos" to vencidos.toString(),
            "createdAt" to now.toString()
        ))
    }
    return true
}

/** El servidor local ejecuta el mismo tick que EventBridge, una vez por hora. */
object SchedulerRuntime {
    private var started = false
    @Synchronized fun start() {
        if (started || env("ACDAN_SCHEDULER_ENABLED", required = false, default = "true") != "true") return
        started = true
        val executor = java.util.concurrent.Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "acdan-monthly-scheduler").apply { isDaemon = true }
        }
        executor.scheduleWithFixedDelay({ runCatching { schedulerTick(emptyMap()) }
            .onFailure { println("[scheduler] ${it.message}") } }, 60, 3600, java.util.concurrent.TimeUnit.SECONDS)
    }
}
