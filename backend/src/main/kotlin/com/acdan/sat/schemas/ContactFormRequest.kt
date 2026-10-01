package com.acdan.sat.schemas

/**
 * Solicitud de contacto recibida desde el sitio web institucional.
 */
data class ContactFormRequest(
    val nombre: String = "",
    val email: String = "",
    val telefono: String? = null,
    val rfc: String? = null,
    val interes: String? = null,
    val mensaje: String = ""
)
