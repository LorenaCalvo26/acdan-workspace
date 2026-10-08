package http.routes

import com.acdan.sat.controllers.ClienteController
import com.acdan.sat.controllers.ControllerResponse
import com.acdan.sat.controllers.AuthController
import com.acdan.sat.controllers.CaptchaDebugRequest
import com.acdan.sat.controllers.DashboardController
import com.acdan.sat.controllers.NavigateRequest
import com.acdan.sat.controllers.SatController
import com.acdan.sat.schemas.BulkUploadRequest
import com.acdan.sat.schemas.ClienteForm
import com.acdan.sat.schemas.ClienteListQuery
import com.acdan.sat.schemas.PortalEntrarRequest
import com.acdan.sat.schemas.PortalGenerarRequest
import com.acdan.sat.schemas.PortalPdfRequest
import com.acdan.sat.schemas.PortalTokenRequest
import com.acdan.sat.schemas.AuthCreateUserRequest
import com.acdan.sat.schemas.AuthListUsersRequest
import com.acdan.sat.schemas.AuthLoginRequest
import com.acdan.sat.schemas.AuthMeRequest
import com.acdan.sat.schemas.FrecuenciaForm
import com.acdan.sat.schemas.SatSolicitarRequest
import com.acdan.sat.controllers.DebugController
import com.koupper.providers.runtime.router.RuntimeRouterDsl
import com.koupper.shared.runtime.WebResponse

/** DTO de consulta para el estado de un trabajo del bot */
data class JobStatusRequest(val jobId: String = "")
/** DTO de consulta para los documentos de un RFC */
data class DocsRequest(val rfc: String = "")
/** DTO de consulta para un PDF específico */
data class PdfQuery(val rfc: String = "", val docId: String = "")

/**
 * Registro de rutas REST de la API del ACDAN SAT Platform sobre el DSL de Koupper `RuntimeRouterDsl`.
 */
private val corsHeaders = mapOf(
    "Access-Control-Allow-Origin" to "*",
    "Access-Control-Allow-Headers" to "Content-Type, Authorization",
    "Access-Control-Allow-Methods" to "GET, POST, PUT, DELETE, OPTIONS"
)

fun RuntimeRouterDsl.satRoutes() {

    /** POST /api/v1/contact - Recepción del formulario de contacto institucional */
    post<com.acdan.sat.schemas.ContactFormRequest, WebResponse> {
        path { "/api/v1/contact" }
        fun handle(dto: com.acdan.sat.schemas.ContactFormRequest): WebResponse {
            val r = com.acdan.sat.controllers.ContactController.procesarContacto(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/clientes - Alta o actualización de cliente */
    post<ClienteForm, WebResponse> {
        path { "/api/v1/clientes" }
        fun handle(dto: ClienteForm): WebResponse {
            val r: ControllerResponse = ClienteController.upsert(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/clientes/bulk - Carga masiva de clientes desde Excel/CSV */
    post<BulkUploadRequest, WebResponse> {
        path { "/api/v1/clientes/bulk" }
        fun handle(dto: BulkUploadRequest): WebResponse {
            val r = ClienteController.bulk(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/clientes/frecuencia - Actualización de frecuencia y estado activo */
    post<FrecuenciaForm, WebResponse> {
        path { "/api/v1/clientes/frecuencia" }
        fun handle(dto: FrecuenciaForm): WebResponse {
            if (dto.rfc.isBlank()) return WebResponse(body = """{"error":"RFC_REQUIRED"}""", statusCode = 400)
            val r = ClienteController.frecuencia(dto.rfc, dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/sat/solicitar - Inicia la descarga manual de documentos para un RFC */
    post<SatSolicitarRequest, WebResponse> {
        path { "/api/v1/sat/solicitar" }
        fun handle(dto: SatSolicitarRequest): WebResponse {
            val r = SatController.solicitar(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** GET /api/v1/stats - Obtiene las métricas globales para el Dashboard */
    get<Any, WebResponse> {
        path { "/api/v1/stats" }
        fun handle(dto: Any): WebResponse {
            val r = DashboardController.stats()
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** GET /api/v1/clientes/resumen - Resumen consolidado del último 32-D por cliente */
    get<Any, WebResponse> {
        path { "/api/v1/clientes/resumen" }
        fun handle(dto: Any): WebResponse {
            val r = DashboardController.resumen()
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** GET /api/v1/clientes - Listado paginado de clientes registrados */
    get<ClienteListQuery, WebResponse> {
        path { "/api/v1/clientes" }
        fun handle(dto: ClienteListQuery): WebResponse {
            val limit = if (dto.limit > 0) dto.limit else 20
            val r = ClienteController.listPaginated(limit, dto.cursorToken)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/docs/por-rfc - Consulta de documentos asociados a un RFC */
    post<DocsRequest, WebResponse> {
        path { "/api/v1/docs/por-rfc" }
        fun handle(dto: DocsRequest): WebResponse {
            val r = SatController.docsPorRfc(dto.rfc)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/clientes/eliminar - Baja de cliente y eliminación de clave en Secrets */
    post<DocsRequest, WebResponse> {
        path { "/api/v1/clientes/eliminar" }
        fun handle(dto: DocsRequest): WebResponse {
            val r = ClienteController.eliminar(dto.rfc)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/sat/status - Consulta del estado de un trabajo del bot */
    post<JobStatusRequest, WebResponse> {
        path { "/api/v1/sat/status" }
        fun handle(dto: JobStatusRequest): WebResponse {
            val r = SatController.status(dto.jobId)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/login - Inicio de sesión de usuarios de la plataforma */
    post<AuthLoginRequest, WebResponse> {
        path { "/api/v1/auth/login" }
        fun handle(dto: AuthLoginRequest): WebResponse {
            val r = AuthController.login(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/me - Consulta del perfil del usuario en sesión */
    post<AuthMeRequest, WebResponse> {
        path { "/api/v1/auth/me" }
        fun handle(dto: AuthMeRequest): WebResponse {
            val r = AuthController.me(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/usuarios - Registro de nuevos usuarios administradores */
    post<AuthCreateUserRequest, WebResponse> {
        path { "/api/v1/auth/usuarios" }
        fun handle(dto: AuthCreateUserRequest): WebResponse {
            val r = AuthController.crearUsuario(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/usuarios/list - Listado de usuarios del sistema */
    post<AuthListUsersRequest, WebResponse> {
        path { "/api/v1/auth/usuarios/list" }
        fun handle(dto: AuthListUsersRequest): WebResponse {
            val r = AuthController.listarUsuarios(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** GET /health - Monitoreo de salud del servicio */
    get<Any, WebResponse> {
        path { "/health" }
        fun handle(dto: Any): WebResponse {
            return WebResponse(body = """{"status":"ok"}""", statusCode = 200, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/browser - Diagnóstico de arranque del navegador */
    post<Any, WebResponse> {
        path { "/api/v1/debug/browser" }
        fun handle(dto: Any): WebResponse {
            val r = DebugController.browserTest()
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/captcha - Diagnóstico del módulo resolvedor de captchas */
    post<CaptchaDebugRequest, WebResponse> {
        path { "/api/v1/debug/captcha" }
        fun handle(dto: CaptchaDebugRequest): WebResponse {
            val r = DebugController.solveCaptcha(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/navigate - Diagnóstico de navegación del bot */
    post<NavigateRequest, WebResponse> {
        path { "/api/v1/debug/navigate" }
        fun handle(dto: NavigateRequest): WebResponse {
            val r = DebugController.navigate(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** GET /api/v1/sat/salud - Heartbeat de alcanzabilidad del SAT (no gasta intentos) */
    get<Any, WebResponse> {
        path { "/api/v1/sat/salud" }
        fun handle(dto: Any): WebResponse {
            val r = SatController.salud()
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/scheduler/tick - Encola manualmente los clientes con proximoRun vencido */
    post<Any, WebResponse> {
        path { "/api/v1/scheduler/tick" }
        fun handle(dto: Any): WebResponse {
            val r = com.acdan.sat.scripts.schedulerTick(emptyMap())
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/reextraer - Re-extrae campos de un PDF ya descargado */
    post<com.acdan.sat.controllers.ReextractRequest, WebResponse> {
        path { "/api/v1/debug/reextraer" }
        fun handle(dto: com.acdan.sat.controllers.ReextractRequest): WebResponse {
            val r = DebugController.reextract(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/reguardar - Re-extrae y guarda los campos de un doc */
    post<com.acdan.sat.controllers.ReguardarRequest, WebResponse> {
        path { "/api/v1/debug/reguardar" }
        fun handle(dto: com.acdan.sat.controllers.ReguardarRequest): WebResponse {
            val r = DebugController.reguardar(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    // Portal del cliente: la URL sola no abre nada, todo exige JWT CLIENTE
    // atado al RFC (o JWT de personal para generar/revocar códigos).

    /** POST /api/v1/portal/codigo/generar - Genera el código de acceso (personal) */
    post<PortalGenerarRequest, WebResponse> {
        path { "/api/v1/portal/codigo/generar" }
        fun handle(dto: PortalGenerarRequest): WebResponse {
            val r = com.acdan.sat.controllers.PortalController.generar(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/portal/codigo/revocar - Revoca el acceso del cliente (personal) */
    post<PortalGenerarRequest, WebResponse> {
        path { "/api/v1/portal/codigo/revocar" }
        fun handle(dto: PortalGenerarRequest): WebResponse {
            val r = com.acdan.sat.controllers.PortalController.revocar(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/portal/entrar - Canjea RFC + código por sesión de cliente */
    post<PortalEntrarRequest, WebResponse> {
        path { "/api/v1/portal/entrar" }
        fun handle(dto: PortalEntrarRequest): WebResponse {
            val r = com.acdan.sat.controllers.PortalController.entrar(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/portal/sesion - Valida una sesión de cliente guardada */
    post<PortalTokenRequest, WebResponse> {
        path { "/api/v1/portal/sesion" }
        fun handle(dto: PortalTokenRequest): WebResponse {
            val r = com.acdan.sat.controllers.PortalController.sesion(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/portal/resumen - Resumen del cliente dueño de la sesión */
    post<PortalTokenRequest, WebResponse> {
        path { "/api/v1/portal/resumen" }
        fun handle(dto: PortalTokenRequest): WebResponse {
            val r = com.acdan.sat.controllers.PortalController.resumen(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/portal/docs - Documentos del cliente dueño de la sesión */
    post<PortalTokenRequest, WebResponse> {
        path { "/api/v1/portal/docs" }
        fun handle(dto: PortalTokenRequest): WebResponse {
            val r = com.acdan.sat.controllers.PortalController.docs(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }

    /** POST /api/v1/portal/pdf - Sirve el PDF solo al dueño de la sesión */
    post<PortalPdfRequest, WebResponse> {
        path { "/api/v1/portal/pdf" }
        fun handle(dto: PortalPdfRequest): WebResponse {
            val r = com.acdan.sat.controllers.PortalController.pdf(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode, headers = corsHeaders)
        }
        script { ::handle }
    }
}

