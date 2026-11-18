package com.acdan.sat.controllers

import com.acdan.sat.scripts.AuthStore
import com.acdan.sat.scripts.BrandingStore
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.Instant

@JsonIgnoreProperties(ignoreUnknown = true)
data class AvatarFirmaRequest(val token: String = "", val fileType: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
data class AvatarGuardarRequest(val token: String = "", val url: String = "")

/**
 * Foto de perfil de los usuarios del portal (admin y staff).
 *
 * Se sube con URL firmada al mismo bucket que los logos y en el usuario solo
 * se guarda la URL publica.
 */
object AvatarController {
    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun tabla() = env("ACDAN_USERS", required = false, default = "ACDAN_USERS")

    private fun emailDe(token: String): String? =
        AuthStore.verificarJwt(token)?.get("email")?.takeIf { it.isNotBlank() }

    private fun clave(email: String): String =
        "usuarios/" + email.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')

    fun firmar(req: AvatarFirmaRequest): ControllerResponse {
        val email = emailDe(req.token) ?: return ControllerResponse(401, """{"error":"SESION_INVALIDA"}""")
        if (!BrandingStore.configurado()) return ControllerResponse(503, """{"error":"ALMACEN_NO_CONFIGURADO"}""")
        val firma = BrandingStore.firmar(clave(email), req.fileType)
            ?: return ControllerResponse(400, """{"error":"FORMATO_NO_SOPORTADO"}""")
        return ControllerResponse(200, """{"ok":true,"uploadUrl":"${firma.uploadUrl}","publicUrl":"${firma.publicUrl}"}""")
    }

    fun guardar(req: AvatarGuardarRequest): ControllerResponse {
        val email = emailDe(req.token) ?: return ControllerResponse(401, """{"error":"SESION_INVALIDA"}""")
        if (!req.url.trim().startsWith("https://")) return ControllerResponse(400, """{"error":"URL_INVALIDA"}""")
        val item = runCatching { dynamo().getItem(tabla(), "pk", email) }.getOrNull()
            ?: return ControllerResponse(404, """{"error":"USUARIO_NO_ENCONTRADO"}""")
        val merged = item.toMutableMap<String, Any?>()
        merged["avatarUrl"] = req.url.trim()
        merged["updatedAt"] = Instant.now().toString()
        runCatching { dynamo().insertItem(tabla(), merged.mapValues { it.value.toString() }) }
            .getOrElse { return ControllerResponse(500, """{"error":"NO_SE_PUDO_GUARDAR"}""") }
        return ControllerResponse(200, """{"ok":true,"avatarUrl":"${req.url.trim()}"}""")
    }
}
