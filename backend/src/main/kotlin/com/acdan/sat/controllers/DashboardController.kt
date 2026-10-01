package com.acdan.sat.controllers

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Controlador de métricas y estadísticas para el Dashboard principal.
 * Alimenta la vista con resúmenes de dictámenes 32-D, estado de vigencias
 * y métricas agregadas utilizando operaciones eficientes de [DynamoClient].
 */
object DashboardController {

    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun clientesTable() = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
    private fun jobsTable() = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
    private fun docsTable() = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")

    /** Nombres de meses en español para la extracción de fechas de documentos del SAT */
    private val MESES = mapOf(
        "enero" to 1, "febrero" to 2, "marzo" to 3, "abril" to 4, "mayo" to 5, "junio" to 6,
        "julio" to 7, "agosto" to 8, "septiembre" to 9, "setiembre" to 9, "octubre" to 10,
        "noviembre" to 11, "diciembre" to 12
    )

    /**
     * Parsea cadenas de fecha en español emitidas en los PDFs del SAT.
     * Ejemplo: "29 de septiembre de 2026 a las 22:44" -> 2026-09-29.
     *
     * @param s Cadena de texto a procesar.
     * @return [LocalDate] parseado o `null` si no coincide el formato.
     */
    fun parseFechaES(s: String): LocalDate? {
        val m = Regex("(\\d{1,2})\\s*de\\s*([a-zA-ZñÑ]+)\\s*de\\s*(\\d{4})").find(s.lowercase()) ?: return null
        val dia = m.groupValues[1].toIntOrNull() ?: return null
        val mes = MESES[m.groupValues[2]] ?: return null
        val anio = m.groupValues[3].toIntOrNull() ?: return null
        return runCatching { LocalDate.of(anio, mes, dia) }.getOrNull()
    }

    private fun campos(item: Map<String, Any?>): Map<String, String> {
        val raw = item["campos"]?.toString() ?: return emptyMap()
        return Regex("\"([a-zA-Z0-9_]+)\":\"(.*?)\"(?=,|\\})").findAll(raw)
            .associate { it.groupValues[1] to it.groupValues[2] }
    }

    /** RFC de un item, tolerando que el RFC viva en `rfc` o en la clave `pk`. */
    private fun rfcDe(item: Map<String, Any?>): String =
        (item["rfc"]?.toString() ?: item["pk"]?.toString() ?: "").trim().uppercase()

    private fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "'").replace("\n", " ")

    /**
     * Retorna un resumen consolidado por cliente con su último dictamen 32-D.
     * Calcula en tiempo real el sentido del dictamen (positivo/negativo), folio, fecha y días de vigencia restantes.
     *
     * @return [ControllerResponse] con el listado JSON de resúmenes.
     */
    fun resumen(): ControllerResponse {
        val docs = runCatching { dynamo().scanItems(docsTable()) }.getOrDefault(emptyList())
        val clientes = runCatching { dynamo().scanItems(clientesTable()) }.getOrDefault(emptyList())

        // Solo el 32-D más reciente de cada RFC.
        val porRfc = docs
            .filter { it["tipo"]?.toString() == "32d" }
            .groupBy { it["rfc"]?.toString()?.uppercase().orEmpty() }
            .mapValues { (_, lista) -> lista.maxByOrNull { it["createdAt"]?.toString().orEmpty() } }

        val hoy = LocalDate.now()

        val json = clientes.joinToString(",", "[", "]") { c ->
            val rfc = c["rfc"]?.toString()?.uppercase().orEmpty()
            val d = porRfc[rfc]
            val camposMap = d?.let { campos(it) } ?: emptyMap()
            val fecha = parseFechaES(camposMap["fechaEmision"].orEmpty())
            val vence = fecha?.plusDays(30)
            val dias = vence?.let { ChronoUnit.DAYS.between(hoy, it) }
            val sentido = camposMap["sentido"] ?: "sin-dictamen"
            val estado = when {
                d == null -> "sin-correr"
                dias != null && dias < 0 -> "vencido"
                dias != null && dias <= 7 -> "por-vencer"
                dias != null -> "vigente"
                else -> "sin-fecha"
            }
            """{"rfc":"$rfc","sentido":"$sentido","estado":"$estado",
               "folio":"${esc(camposMap["folio"].orEmpty())}","fecha32d":"${esc(camposMap["fechaEmision"].orEmpty())}",
               "diasRestantes":${dias ?: "null"},"docId":"${esc(d?.get("docId")?.toString().orEmpty())}"}"""
                .replace("\n", "")
        }
        return ControllerResponse(200, json)
    }

    /**
     * Retorna las métricas globales y estadisticas de salud del sistema para el Dashboard.
     * Utiliza [DynamoClient.getItemCount] cuando es posible para conteos optimizados.
     *
     * @return [ControllerResponse] con los contadores globales en JSON.
     */
    fun stats(): ControllerResponse {
        val clientes = runCatching { dynamo().scanItems(clientesTable()) }.getOrDefault(emptyList())

        // Solo se cuentan documentos y trabajos de clientes que siguen existiendo:
        // si no, los huérfanos de un cliente borrado inflan los contadores del dashboard.
        val existentes = clientes.map { rfcDe(it) }.filter { it.isNotBlank() }.toSet()

        val docs = runCatching { dynamo().scanItems(docsTable()) }.getOrDefault(emptyList())
            .filter { rfcDe(it) in existentes }
        val jobs = runCatching { dynamo().scanItems(jobsTable()) }.getOrDefault(emptyList())
            .filter { rfcDe(it) in existentes }

        val inicioHoy = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toString()
        val jobsHoy = jobs.count { (it["updatedAt"]?.toString() ?: "") >= inicioHoy }
        val jobsOk = jobs.count { it["status"]?.toString() == "listo" }
        val jobsError = jobs.count { it["status"]?.toString() == "error" }

        val docs32 = docs.filter { it["tipo"]?.toString() == "32d" }
        val porRfc = docs32.groupBy { rfcDe(it) }
            .mapValues { (_, l) -> l.maxByOrNull { it["createdAt"]?.toString().orEmpty() } }
        val positivos = porRfc.values.count { campos(it!!)["sentido"] == "positivo" }
        val negativos = porRfc.values.count { campos(it!!)["sentido"] == "negativo" }

        val hoy = LocalDate.now()
        val porVencer = porRfc.values.count { d ->
            val f = parseFechaES(campos(d!!)["fechaEmision"].orEmpty()) ?: return@count false
            val d2 = ChronoUnit.DAYS.between(hoy, f.plusDays(30))
            d2 in 0..7
        }

        val cuerpo = """{"clientes":${clientes.size},"conCredencial":${clientes.count { it["tieneCiec"]?.toString() == "true" }},
            "docs":${docs.size},"docs32d":${docs32.size},"docsConstancia":${docs.count { it["tipo"]?.toString() == "constancia" }},
            "positivos":$positivos,"negativos":$negativos,"porVencer":$porVencer,
            "jobsHoy":$jobsHoy,"jobsOk":$jobsOk,"jobsError":$jobsError,
            "ultimoJob":"${esc(jobs.maxByOrNull { it["updatedAt"]?.toString().orEmpty() }?.get("jobId")?.toString().orEmpty())}"}"""
            .replace("\n", "")
        return ControllerResponse(200, cuerpo)
    }
}

