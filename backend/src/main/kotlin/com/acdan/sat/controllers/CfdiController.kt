package com.acdan.sat.controllers

import com.acdan.sat.schemas.RFC_REGEX
import com.acdan.sat.schemas.SatSolicitarRequest
import com.acdan.sat.scripts.AuthStore
import com.acdan.sat.scripts.CfdiPendiente
import com.acdan.sat.scripts.CfdiStore
import com.acdan.sat.scripts.DocStore
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.YearMonth
import java.util.Base64

data class CfdiConsulta(val token: String = "", val rfc: String = "", val periodo: String = "", val vista: String = "")
data class CfdiArchivo(val token: String = "", val rfc: String = "", val docId: String = "", val formato: String = "pdf")
data class CfdiTotales(val token: String = "", val rfc: String = "", val periodo: String = "",
                       val corte: String = "", val fuente: String = "manual", val totales: Map<String, String> = emptyMap())

data class CfdiPaquete(val token: String = "", val rfc: String = "", val periodo: String = "", val vista: String = "")

object CfdiController {
    private val mapper = jacksonObjectMapper()
    private fun db() = app.getInstance(DynamoClient::class)
    private fun tabla() = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
    private fun rfcAutorizado(token: String, solicitado: String): String? {
        val claims = runCatching { AuthStore.verificarJwt(token) }.getOrNull() ?: return null
        return when (claims["rol"]) {
            "ADMIN", "OPERADOR" -> solicitado.trim().uppercase().takeIf { RFC_REGEX.matches(it) }
            "CLIENTE" -> PortalController.rfcDeSesion(token)?.takeIf { solicitado.isBlank() || it == solicitado.uppercase() }
            else -> null
        }
    }
    private fun respuesta(cuerpo: Any, status: Int = 200) = ControllerResponse(status, mapper.writeValueAsString(cuerpo))

    fun listar(req: CfdiConsulta): ControllerResponse {
        val rfc = rfcAutorizado(req.token, req.rfc) ?: return respuesta(mapOf("error" to "TOKEN_O_RFC_INVALIDO"), 401)
        val periodo = if (req.periodo.isBlank()) CfdiStore.ultimoMesCerrado() else runCatching { YearMonth.parse(req.periodo) }.getOrNull()
            ?: return respuesta(mapOf("error" to "PERIODO_INVALIDO"), 400)
        val todos = db().scanItems(tabla()).filter { it["rfc"]?.toString() == rfc && it["tipo"]?.toString() in setOf("cfdi", "cfdi-resumen") }
        val registros = todos.filter { it["tipo"]?.toString() == "cfdi" && it["periodo"]?.toString() == periodo.toString() }
            .map { item -> item.mapValues { it.value.toString() }.toMutableMap<String, Any>().apply {
                this["campos"] = mapper.readValue(item["campos"].toString(), Map::class.java)
                this["xmlDatos"] = item["xmlDatos"]?.toString()?.let { mapper.readValue(it, Map::class.java) } ?: emptyMap<String, Any>()
            } }.sortedBy { (it["campos"] as Map<*, *>)["Fecha de Emisión"].toString() }
        val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
        val ultimoJob = db().scanItems(jobsTable).filter { it["rfc"]?.toString() == rfc && it["periodo"]?.toString() == periodo.toString() && "cfdi" in it["tipos"].toString().split(",") }
            .maxByOrNull { it["updatedAt"].toString() }
        return respuesta(mapOf("rfc" to rfc, "periodo" to periodo.toString(), "items" to registros,
            "periodos" to (todos.mapNotNull { it["periodo"]?.toString() } + periodo.toString()).distinct().sortedDescending(),
            "resumen" to todos.firstOrNull { it["tipo"]?.toString() == "cfdi-resumen" && it["periodo"]?.toString() == periodo.toString() },
            "job" to ultimoJob))
    }

    /**
     * Paquete del mes en ZIP con la estructura {RFC}/{periodo}/{vista}/{xml|pdf}/{uuid}.ext
     * Usa los archivos custodiados en S3; no vuelve a consultar al SAT.
     */
    fun paquete(req: CfdiPaquete): ControllerResponse {
        val rfc = rfcAutorizado(req.token, req.rfc) ?: return respuesta(mapOf("error" to "TOKEN_O_RFC_INVALIDO"), 401)
        val periodo = if (req.periodo.isBlank()) CfdiStore.ultimoMesCerrado()
            else runCatching { YearMonth.parse(req.periodo) }.getOrNull()
            ?: return respuesta(mapOf("error" to "PERIODO_INVALIDO"), 400)
        val vistaFiltro = req.vista.trim().lowercase()
        if (vistaFiltro.isNotBlank() && vistaFiltro !in setOf("emitidas", "recibidas")) {
            return respuesta(mapOf("error" to "VISTA_INVALIDA"), 400)
        }
        val items = db().scanItems(tabla())
            .filter { it["tipo"]?.toString() == "cfdi" && it["rfc"]?.toString() == rfc && it["periodo"]?.toString() == periodo.toString() }
            .filter { vistaFiltro.isBlank() || it["vista"]?.toString() == vistaFiltro }
        if (items.isEmpty()) return respuesta(mapOf("error" to "SIN_ARCHIVOS"), 404)

        val maximo = 7_000_000L
        var total = 0L
        var incluidos = 0
        var excedido = false
        val buffer = java.io.ByteArrayOutputStream()
        java.util.zip.ZipOutputStream(buffer).use { zip ->
            for (item in items) {
                if (excedido) break
                val vista = item["vista"]?.toString() ?: continue
                val folio = item["folio"]?.toString()?.uppercase() ?: continue
                for (ext in listOf("xml", "pdf")) {
                    val disponible = item["${ext}Disponible"]?.toString() == "true" || item["${ext}Guardado"]?.toString() == "true"
                    if (!disponible) continue
                    val nombre = "$folio.$ext"
                    val bytes = DocStore.bytesCfdi(rfc, periodo.toString(), vista, nombre) ?: continue
                    if (total + bytes.size > maximo) { excedido = true; break }
                    zip.putNextEntry(java.util.zip.ZipEntry("$rfc/$periodo/$vista/$ext/$nombre"))
                    zip.write(bytes)
                    zip.closeEntry()
                    total += bytes.size
                    incluidos++
                }
            }
        }
        if (excedido) return respuesta(mapOf("error" to "PAQUETE_MUY_GRANDE",
            "detalle" to "El paquete supera 7 MB. Descarga por vista o divide el periodo."), 413)
        if (incluidos == 0) return respuesta(mapOf("error" to "SIN_ARCHIVOS"), 404)

        val zipBytes = buffer.toByteArray()
        val archivo = listOf(rfc, periodo.toString(), vistaFiltro.ifBlank { "todas" }).joinToString("-") + ".zip"
        return respuesta(mapOf("ok" to true, "archivo" to archivo, "rfc" to rfc, "periodo" to periodo.toString(),
            "vista" to vistaFiltro.ifBlank { "todas" }, "archivos" to incluidos, "bytes" to zipBytes.size,
            "mime" to "application/zip", "base64" to Base64.getEncoder().encodeToString(zipBytes)))
    }
    /**
     * Devuelve la captura del portal del SAT que respalda el conteo del mes.
     * Solo personal: es evidencia de auditoría, no información del cliente.
     */
    fun evidencia(req: CfdiConsulta): ControllerResponse {
        val claims = runCatching { AuthStore.verificarJwt(req.token) }.getOrNull()
        if (claims?.get("rol") !in setOf("ADMIN", "OPERADOR")) return respuesta(mapOf("error" to "SOLO_PERSONAL"), 401)
        val rfc = rfcAutorizado(req.token, req.rfc) ?: return respuesta(mapOf("error" to "TOKEN_O_RFC_INVALIDO"), 401)
        val periodo = if (req.periodo.isBlank()) CfdiStore.ultimoMesCerrado()
            else runCatching { YearMonth.parse(req.periodo) }.getOrNull()
            ?: return respuesta(mapOf("error" to "PERIODO_INVALIDO"), 400)
        val vista = req.vista.trim().lowercase().ifBlank { "emisor" }
        val resumen = db().getItem(tabla(), "pk", "cfdi-mes-$rfc-$periodo")?.mapValues { it.value.toString() }
            ?: return respuesta(mapOf("error" to "SIN_CIERRE"), 404)
        @Suppress("UNCHECKED_CAST")
        val mapa = runCatching { mapper.readValue(resumen["evidencias"] ?: "{}", Map::class.java) as Map<String, Any> }.getOrNull()
            ?: return respuesta(mapOf("error" to "SIN_EVIDENCIA"), 404)
        val raw = mapa[vista]?.toString() ?: return respuesta(mapOf("error" to "SIN_EVIDENCIA"), 404)
        @Suppress("UNCHECKED_CAST")
        val meta = runCatching { mapper.readValue(raw, Map::class.java) as Map<String, Any> }.getOrNull()
            ?: return respuesta(mapOf("error" to "SIN_EVIDENCIA"), 404)
        val clave = meta["clave"]?.toString() ?: return respuesta(mapOf("error" to "SIN_EVIDENCIA"), 404)
        val bytes = DocStore.leerEvidencia(clave) ?: return respuesta(mapOf("error" to "EVIDENCIA_NO_DISPONIBLE"), 404)
        return respuesta(mapOf("ok" to true, "rfc" to rfc, "periodo" to periodo.toString(), "vista" to vista,
            "conteo" to meta["conteo"], "fecha" to meta["fecha"], "jobId" to meta["jobId"],
            "mime" to "image/png", "bytes" to bytes.size,
            "base64" to Base64.getEncoder().encodeToString(bytes)))
    }
    fun sincronizar(req: CfdiConsulta): ControllerResponse {
        val claims = runCatching { AuthStore.verificarJwt(req.token) }.getOrNull()
        if (claims?.get("rol") !in setOf("ADMIN", "OPERADOR")) return respuesta(mapOf("error" to "SOLO_PERSONAL"), 401)
        val rfc = rfcAutorizado(req.token, req.rfc) ?: return respuesta(mapOf("error" to "RFC_INVALIDO"), 400)
        return SatController.solicitar(SatSolicitarRequest(rfc, listOf("cfdi"), req.periodo))
    }

    /** Reprocesa los XML locales de un RFC/periodo (personal) sin volver a pegarle al SAT. */
    fun reprocesar(req: CfdiConsulta): ControllerResponse {
        val claims = runCatching { AuthStore.verificarJwt(req.token) }.getOrNull()
        if (claims?.get("rol") !in setOf("ADMIN", "OPERADOR")) return respuesta(mapOf("error" to "SOLO_PERSONAL"), 401)
        val rfc = rfcAutorizado(req.token, req.rfc) ?: return respuesta(mapOf("error" to "RFC_INVALIDO"), 400)
        val periodo = if (req.periodo.isBlank()) CfdiStore.ultimoMesCerrado() else runCatching { YearMonth.parse(req.periodo) }.getOrNull()
            ?: return respuesta(mapOf("error" to "PERIODO_INVALIDO"), 400)
        return respuesta(mapOf("rfc" to rfc, "periodo" to periodo.toString()) + CfdiStore.reprocesar(rfc, periodo))
    }

    /** Guarda los totales oficiales del SAT para conciliar (personal). */
    fun guardarTotales(req: CfdiTotales): ControllerResponse {
        val claims = runCatching { AuthStore.verificarJwt(req.token) }.getOrNull()
        if (claims?.get("rol") !in setOf("ADMIN", "OPERADOR")) return respuesta(mapOf("error" to "SOLO_PERSONAL"), 401)
        val rfc = rfcAutorizado(req.token, req.rfc) ?: return respuesta(mapOf("error" to "RFC_INVALIDO"), 400)
        val periodo = runCatching { YearMonth.parse(req.periodo) }.getOrNull()
            ?: return respuesta(mapOf("error" to "PERIODO_INVALIDO"), 400)
        return respuesta(mapOf("rfc" to rfc) + CfdiStore.guardarTotales(rfc, periodo, req.totales, req.corte, req.fuente))
    }

    fun archivo(req: CfdiArchivo): ControllerResponse {        val rfc = rfcAutorizado(req.token, req.rfc) ?: return respuesta(mapOf("error" to "TOKEN_O_RFC_INVALIDO"), 401)
        if (req.formato !in setOf("xml", "pdf", "acuse")) return respuesta(mapOf("error" to "FORMATO_INVALIDO"), 400)
        val row = db().getItem(tabla(), "pk", req.docId)?.takeIf { it["tipo"]?.toString() == "cfdi" && it["rfc"]?.toString() == rfc }
            ?: return respuesta(mapOf("error" to "CFDI_NO_ENCONTRADO"), 404)
        val p = CfdiPendiente(req.docId, rfc, YearMonth.parse(row["periodo"].toString()), row["vista"].toString(),
            java.util.UUID.fromString(row["folio"].toString()).toString().uppercase(), emptyMap())
        var file = CfdiStore.archivo(p, req.formato)
        if (!file.isFile) DocStore.restaurarCfdi(file, rfc, row["periodo"].toString(), row["vista"].toString(), file.name)
        if (!file.isFile) {
            DocStore.traerCfdiTemporal(rfc, row["periodo"].toString(), row["vista"].toString(), file.name)?.let { file = it }
        }
        if (row[req.formato + "Guardado"]?.toString() != "true" || !file.isFile) return respuesta(mapOf("error" to "ARCHIVO_NO_DISPONIBLE"), 404)
        return respuesta(mapOf("ok" to true, "nombre" to file.name, "mime" to if (req.formato == "xml") "application/xml" else "application/pdf",
            "base64" to Base64.getEncoder().encodeToString(file.readBytes())))
    }
}
