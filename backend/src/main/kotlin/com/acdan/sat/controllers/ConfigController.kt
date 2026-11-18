package com.acdan.sat.controllers

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.acdan.sat.scripts.AuthStore
import com.acdan.sat.scripts.CfdiConfigStore

@JsonIgnoreProperties(ignoreUnknown = true)
data class ConfigRequest(val token: String = "", val dia: Int = 0, val reintentos: Int = -1)

@JsonIgnoreProperties(ignoreUnknown = true)
data class LogoPilliRequest(val token: String = "", val fileType: String = "", val url: String = "")

/**
 * Configuración de la corrida mensual de CFDI. Solo ADMIN: define el día a
 * partir del cual se permite la descarga automática y cuántos reintentos hace.
 */
object ConfigController {
    private fun esAdmin(token: String): Boolean {
        val c = runCatching { AuthStore.verificarJwt(token) }.getOrNull() ?: return false
        return c["rol"] == "ADMIN"
    }

    fun leer(req: ConfigRequest): ControllerResponse {
        if (!esAdmin(req.token)) return ControllerResponse(401, """{"error":"SOLO_ADMIN"}""")
        val cfg = CfdiConfigStore.leer()
        return ControllerResponse(200, """{"ok":true,"dia":${cfg.dia},"reintentos":${cfg.reintentos}}""")
    }

    /** Firma la subida del logo de Pilli (solo admin). */
    fun logoUrlPilli(req: LogoPilliRequest): ControllerResponse {
        if (!esAdmin(req.token)) return ControllerResponse(401, """{"error":"SOLO_ADMIN"}""")
        if (!com.acdan.sat.scripts.BrandingStore.configurado()) return ControllerResponse(503, """{"error":"ALMACEN_NO_CONFIGURADO"}""")
        val firma = com.acdan.sat.scripts.BrandingStore.firmar("pilli", req.fileType)
            ?: return ControllerResponse(400, """{"error":"FORMATO_NO_SOPORTADO"}""")
        return ControllerResponse(200, """{"ok":true,"uploadUrl":"${firma.uploadUrl}","publicUrl":"${firma.publicUrl}"}""")
    }

    /** Guarda la URL del logo de Pilli ya subido. */
    fun logoGuardarPilli(req: LogoPilliRequest): ControllerResponse {
        if (!esAdmin(req.token)) return ControllerResponse(401, """{"error":"SOLO_ADMIN"}""")
        if (!req.url.trim().startsWith("https://")) return ControllerResponse(400, """{"error":"URL_INVALIDA"}""")
        if (!com.acdan.sat.scripts.BrandingStore.guardarLogoPilli(req.url)) {
            return ControllerResponse(500, """{"error":"NO_SE_PUDO_GUARDAR"}""")
        }
        return ControllerResponse(200, """{"ok":true,"logoUrl":"${req.url.trim()}"}""")
    }

    fun guardar(req: ConfigRequest): ControllerResponse {
        if (!esAdmin(req.token)) return ControllerResponse(401, """{"error":"SOLO_ADMIN"}""")
        if (req.dia !in 1..28) return ControllerResponse(400, """{"error":"DIA_INVALIDO"}""")
        if (req.reintentos !in 0..5) return ControllerResponse(400, """{"error":"REINTENTOS_INVALIDOS"}""")
        val cfg = CfdiConfigStore.guardar(req.dia, req.reintentos)
        return ControllerResponse(200, """{"ok":true,"dia":${cfg.dia},"reintentos":${cfg.reintentos}}""")
    }
}
