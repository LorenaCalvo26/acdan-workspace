package com.acdan.sat.controllers

import com.acdan.sat.schemas.SatSolicitarRequest
import com.acdan.sat.scripts.SatBotRequest
import com.acdan.sat.scripts.satBotJob
import com.koupper.container.app
import com.koupper.orchestrator.asJob
import com.koupper.orchestrator.dispatchToQueue
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.Instant
import java.util.UUID

/**
 * Controlador para la orquestación y monitoreo de trabajos del bot del SAT.
 * Encola trabajos en background para la descarga de Opinión de Cumplimiento (32-D) y Constancias de Situación Fiscal.
 */
object SatController {

    /**
     * Pool de hilos concurrente para la ejecución local de bots en background.
     */
    private val pool = java.util.concurrent.Executors.newFixedThreadPool(2)

    /**
     * Solicita la ejecución en segundo plano de un trabajo de bot del SAT para un cliente específico.
     * Encola el trabajo en `ACDAN_JOBS` y notifica al Orchestrator de Koupper.
     *
     * @param payload Solicitud con RFC y tipos de documentos requeridos.
     * @return [ControllerResponse] con el `jobId` generado y el estado inicial `queued`.
     */
    fun solicitar(payload: SatSolicitarRequest): ControllerResponse {
        val rfc = payload.rfc.trim().uppercase()
        if (rfc.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUIRED"}""")
        val jobId = UUID.randomUUID().toString()
        val dynamo = app.getInstance(DynamoClient::class)
        val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
        dynamo.insertItem(jobsTable, mapOf(
            "pk" to jobId, "jobId" to jobId, "rfc" to rfc,
            "tipos" to payload.tipos.joinToString(","), "status" to "queued",
            "updatedAt" to Instant.now().toString()
        ))
        runCatching { ::satBotJob.asJob(SatBotRequest(jobId, rfc, payload.tipos)).dispatchToQueue() }
        pool.submit { runCatching { satBotJob(SatBotRequest(jobId, rfc, payload.tipos)) } }
        return ControllerResponse(200, """{"ok":true,"jobId":"$jobId","status":"queued"}""")
    }

    /**
     * Consulta el estado de ejecución actual de un trabajo del bot.
     *
     * @param jobId Identificador del trabajo.
     * @return [ControllerResponse] con el detalle del estado y posible error.
     */
    fun status(jobId: String): ControllerResponse {
        val dynamo = app.getInstance(DynamoClient::class)
        val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
        val item = dynamo.getItem(jobsTable, "pk", jobId)
            ?: return ControllerResponse(404, """{"error":"JOB_NOT_FOUND"}""")
        return ControllerResponse(200, Json.obj(item, sinTruncar = setOf("error"), max = 1000))
    }

    /**
     * Obtiene los documentos descargados asociados a un RFC.
     *
     * @param rfc Registro Federal de Contribuyentes.
     * @return [ControllerResponse] colección de metadatos de documentos en JSON.
     */
    fun docsPorRfc(rfc: String): ControllerResponse {
        val dynamo = app.getInstance(DynamoClient::class)
        val docsTable = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
        val items = dynamo.scanItems(docsTable).filter { it["rfc"]?.toString() == rfc.uppercase() }
        // `campos` es JSON anidado: si se trunca a media estructura el front no lo parsea.
        val json = items.joinToString(",", "[", "]") { Json.obj(it, sinTruncar = setOf("campos")) }
        return ControllerResponse(200, json)
    }
}

