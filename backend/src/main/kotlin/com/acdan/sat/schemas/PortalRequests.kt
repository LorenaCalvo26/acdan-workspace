package com.acdan.sat.schemas

/**
 * Solicitudes del portal del cliente (rutas `/api/v1/portal/...`).
 * Los endpoints de gestión exigen JWT de ADMIN/OPERADOR; los de consulta,
 * JWT de CLIENTE atado a su RFC.
 */
data class PortalGenerarRequest(
    val token: String = "",
    val rfc: String = ""
)

data class PortalEntrarRequest(
    val rfc: String = "",
    val codigo: String = "",
    val password: String = ""
)

data class PortalPasswordRequest(
    val token: String = "",
    val password: String = ""
)

data class PortalTokenRequest(
    val token: String = ""
)

/** Marca visible en el portal de un RFC (publica: se pide antes de iniciar sesion). */
data class PortalMarcaRequest(val rfc: String = "")

data class PortalPdfRequest(
    val token: String = "",
    val docId: String = ""
)
