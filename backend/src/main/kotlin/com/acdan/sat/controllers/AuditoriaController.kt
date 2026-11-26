package com.acdan.sat.controllers

import com.acdan.sat.scripts.Auditoria
import com.acdan.sat.scripts.AuthStore
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

/**
 * Bitácora de lo que hace el equipo. Solo ADMIN: es información de control
 * interno, no de operación diaria.
 */
object AuditoriaController {

    private val mapper = jacksonObjectMapper()

    fun listar(token: String): ControllerResponse {
        val sesion = runCatching { AuthStore.verificarJwt(token.trim()) }.getOrNull()
            ?: return ControllerResponse(401, """{"error":"TOKEN_INVALIDO"}""")
        if (sesion["rol"] != "ADMIN") return ControllerResponse(403, """{"error":"SOLO_ADMIN"}""")

        val eventos = Auditoria.listar(200)
        return ControllerResponse(200, mapper.writeValueAsString(mapOf("items" to eventos)))
    }
}
