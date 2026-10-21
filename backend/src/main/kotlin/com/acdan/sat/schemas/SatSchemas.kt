package com.acdan.sat.schemas

/**
 * Formulario de alta o actualización manual de un cliente desde la interfaz del Dashboard.
 * La contraseña o CIEC del SAT nunca se persiste directamente en base de datos en texto plano,
 * sino que se almacena cifrada en SSM Parameter Store bajo `/pilli/sat/{RFC}`.
 *
 * @property rfc Registro Federal de Contribuyentes (clave única).
 * @property nombre Nombre o Razón Social del cliente (opcional).
 * @property email Correo electrónico de notificación (opcional).
 * @property ciec Clave CIEC / Contraseña SAT.
 * @property password Alias alternativo para la clave CIEC.
 * @property tipos Lista de documentos requeridos (ej. "constancia", "32d").
 * @property frecuenciaDias Intervalo en días para la ejecución periódica del bot.
 */
data class ClienteForm(
    val rfc: String = "",
    val nombre: String = "",
    val email: String = "",
    val ciec: String = "",
    val password: String = "",
    val tipos: List<String> = listOf("constancia", "32d"),
    val frecuenciaDias: Int = 25,
    val cfdiMensual: Boolean = true
) {
    fun credencial(): String = if (ciec.isNotBlank()) ciec else password
    fun normalizado(): ClienteForm = copy(ciec = credencial(), password = "")
}

/**
 * Fila individual dentro de una carga masiva de clientes mediante Excel/CSV.
 */
data class BulkClienteRow(
    val rfc: String = "",
    val nombre: String = "",
    val email: String = "",
    val ciec: String = "",
    val password: String = "",
    val tipos: List<String> = listOf("constancia", "32d"),
    val frecuenciaDias: Int = 25
) {
    fun credencial(): String = if (ciec.isNotBlank()) ciec else password
    fun normalizado(): BulkClienteRow = copy(ciec = credencial(), password = "")
}

/**
 * Solicitud de carga masiva de clientes enviada desde el cliente Web.
 */
data class BulkUploadRequest(
    val rows: List<BulkClienteRow> = emptyList()
)

/**
 * Formulario para actualización de la frecuencia de ejecución y estado activo de un cliente.
 */
data class FrecuenciaForm(
    val rfc: String = "",
    val frecuenciaDias: Int = 25,
    val tipos: List<String> = listOf("constancia", "32d"),
    val activo: Boolean = true,
    val cfdiMensual: Boolean? = null
)

/**
 * Solicitud de consulta paginada de clientes.
 *
 * @property limit Cantidad máxima de registros a retornar por página.
 * @property cursorToken Token de cursor para la paginación de DynamoDB.
 */
data class ClienteListQuery(
    val limit: Int = 20,
    val cursorToken: String? = null
)

/**
 * Respuesta paginada estándar para la API del backend.
 *
 * @property items Colección de elementos retornados.
 * @property cursorToken Siguiente token de cursor si existen más resultados.
 * @property hasMore Indica si la consulta tiene páginas subsecuentes.
 */
data class PaginatedResponse<T>(
    val items: List<T>,
    val cursorToken: String? = null,
    val hasMore: Boolean = cursorToken != null
)

/**
 * Registro persistido de cliente en DynamoDB `ACDAN_CLIENTES` (excluyendo la credencial).
 */
data class ClienteRecord(
    val rfc: String,
    val nombre: String,
    val email: String,
    val tipos: List<String>,
    val frecuenciaDias: Int,
    val activo: Boolean = true,
    val tieneCiec: Boolean = true,
    val ultimoRun: String? = null,
    val proximoRun: String? = null,
    val updatedAt: String
)

/**
 * Solicitud manual de ejecución del bot del SAT para un cliente específico.
 */
data class SatSolicitarRequest(
    val rfc: String = "",
    val tipos: List<String> = listOf("constancia", "32d"),
    val periodo: String = ""
)

/**
 * Registro de estado y seguimiento de trabajo del bot del SAT en `ACDAN_JOBS`.
 */
data class SatJobRecord(
    val jobId: String,
    val rfc: String,
    val tipos: List<String>,
    val status: String, // queued|captcha|login|descargando|extrayendo|listo|error
    val intentoCaptcha: Int = 0,
    val error: String? = null,
    val docIds: List<String> = emptyList(),
    val updatedAt: String
)

/**
 * Registro del documento descargado y procesado por el bot del SAT en `ACDAN_DOCS`.
 */
data class SatDocRecord(
    val docId: String,
    val rfc: String,
    val tipo: String, // constancia | 32d
    val s3Key: String,
    val campos: Map<String, String> = emptyMap(),
    val vigenciaHasta: String? = null,
    val createdAt: String
)

/**
 * Respuesta genérica de operación realizada con éxito o fallo.
 */
data class OperationResponse(
    val statusCode: Int,
    val message: String
)
