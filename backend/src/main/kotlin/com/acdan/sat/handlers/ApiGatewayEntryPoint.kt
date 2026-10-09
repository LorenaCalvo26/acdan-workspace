package com.acdan.sat.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyRequestEvent
import com.amazonaws.services.lambda.runtime.events.APIGatewayProxyResponseEvent
import com.acdan.sat.controllers.AuthController
import com.acdan.sat.controllers.ClienteController
import com.acdan.sat.controllers.ControllerResponse
import com.acdan.sat.controllers.DashboardController
import com.acdan.sat.controllers.SatController
import com.acdan.sat.schemas.AuthCreateUserRequest
import com.acdan.sat.schemas.AuthListUsersRequest
import com.acdan.sat.schemas.AuthLoginRequest
import com.acdan.sat.schemas.AuthMeRequest
import com.acdan.sat.schemas.BulkUploadRequest
import com.acdan.sat.schemas.ClienteForm
import com.acdan.sat.schemas.FrecuenciaForm
import com.acdan.sat.schemas.SatSolicitarRequest
import com.koupper.container.app
import com.koupper.logging.LoggerFactory
import com.koupper.octopus.createDefaultConfiguration
import com.koupper.providers.files.fromJson
import com.koupper.providers.runtime.router.RuntimeRouterProvider
import http.routes.DocsRequest
import http.routes.JobStatusRequest
import server.setupApplication

class ApiGatewayEntryPoint : RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    companion object {
        private val logger = LoggerFactory.get("ApiGatewayEntryPoint")
        @Volatile
        private var isInitialized = false

        init {
            ensureInitialized()
        }

        private fun ensureInitialized() {
            if (!isInitialized) {
                synchronized(this) {
                    if (!isInitialized) {
                        try {
                            val writableBase = java.io.File("/tmp/koupper-runtime")
                            writableBase.mkdirs()
                            java.io.File(writableBase, ".koupper").mkdirs()
                            System.setProperty("user.home", writableBase.absolutePath)
                            System.setProperty("user.dir", writableBase.absolutePath)

                            createDefaultConfiguration()
                            val router = app.getInstance(RuntimeRouterProvider::class)
                            setupApplication(router)
                            isInitialized = true
                            logger.info { "ACDAN SAT API Gateway Entry Point initialized successfully." }
                        } catch (e: Exception) {
                            logger.error(e) { "Could not initialize API Gateway Entry Point: ${e.message}" }
                        }
                    }
                }
            }
        }
    }

    override fun handleRequest(
        request: APIGatewayProxyRequestEvent,
        context: Context?
    ): APIGatewayProxyResponseEvent {
        ensureInitialized()

        val path = request.path ?: "/"
        val method = request.httpMethod ?: "GET"

        // Invocación directa de EventBridge Scheduler (no trae path/method de API Gateway):
        // corre el tick del programador en vez de ruteo HTTP.
        if (request.path.isNullOrBlank() && request.httpMethod.isNullOrBlank()) {
            logger.info { "Handling Scheduler tick invocation" }
            val tick = com.acdan.sat.scripts.schedulerTick(emptyMap())
            return buildResponse(tick.statusCode, tick.body)
        }

        val bodyJson = request.body ?: "{}"

        logger.info { "Handling HTTP Request: $method $path" }

        if (method.equals("OPTIONS", ignoreCase = true)) {
            return buildResponse(200, "")
        }

        return try {
            val res: ControllerResponse = when {
                path == "/health" -> ControllerResponse(200, """{"status":"ok"}""")
                path == "/api/v1/contact" && method == "POST" -> com.acdan.sat.controllers.ContactController.procesarContacto(bodyJson.fromJson<com.acdan.sat.schemas.ContactFormRequest>())
                path == "/api/v1/stats" && method == "GET" -> DashboardController.stats()
                path == "/api/v1/clientes/resumen" && method == "GET" -> DashboardController.resumen()
                path == "/api/v1/clientes" && method == "GET" -> ClienteController.listPaginated(20, null)
                path == "/api/v1/clientes" && method == "POST" -> ClienteController.upsert(bodyJson.fromJson<ClienteForm>())
                path == "/api/v1/clientes/bulk" && method == "POST" -> ClienteController.bulk(bodyJson.fromJson<BulkUploadRequest>())
                path == "/api/v1/clientes/frecuencia" && method == "POST" -> {
                    val dto = bodyJson.fromJson<FrecuenciaForm>()
                    if (dto.rfc.isBlank()) ControllerResponse(400, """{"error":"RFC_REQUIRED"}""")
                    else ClienteController.frecuencia(dto.rfc, dto)
                }
                path == "/api/v1/clientes/eliminar" && method == "POST" -> {
                    val dto = bodyJson.fromJson<DocsRequest>()
                    ClienteController.eliminar(dto.rfc)
                }
                path == "/api/v1/sat/solicitar" && method == "POST" -> SatController.solicitar(bodyJson.fromJson<SatSolicitarRequest>())
                path == "/api/v1/cfdi/listar" && method == "POST" -> com.acdan.sat.controllers.CfdiController.listar(bodyJson.fromJson<com.acdan.sat.controllers.CfdiConsulta>())
                path == "/api/v1/cfdi/sincronizar" && method == "POST" -> com.acdan.sat.controllers.CfdiController.sincronizar(bodyJson.fromJson<com.acdan.sat.controllers.CfdiConsulta>())
                path == "/api/v1/cfdi/archivo" && method == "POST" -> com.acdan.sat.controllers.CfdiController.archivo(bodyJson.fromJson<com.acdan.sat.controllers.CfdiArchivo>())
                path == "/api/v1/cfdi/reprocesar" && method == "POST" -> com.acdan.sat.controllers.CfdiController.reprocesar(bodyJson.fromJson<com.acdan.sat.controllers.CfdiConsulta>())
                path == "/api/v1/sat/status" && method == "POST" -> {
                    val dto = bodyJson.fromJson<JobStatusRequest>()
                    SatController.status(dto.jobId)
                }
                path == "/api/v1/sat/salud" && method == "GET" -> SatController.salud()
                path == "/api/v1/docs/por-rfc" && method == "POST" -> {
                    val dto = bodyJson.fromJson<DocsRequest>()
                    SatController.docsPorRfc(dto.rfc)
                }
                path == "/api/v1/scheduler/tick" || path == "/scheduler/tick" ->
                    com.acdan.sat.scripts.schedulerTick(emptyMap())
                path == "/api/v1/auth/login" && method == "POST" -> AuthController.login(bodyJson.fromJson<AuthLoginRequest>())
                path == "/api/v1/auth/me" && method == "POST" -> AuthController.me(bodyJson.fromJson<AuthMeRequest>())
                path == "/api/v1/auth/usuarios" && method == "POST" -> AuthController.crearUsuario(bodyJson.fromJson<AuthCreateUserRequest>())
                path == "/api/v1/auth/usuarios/list" && method == "POST" -> AuthController.listarUsuarios(bodyJson.fromJson<AuthListUsersRequest>())
                else -> ControllerResponse(404, """{"error":"ROUTE_NOT_FOUND","path":"$path"}""")
            }

            buildResponse(res.statusCode, res.body)
        } catch (e: Exception) {
            logger.error(e) { "Error processing request $method $path: ${e.message}" }
            buildResponse(500, """{"error":"INTERNAL_SERVER_ERROR","message":"${e.message}"}""")
        }
    }

    private fun buildResponse(statusCode: Int, body: String): APIGatewayProxyResponseEvent {
        return APIGatewayProxyResponseEvent()
            .withStatusCode(statusCode)
            .withBody(body)
            .withHeaders(
                mapOf(
                    "Content-Type" to "application/json",
                    "Access-Control-Allow-Origin" to "*",
                    "Access-Control-Allow-Headers" to "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
                    "Access-Control-Allow-Methods" to "GET,POST,PUT,DELETE,OPTIONS"
                )
            )
    }
}
