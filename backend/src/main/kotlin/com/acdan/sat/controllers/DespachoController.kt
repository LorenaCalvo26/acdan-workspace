package com.acdan.sat.controllers

import com.acdan.sat.schemas.RFC_REGEX
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.Instant

data class LogoRequest(val rfc: String = "", val fileType: String = "")
data class LogoGuardarRequest(val rfc: String = "", val url: String = "")

data class DespachoForm(
    val rfc: String = "",
    val nombre: String = "",
    val email: String = "",
    val telefono: String = "",
    val notas: String = ""
)

/**
 * Despachos (cuentas).
 *
 * Pilli se vende por despacho: el despacho es el cliente comercial y su cartera
 * son los contribuyentes que opera. Los clientes sueltos quedan como cartera
 * individual (sin despacho).
 */
object DespachoController {
    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun tabla() = env("ACDAN_DESPACHOS", required = false, default = "ACDAN_DESPACHOS")

    fun listar(): ControllerResponse {
        val items = runCatching { dynamo().scanItems(tabla()) }.getOrDefault(emptyList())
            .sortedBy { it["nombre"]?.toString().orEmpty().lowercase() }
        val json = items.joinToString(",", "[", "]") { item ->
            item.entries.joinToString(",", "{", "}") { (k, v) ->
                "\"${k.replace("\"", "\\\"")}\":\"${v.toString().replace("\"", "\\\"").replace("\n", " ")}\""
            }
        }
        return ControllerResponse(200, """{"ok":true,"items":$json}""")
    }

    fun guardar(form: DespachoForm): ControllerResponse {
        val rfc = form.rfc.trim().uppercase()
        if (!RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        if (form.nombre.trim().isBlank()) return ControllerResponse(400, """{"error":"NOMBRE_REQUERIDO"}""")
        val email = form.email.trim().lowercase()
        if (email.isNotBlank() && !Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(email)) {
            return ControllerResponse(400, """{"error":"EMAIL_INVALIDO"}""")
        }
        val previo = runCatching { dynamo().getItem(tabla(), "pk", rfc) }.getOrNull()
        val item = mutableMapOf<String, String>(
            "pk" to rfc,
            "rfc" to rfc,
            "nombre" to form.nombre.trim(),
            "email" to email,
            "telefono" to form.telefono.trim(),
            "notas" to form.notas.trim(),
            "activo" to (previo?.get("activo")?.toString() ?: "true"),
            "creadoEn" to (previo?.get("creadoEn")?.toString() ?: Instant.now().toString()),
            "updatedAt" to Instant.now().toString()
        )
        dynamo().insertItem(tabla(), item)
        return ControllerResponse(200, """{"ok":true,"rfc":"$rfc"}""")
    }

    /** Firma la subida del logo y devuelve donde subirlo y su URL final. */
    fun logoUrl(req: LogoRequest): ControllerResponse {
        val rfc = req.rfc.trim().uppercase()
        if (!RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        if (!com.acdan.sat.scripts.BrandingStore.configurado()) return ControllerResponse(503, """{"error":"ALMACEN_NO_CONFIGURADO"}""")
        val firma = com.acdan.sat.scripts.BrandingStore.firmar("despachos/" + rfc, req.fileType)
            ?: return ControllerResponse(400, """{"error":"FORMATO_NO_SOPORTADO"}""")
        return ControllerResponse(200, """{"ok":true,"uploadUrl":"${firma.uploadUrl}","publicUrl":"${firma.publicUrl}"}""")
    }

    /** Guarda la URL publica del logo ya subido. */
    fun logoGuardar(req: LogoGuardarRequest): ControllerResponse {
        val rfc = req.rfc.trim().uppercase()
        if (!RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        if (!req.url.trim().startsWith("https://")) return ControllerResponse(400, """{"error":"URL_INVALIDA"}""")
        val item = runCatching { dynamo().getItem(tabla(), "pk", rfc) }.getOrNull()
            ?: return ControllerResponse(404, """{"error":"DESPACHO_NO_ENCONTRADO"}""")
        val merged = item.toMutableMap<String, Any?>()
        merged["logoUrl"] = req.url.trim()
        merged["updatedAt"] = java.time.Instant.now().toString()
        runCatching { dynamo().insertItem(tabla(), merged.mapValues { it.value.toString() }) }
            .getOrElse { return ControllerResponse(500, """{"error":"NO_SE_PUDO_GUARDAR"}""") }
        return ControllerResponse(200, """{"ok":true,"rfc":"$rfc","logoUrl":"${req.url.trim()}"}""")
    }

    fun eliminar(rfc: String): ControllerResponse {
        val key = rfc.trim().uppercase()
        if (key.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUERIDO"}""")
        // Los clientes de la cartera no se borran: quedan como individuales.
        runCatching { dynamo().deleteItem(tabla(), mapOf("pk" to key)) }
        return ControllerResponse(200, """{"ok":true,"rfc":"$key"}""")
    }
}
