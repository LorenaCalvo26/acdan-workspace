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
fun RuntimeRouterDsl.satRoutes() {

    /** POST /api/v1/clientes - Alta o actualización de cliente */
    post<ClienteForm, WebResponse> {
        path { "/api/v1/clientes" }
        fun handle(dto: ClienteForm): WebResponse {
            val r: ControllerResponse = ClienteController.upsert(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/clientes/bulk - Carga masiva de clientes desde Excel/CSV */
    post<BulkUploadRequest, WebResponse> {
        path { "/api/v1/clientes/bulk" }
        fun handle(dto: BulkUploadRequest): WebResponse {
            val r = ClienteController.bulk(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/clientes/frecuencia - Actualización de frecuencia y estado activo */
    post<FrecuenciaForm, WebResponse> {
        path { "/api/v1/clientes/frecuencia" }
        fun handle(dto: FrecuenciaForm): WebResponse {
            if (dto.rfc.isBlank()) return WebResponse(body = """{"error":"RFC_REQUIRED"}""", statusCode = 400)
            val r = ClienteController.frecuencia(dto.rfc, dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/sat/solicitar - Inicia la descarga manual de documentos para un RFC */
    post<SatSolicitarRequest, WebResponse> {
        path { "/api/v1/sat/solicitar" }
        fun handle(dto: SatSolicitarRequest): WebResponse {
            val r = SatController.solicitar(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** GET /api/v1/stats - Obtiene las métricas globales para el Dashboard */
    get<Any, WebResponse> {
        path { "/api/v1/stats" }
        fun handle(dto: Any): WebResponse {
            val r = DashboardController.stats()
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** GET /api/v1/clientes/resumen - Resumen consolidado del último 32-D por cliente */
    get<Any, WebResponse> {
        path { "/api/v1/clientes/resumen" }
        fun handle(dto: Any): WebResponse {
            val r = DashboardController.resumen()
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** GET /api/v1/clientes - Listado paginado de clientes registrados */
    get<ClienteListQuery, WebResponse> {
        path { "/api/v1/clientes" }
        fun handle(dto: ClienteListQuery): WebResponse {
            val limit = if (dto.limit > 0) dto.limit else 20
            val r = ClienteController.listPaginated(limit, dto.cursorToken)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/docs/por-rfc - Consulta de documentos asociados a un RFC */
    post<DocsRequest, WebResponse> {
        path { "/api/v1/docs/por-rfc" }
        fun handle(dto: DocsRequest): WebResponse {
            val r = SatController.docsPorRfc(dto.rfc)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/clientes/eliminar - Baja de cliente y eliminación de clave en Secrets */
    post<DocsRequest, WebResponse> {
        path { "/api/v1/clientes/eliminar" }
        fun handle(dto: DocsRequest): WebResponse {
            val r = ClienteController.eliminar(dto.rfc)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/sat/status - Consulta del estado de un trabajo del bot */
    post<JobStatusRequest, WebResponse> {
        path { "/api/v1/sat/status" }
        fun handle(dto: JobStatusRequest): WebResponse {
            val r = SatController.status(dto.jobId)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/login - Inicio de sesión de usuarios de la plataforma */
    post<AuthLoginRequest, WebResponse> {
        path { "/api/v1/auth/login" }
        fun handle(dto: AuthLoginRequest): WebResponse {
            val r = AuthController.login(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/me - Consulta del perfil del usuario en sesión */
    post<AuthMeRequest, WebResponse> {
        path { "/api/v1/auth/me" }
        fun handle(dto: AuthMeRequest): WebResponse {
            val r = AuthController.me(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/usuarios - Registro de nuevos usuarios administradores */
    post<AuthCreateUserRequest, WebResponse> {
        path { "/api/v1/auth/usuarios" }
        fun handle(dto: AuthCreateUserRequest): WebResponse {
            val r = AuthController.crearUsuario(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/auth/usuarios/list - Listado de usuarios del sistema */
    post<AuthListUsersRequest, WebResponse> {
        path { "/api/v1/auth/usuarios/list" }
        fun handle(dto: AuthListUsersRequest): WebResponse {
            val r = AuthController.listarUsuarios(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** GET /health - Monitoreo de salud del servicio */
    get<Any, WebResponse> {
        path { "/health" }
        fun handle(dto: Any): WebResponse {
            return WebResponse(body = """{"status":"ok"}""", statusCode = 200)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/browser - Diagnóstico de arranque del navegador */
    post<Any, WebResponse> {
        path { "/api/v1/debug/browser" }
        fun handle(dto: Any): WebResponse {
            val r = DebugController.browserTest()
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/captcha - Diagnóstico del módulo resolvedor de captchas */
    post<CaptchaDebugRequest, WebResponse> {
        path { "/api/v1/debug/captcha" }
        fun handle(dto: CaptchaDebugRequest): WebResponse {
            val r = DebugController.solveCaptcha(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }

    /** POST /api/v1/debug/navigate - Diagnóstico de navegación del bot */
    post<NavigateRequest, WebResponse> {
        path { "/api/v1/debug/navigate" }
        fun handle(dto: NavigateRequest): WebResponse {
            val r = DebugController.navigate(dto)
            return WebResponse(body = r.body, statusCode = r.statusCode)
        }
        script { ::handle }
    }
}

