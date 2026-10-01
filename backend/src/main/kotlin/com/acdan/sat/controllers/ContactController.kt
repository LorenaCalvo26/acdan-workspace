package com.acdan.sat.controllers

import com.acdan.sat.schemas.ContactFormRequest
import com.acdan.sat.scripts.EmailNotifier

/**
 * Controlador para la atención del formulario de contacto del sitio web institucional.
 */
object ContactController {

    fun procesarContacto(req: ContactFormRequest): ControllerResponse {
        val nombre = req.nombre.trim()
        val email = req.email.trim()
        val mensaje = req.mensaje.trim()

        if (nombre.isBlank()) return ControllerResponse(400, """{"error":"NOMBRE_REQUIRED"}""")
        if (email.isBlank()) return ControllerResponse(400, """{"error":"EMAIL_REQUIRED"}""")
        if (mensaje.isBlank()) return ControllerResponse(400, """{"error":"MENSAJE_REQUIRED"}""")

        runCatching {
            EmailNotifier.notificarLeadContacto(
                nombre = nombre,
                email = email,
                telefono = req.telefono,
                rfc = req.rfc,
                interes = req.interes,
                mensaje = mensaje
            )
        }.onFailure { e ->
            println("[contact] Error enviando correo de lead: ${e.message}")
        }

        return ControllerResponse(200, """{"ok":true,"message":"LEAD_RECIBIDO"}""")
    }
}
