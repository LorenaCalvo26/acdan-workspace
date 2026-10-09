package com.acdan.sat.scripts

import com.acdan.sat.controllers.ControllerResponse
import com.acdan.sat.schemas.SatSolicitarRequest
import com.acdan.sat.controllers.SatController
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.shared.annotations.Export
import java.time.Instant
import java.time.YearMonth

// Corre cada hora (jobs.json driver file + @Scheduled) y encola los vencidos.
// Frecuencia por defecto: 32-D cada 25 días (vigencia 30d), constancia cada 90 días.
// El contador la cambia por cliente desde el dash (PUT /clientes/{rfc}/frecuencia).
@Export
val schedulerTick: (Map<String, String>) -> ControllerResponse = {
    val dynamo = app.getInstance(DynamoClient::class)
    val table = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
    val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
    val all = dynamo.scanItems(table)
    // RFCs con corrida en curso: no se re-encolan (evita duplicados y tormentas de reintentos).
    val jobs = dynamo.scanItems(jobsTable)
    val enCurso = jobs
        .filter { it["status"]?.toString() in setOf("queued", "login", "captcha", "descargando", "extrayendo", "consultando_cfdi", "descargando_cfdi") }
        .mapNotNull { it["rfc"]?.toString()?.uppercase() }
        .toMutableSet()
    val docsTable = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
    val historial = dynamo.scanItems(docsTable).filter { it["tipo"]?.toString() == "cfdi-resumen" }
    val cierres = historial.filter { it["estado"]?.toString() == "completo" }
    val ultimoCerrado = CfdiStore.ultimoMesCerrado()
    var encolados = 0
    var omitidos = 0
    val now = Instant.now()
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
        if (item["cfdiMensual"]?.toString() != "false" && mes != null &&
            (ultimoFallo == null || !ultimoFallo.plusSeconds(3600).isAfter(now))) tipos.add("cfdi")
        if (tipos.isNotEmpty()) {
            val resultado = SatController.solicitar(SatSolicitarRequest(rfc, tipos, if ("cfdi" in tipos) mes.toString() else ""))
            if (resultado.statusCode == 200) { encolados++; enCurso.add(rfc) } else omitidos++
        }
    }
    ControllerResponse(200, """{"ok":true,"encolados":$encolados,"omitidos":$omitidos}""")
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
