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
    val codigo: String = ""
)

data class PortalTokenRequest(
    val token: String = ""
)

data class PortalPdfRequest(
    val token: String = "",
    val docId: String = ""
)
