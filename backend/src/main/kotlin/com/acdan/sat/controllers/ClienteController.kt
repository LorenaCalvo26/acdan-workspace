package com.acdan.sat.controllers

import com.acdan.sat.schemas.*
import com.acdan.sat.scripts.CredentialStore
import com.acdan.sat.scripts.Programacion
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.shared.validators.core.validate
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Controlador de gestión de clientes.
 * Encargado del alta, edición de frecuencias, eliminación y listados paginados de clientes.
 *
 * Utiliza Koupper [DynamoClient] para la persistencia no relacional y
 * [CredentialStore] (SSM SecureString) para las credenciales CIEC.
 */
object ClienteController {

    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun clientesTable() = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")

    /**
     * Inserta o actualiza un cliente individual.
     * La contraseña/CIEC se cifra y almacena en SSM Parameter Store bajo `/pilli/sat/{RFC}`.
     *
     * @param payload Formulario con la información del cliente.
     * @return [ControllerResponse] indicando resultado HTTP 200 o 400.
     */
    fun upsert(payload: ClienteForm): ControllerResponse {
        val norm = payload.normalizado()
        // Nombre/email opcionales: si no se proporcionan, se asigna el RFC como nombre predeterminado.
        val form = if (norm.nombre.isBlank()) norm.copy(nombre = norm.rfc.trim().uppercase()) else norm
        val rfc = form.rfc.trim().uppercase()
        val previos = runCatching { dynamo().getItem(clientesTable(), "pk", rfc) }.getOrNull()
        // Rotar Contraseña solo si viene con valor: en edición el campo vacío
        // conserva el secreto (las CIEC se rotan en el SAT cada cierto tiempo).
        val rotar = form.ciec.isNotBlank()
        if (previos == null && !rotar) return ControllerResponse(400, """{"error":"VALIDATION","details":[{"field":"ciec","messages":["must_not_be_blank"]}]}""")
        val v = validate(if (!rotar) form.copy(ciec = "________________") else form, clienteSchema())
        if (!v.ok) return ControllerResponse(400, """{"error":"VALIDATION","details":${v.errors}}""")

        // 1. Contraseña/CIEC -> SSM SecureString, jamás a Dynamo (solo al rotar o en alta)
        if (rotar) CredentialStore.put(rfc, form.ciec)

        // 2. Cliente -> Dynamo sin password
        val ahora = Instant.now()
        val now = ahora.toString()
        // Los campos del portal del cliente sobreviven a re-guardados del formulario.
        // (previos ya se leyó arriba para validar/rotar la Contraseña.)
        //
        // Programación:
        //   - Si viene fecha, es la próxima corrida y a partir de ahí se repite
        //     el mismo día de cada mes (hora local de México).
        //   - Si no viene fecha y el cliente ya era mensual, se conserva tal cual.
        //   - Si es un alta sin fecha (compatibilidad con Excel viejo), se queda
        //     el comportamiento anterior: primera corrida con jitter y luego
        //     cada `frecuenciaDias`.
        val fecha = form.fechaProgramada.trim()
        val hora = form.horaProgramada.trim()
        var programacion = previos?.get("programacion")?.toString().orEmpty().ifBlank { "intervalo" }
        var diaProgramacion = previos?.get("diaProgramacion")?.toString().orEmpty()
        var horaProgramacion = previos?.get("horaProgramacion")?.toString().orEmpty()
        val next: String

        if (fecha.isNotBlank()) {
            val instante = try {
                Programacion.parseFechaHora(fecha, hora)
            } catch (e: IllegalArgumentException) {
                return ControllerResponse(400, """{"error":"${e.message}"}""")
            }
            if (!instante.isAfter(ahora)) return ControllerResponse(400, """{"error":"FECHA_PASADA"}""")
            programacion = "mensual"
            diaProgramacion = Programacion.diaDe(fecha).toString()
            horaProgramacion = Programacion.normalizarHora(hora)
            next = instante.toString()
        } else if (programacion == "mensual" && previos != null) {
            val horaPrevia = horaProgramacion.ifBlank { Programacion.HORA_DEFAULT }
            val diaPrevio = diaProgramacion.toIntOrNull()
                ?: runCatching { Instant.parse(previos["proximoRun"].toString()).atZone(Programacion.zona).dayOfMonth }.getOrNull()
                ?: ahora.atZone(Programacion.zona).dayOfMonth
            horaProgramacion = horaPrevia
            diaProgramacion = diaPrevio.toString()
            val proximoPrevio = previos["proximoRun"]?.toString()
                ?.let { runCatching { Instant.parse(it) }.getOrNull() }
            // Se conserva aunque ya haya vencido: el scheduler la tomará en el
            // siguiente tick. Recalcular aquí retrasaría un mes una corrida debida.
            next = proximoPrevio?.toString()
                ?: Programacion.siguienteMensual(ahora, diaPrevio, horaPrevia).toString()
        } else if (previos == null) {
            val jitterMin = (0..120).random()
            next = ahora.plus(jitterMin.toLong(), ChronoUnit.MINUTES).toString()
            programacion = "intervalo"
        } else {
            next = previos["proximoRun"]?.toString()
                ?: ahora.plus(form.frecuenciaDias.toLong(), ChronoUnit.DAYS).toString()
            programacion = "intervalo"
        }

        val item = mutableMapOf(
            "pk" to rfc,
            "rfc" to rfc,
            "nombre" to form.nombre,
            "email" to form.email,
            "tipos" to form.tipos.joinToString(","),
            "frecuenciaDias" to form.frecuenciaDias.toString(),
            "programacion" to programacion,
            "diaProgramacion" to diaProgramacion,
            "horaProgramacion" to horaProgramacion,
            "ordenCfdi" to (
                previos?.get("ordenCfdi")?.toString()?.takeIf { it.isNotBlank() }
                    ?: ahora.toEpochMilli().toString()
                ),
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
        // Acceso automático: alta con correo, o correo agregado después sin
        // acceso previo. Re-guardados normales no regeneran nada.
        if (form.email.isNotBlank()) {
            val teniaEmail = previos?.get("email")?.toString().orEmpty().isNotBlank()
            val teniaAcceso = previos?.get("portalActivo")?.toString() == "true"
            if (!teniaEmail || !teniaAcceso) runCatching { PortalController.generarPara(rfc) }
        }
        return ControllerResponse(200, """{"ok":true,"rfc":"$rfc"}""")
    }

    /**
     * Procesa una carga masiva de clientes de forma eficiente.
     * Guarda credenciales en SSM SecureString y persiste registros de clientes en DynamoDB.
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
            val res = upsert(
                ClienteForm(
                    rfc = norm.rfc,
                    nombre = norm.nombre,
                    email = norm.email,
                    ciec = norm.ciec,
                    tipos = norm.tipos,
                    frecuenciaDias = norm.frecuenciaDias,
                    fechaProgramada = norm.fechaProgramada,
                    horaProgramada = norm.horaProgramada
                )
            )
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
     * Elimina un cliente por su RFC y remueve su credencial de SSM Parameter Store.
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
        
        // 2. Borrar credencial cifrada en SSM Parameter Store
        val secretBorrado = runCatching { CredentialStore.delete(key) }.getOrDefault(false)

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

        val ahora = Instant.now()
        val fecha = form.fechaProgramada.trim()
        if (fecha.isNotBlank()) {
            val instante = try {
                Programacion.parseFechaHora(fecha, form.horaProgramada)
            } catch (e: IllegalArgumentException) {
                return ControllerResponse(400, """{"error":"${e.message}"}""")
            }
            if (!instante.isAfter(ahora)) {
                // Permitir guardar sin mover una corrida ya vencida (el
                // scheduler la toma en el siguiente tick). Solo si la fecha y
                // hora elegidas son las mismas que ya tenía el cliente.
                val actual = item["proximoRun"]?.toString()?.let { runCatching { Instant.parse(it) }.getOrNull() }
                val misma = actual != null &&
                    Programacion.fechaLocal(actual) == Programacion.fechaLocal(instante) &&
                    Programacion.horaLocal(actual) == Programacion.horaLocal(instante)
                if (!misma) return ControllerResponse(400, """{"error":"FECHA_PASADA"}""")
            }
            merged["programacion"] = "mensual"
            merged["diaProgramacion"] = Programacion.diaDe(fecha).toString()
            merged["horaProgramacion"] = Programacion.normalizarHora(form.horaProgramada)
            merged["proximoRun"] = instante.toString()
        } else {
            val programacion = item["programacion"]?.toString().orEmpty().ifBlank { "intervalo" }
            merged["programacion"] = programacion
            if (programacion == "mensual") {
                val hora = item["horaProgramacion"]?.toString()?.takeIf { it.isNotBlank() }
                    ?: Programacion.HORA_DEFAULT
                val dia = item["diaProgramacion"]?.toString()?.toIntOrNull()
                    ?: runCatching { Instant.parse(item["proximoRun"].toString()).atZone(Programacion.zona).dayOfMonth }.getOrNull()
                    ?: ahora.atZone(Programacion.zona).dayOfMonth
                merged["horaProgramacion"] = hora
                merged["diaProgramacion"] = dia.toString()
                val actual = item["proximoRun"]?.toString()?.let { runCatching { Instant.parse(it) }.getOrNull() }
                merged["proximoRun"] = actual?.toString()
                    ?: Programacion.siguienteMensual(ahora, dia, hora).toString()
            } else {
                merged["proximoRun"] = ahora.plus(form.frecuenciaDias.toLong(), ChronoUnit.DAYS).toString()
            }
        }

        merged["updatedAt"] = ahora.toString()
        dynamo().insertItem(table, merged.mapValues { it.value.toString() })
        return ControllerResponse(200, """{"ok":true,"rfc":"${rfc.uppercase()}"}""")
    }

    /**
     * Guarda el orden en que la contadora quiere ejecutar los CFDI.
     * Solo aplica a CFDI: no cambia fechas ni adelanta clientes.
     *
     * @param payload RFCs en el orden deseado (primero = mayor prioridad).
     */
    fun ordenCfdi(payload: PrioridadCfdiRequest): ControllerResponse {
        val rfcs = payload.rfcs
            .map { it.trim().uppercase() }
            .filter { it.isNotBlank() }
            .distinct()
        if (rfcs.isEmpty()) return ControllerResponse(400, """{"error":"RFCS_REQUIRED"}""")
        if (rfcs.any { !RFC_REGEX.matches(it) }) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")

        val table = clientesTable()
        var actualizados = 0
        rfcs.forEachIndexed { index, rfc ->
            val item = dynamo().getItem(table, "pk", rfc) ?: return@forEachIndexed
            val merged = item.toMutableMap()
            merged["ordenCfdi"] = (index + 1).toString()
            merged["updatedAt"] = Instant.now().toString()
            dynamo().insertItem(table, merged.mapValues { it.value.toString() })
            actualizados++
        }
        return ControllerResponse(200, """{"ok":true,"actualizados":$actualizados}""")
    }

    /**
     * Adelanta la próxima corrida a ahora: el tick horario la encola sin crear
     * un job inmediato (no duplica ni choca con JOB_EN_CURSO).
     */
    fun adelantar(rfc: String): ControllerResponse {
        val table = clientesTable()
        val key = rfc.trim().uppercase()
        if (key.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUIRED"}""")
        val item = dynamo().getItem(table, "pk", key)
            ?: return ControllerResponse(404, """{"error":"NOT_FOUND"}""")
        // Sin CIEC el scheduler lo saltaría: adelantar sería un "éxito" fantasma.
        if (item["tieneCiec"]?.toString() != "true")
            return ControllerResponse(409, """{"error":"SIN_CIEC"}""")
        val merged = item.toMutableMap()
        merged["proximoRun"] = Instant.now().toString()
        merged["updatedAt"] = Instant.now().toString()
        dynamo().insertItem(table, merged.mapValues { it.value.toString() })
        return ControllerResponse(200, """{"ok":true,"rfc":"$key"}""")
    }

    private fun toJsonArray(list: List<String>): String =
        list.joinToString(",", "[", "]") { "\"${it.replace("\"", "'")}\"" }
}

data class ControllerResponse(val statusCode: Int, val body: String)
