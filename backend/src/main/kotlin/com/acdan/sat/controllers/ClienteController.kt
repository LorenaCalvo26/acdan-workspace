package com.acdan.sat.controllers

import com.acdan.sat.schemas.*
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.providers.secrets.SecretsClient
import com.koupper.shared.validators.core.validate
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Controlador de gestión de clientes.
 * Encargado del alta, edición de frecuencias, eliminación y listados paginados de clientes.
 *
 * Utiliza Koupper [DynamoClient] para la persistencia no relacional y [SecretsClient]
 * para el almacenamiento seguro cifrado de credenciales CIEC.
 */
object ClienteController {

    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun secrets() = app.getInstance(SecretsClient::class)
    private fun clientesTable() = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")

    /**
     * Inserta o actualiza un cliente individual.
     * La contraseña/CIEC se cifra y almacena exclusivamente en [SecretsClient] bajo la clave `sat:{RFC}`.
     *
     * @param payload Formulario con la información del cliente.
     * @return [ControllerResponse] indicando resultado HTTP 200 o 400.
     */
    fun upsert(payload: ClienteForm): ControllerResponse {
        val norm = payload.normalizado()
        // Nombre/email opcionales: si no se proporcionan, se asigna el RFC como nombre predeterminado.
        val form = if (norm.nombre.isBlank()) norm.copy(nombre = norm.rfc.trim().uppercase()) else norm
        val v = validate(form, clienteSchema())
        if (!v.ok) return ControllerResponse(400, """{"error":"VALIDATION","details":${v.errors}}""")
        val rfc = form.rfc.trim().uppercase()

        // 1. Contraseña/CIEC -> Secrets cifrado, jamás a Dynamo
        secrets().put("sat:$rfc", form.ciec)

        // 2. Cliente -> Dynamo sin password
        val now = Instant.now().toString()
        // Los campos del portal del cliente sobreviven a re-guardados del formulario.
        val previos = runCatching { dynamo().getItem(clientesTable(), "pk", rfc) }.getOrNull()
        // Primera corrida: a la hora (jitter para no amontonar altas masivas en
        // el mismo tick); de ahí la métrica la pone cada éxito (+frecuencia).
        // Re-guardados conservan el proximoRun que ya traían.
        val next = if (previos == null) {
            val jitterMin = (0..120).random()
            Instant.now().plus(jitterMin.toLong(), ChronoUnit.MINUTES).toString()
        } else {
            previos["proximoRun"]?.toString()
                ?: Instant.now().plus(form.frecuenciaDias.toLong(), ChronoUnit.DAYS).toString()
        }
        val item = mutableMapOf(
            "pk" to rfc,
            "rfc" to rfc,
            "nombre" to form.nombre,
            "email" to form.email,
            "tipos" to form.tipos.joinToString(","),
            "frecuenciaDias" to form.frecuenciaDias.toString(),
            "activo" to "true",
            "tieneCiec" to "true",
            "proximoRun" to next,
            "cfdiMensual" to form.cfdiMensual.toString(),
            "cfdiDesde" to (previos?.get("cfdiDesde")?.toString() ?: java.time.YearMonth.now(com.acdan.sat.scripts.CfdiStore.zona).toString()),
            "updatedAt" to now
        )
        listOf("portalCodigoHash", "portalSalt", "portalActivo", "portalUltimoAcceso").forEach { campo ->
            previos?.get(campo)?.toString()?.takeIf { it.isNotBlank() }?.let { item[campo] = it }
        }
        dynamo().insertItem(clientesTable(), item)
        // Alta con correo: acceso al portal automático + bienvenida (sin manos).
        if (previos == null && form.email.isNotBlank()) {
            runCatching { PortalController.generarPara(rfc) }
        }
        return ControllerResponse(200, """{"ok":true,"rfc":"$rfc"}""")
    }

    /**
     * Procesa una carga masiva de clientes de forma eficiente.
     * Guarda credenciales en Secrets Vault y persiste registros de clientes en DynamoDB.
     *
     * @param payload Objeto con la lista de filas a importar.
     * @return [ControllerResponse] con conteo de insertados y errores.
     */
    fun bulk(payload: BulkUploadRequest): ControllerResponse {
        val schema = bulkRowSchema()
        val ok = mutableListOf<String>()
        val errors = mutableListOf<String>()
        
        payload.rows.forEachIndexed { i, row ->
            val norm = row.normalizado()
            val v = validate(norm, schema)
            if (!v.ok) { 
                errors.add("row $i: ${v.errors}")
                return@forEachIndexed 
            }
            val res = upsert(ClienteForm(norm.rfc, norm.nombre, norm.email, norm.ciec, "", norm.tipos, norm.frecuenciaDias))
            if (res.statusCode == 200) ok.add(row.rfc.uppercase()) else errors.add("row $i: ${res.body}")
        }
        return ControllerResponse(200, """{"ok":true,"insertados":${ok.size},"errores":${errors.size},"detalle":${toJsonArray(errors)}}""")
    }

    /**
     * Consulta paginada de clientes utilizando fragmentos indexados de DynamoDB ([DynamoClient.scanItemsPaginatedChunk]).
     * Evita problemas de rendimiento por escaneo total de tabla en memoria.
     *
     * @param limit Límite máximo de elementos a recuperar.
     * @param cursorToken Token opcional de paginación previa.
     * @return [ControllerResponse] con la lista de elementos y el siguiente token de cursor.
     */
    fun listPaginated(limit: Int = 20, cursorToken: String? = null): ControllerResponse {
        val (items, nextToken) = dynamo().scanItemsPaginatedChunk(
            tableName = clientesTable(),
            limit = limit,
            cursorToken = cursorToken
        )
        val jsonItems = items.joinToString(",", "[", "]") { Json.obj(it, max = 300) }
        val nextTokenEscaped = nextToken?.let { "\"$it\"" } ?: "null"
        val responseJson = """{"items":$jsonItems,"cursorToken":$nextTokenEscaped,"hasMore":${nextToken != null}}"""
        return ControllerResponse(200, responseJson)
    }

    /**
     * Consulta general de clientes (versión legacy / fallback sin paginación).
     */
    fun list(): ControllerResponse {
        val items = dynamo().scanItems(clientesTable())
        val json = items.joinToString(",", "[", "]") { Json.obj(it, max = 300) }
        return ControllerResponse(200, json)
    }

    /**
     * Elimina un cliente por su RFC y remueve su clave cifrada asociada en [SecretsClient].
     *
     * @param rfc Registro Federal de Contribuyentes.
     * @return [ControllerResponse] con el resultado del borrado.
     */
    fun eliminar(rfc: String): ControllerResponse {
        val key = rfc.trim().uppercase()
        if (key.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUIRED"}""")
        if (!RFC_REGEX.matches(key)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        
        // 1. Borrar cliente en ACDAN_CLIENTES
        runCatching { dynamo().deleteItem(clientesTable(), mapOf("pk" to key)) }
        
        // 2. Borrar credencial cifrada en Secrets
        val secretBorrado = runCatching { secrets().delete("sat:$key") }.getOrDefault(false)

        // 3. Borrar dictámenes y documentos en ACDAN_DOCS
        val docsTable = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
        val docsDelRfc = runCatching { dynamo().scanItems(docsTable).filter { it["rfc"]?.toString()?.uppercase() == key } }.getOrDefault(emptyList())
        docsDelRfc.forEach { doc ->
            doc["pk"]?.toString()?.let { pk ->
                runCatching { dynamo().deleteItem(docsTable, mapOf("pk" to pk)) }
            }
        }

        // 4. Borrar historial de trabajos en ACDAN_JOBS
        val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
        val jobsDelRfc = runCatching { dynamo().scanItems(jobsTable).filter { it["rfc"]?.toString()?.uppercase() == key } }.getOrDefault(emptyList())
        jobsDelRfc.forEach { job ->
            job["pk"]?.toString()?.let { pk ->
                runCatching { dynamo().deleteItem(jobsTable, mapOf("pk" to pk)) }
            }
        }

        // 5. Borrar archivos en ambos motores (disco + S3) vía DocStore.
        runCatching { com.acdan.sat.scripts.DocStore.borrarRfc(key) }

        return ControllerResponse(200, """{"ok":true,"rfc":"$key","secretBorrado":$secretBorrado,"docsBorrados":${docsDelRfc.size}}""")
    }

    /**
     * Actualiza la frecuencia de ejecución y estado activo/inactivo de un cliente.
     *
     * @param rfc RFC del cliente a modificar.
     * @param form Parámetros de frecuencia y estado.
     * @return [ControllerResponse] resultado del update.
     */
    fun frecuencia(rfc: String, form: FrecuenciaForm): ControllerResponse {
        val table = clientesTable()
        val item = dynamo().getItem(table, "pk", rfc.uppercase())
            ?: return ControllerResponse(404, """{"error":"NOT_FOUND"}""")
        val merged = item.toMutableMap()
        merged["frecuenciaDias"] = form.frecuenciaDias.toString()
        merged["tipos"] = form.tipos.joinToString(",")
        merged["activo"] = form.activo.toString()
        form.cfdiMensual?.let { merged["cfdiMensual"] = it.toString() }
        merged["proximoRun"] = Instant.now().plus(form.frecuenciaDias.toLong(), ChronoUnit.DAYS).toString()
        merged["updatedAt"] = Instant.now().toString()
        dynamo().insertItem(table, merged.mapValues { it.value.toString() })
        return ControllerResponse(200, """{"ok":true,"rfc":"${rfc.uppercase()}"}""")
    }

    private fun toJsonArray(list: List<String>): String =
        list.joinToString(",", "[", "]") { "\"${it.replace("\"", "'")}\"" }
}

data class ControllerResponse(val statusCode: Int, val body: String)
