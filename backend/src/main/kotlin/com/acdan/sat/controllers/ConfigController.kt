package com.acdan.sat.controllers

import com.acdan.sat.scripts.AuthStore
import com.acdan.sat.scripts.CfdiConfigStore

data class ConfigRequest(val token: String = "", val dia: Int = 0, val reintentos: Int = -1)

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

    fun guardar(req: ConfigRequest): ControllerResponse {
        if (!esAdmin(req.token)) return ControllerResponse(401, """{"error":"SOLO_ADMIN"}""")
        if (req.dia !in 1..28) return ControllerResponse(400, """{"error":"DIA_INVALIDO"}""")
        if (req.reintentos !in 0..5) return ControllerResponse(400, """{"error":"REINTENTOS_INVALIDOS"}""")
        val cfg = CfdiConfigStore.guardar(req.dia, req.reintentos)
        return ControllerResponse(200, """{"ok":true,"dia":${cfg.dia},"reintentos":${cfg.reintentos}}""")
    }
}
