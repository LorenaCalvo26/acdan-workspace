package server

import com.koupper.container.app
import com.koupper.octopus.createDefaultConfiguration
import com.koupper.os.env
import com.koupper.providers.browser.InteractiveBrowserServiceProvider
import com.koupper.providers.jwt.JWTServiceProvider
import com.koupper.providers.notifications.NotificationsServiceProvider
import com.koupper.providers.runtime.router.RuntimeRouterProvider
import http.routes.satRoutes


/**
 * Configuración e inicialización principal del backend de ACDAN SAT Platform sobre Koupper Framework.
 */
fun setupApplication(router: RuntimeRouterProvider) {
    // NOTA: no resetear passwords aquí. Un reseteo forzado en cada arranque
    // invalida las credenciales del admin sin aviso y rompe la demo.
    // Inicializar Service Providers nativos de Koupper.
    // ROLE=api (Lambda): no levantar Chromium; la API no usa el bot.
    val role = env("ROLE", required = false, default = "all")
    if (role != "api") runCatching { InteractiveBrowserServiceProvider().up() }
    runCatching { JWTServiceProvider().up() }
    runCatching { NotificationsServiceProvider().up() }


    router.registerMiddleware("request-log") { ctx ->
        println("[${ctx.method}] ${ctx.path}")
        com.koupper.providers.runtime.router.MiddlewareResult(true, 200, "")
    }
    router.registerRouter {
        cors {
            allowedOrigins = env("CORS_ORIGINS", required = false, default = "*").split(",")
            allowedMethods = listOf("GET", "POST", "PUT", "OPTIONS")
            allowedHeaders = listOf("Content-Type", "Authorization")
        }
        // PDFs descargados por el bot, servidos tal cual para el preview del dash.
        // URL: /pdfs/{RFC}/{docId}.pdf
        staticFiles("/pdfs", "./storage")
        satRoutes()
    }
}

fun main() {
    createDefaultConfiguration()
    val router = app.getInstance(RuntimeRouterProvider::class)
    setupApplication(router)
    val role = env("ROLE", required = false, default = "all")

    // Worker on-demand (ECS RunTask): consume SQS y sale al quedar sin trabajo.
    // No levanta HTTP, ni scheduler, ni espejo local: el API Lambda y EventBridge
    // cubren esos roles y así no queda nada encendido 24/7.
    if (role == "worker") {
        com.acdan.sat.scripts.SqsPoller.runBlocking()
        println("[worker] sin trabajo pendiente; saliendo")
        kotlin.system.exitProcess(0)
    }

    val port = env("PORT", required = false, default = "8090").toInt()
    router.start(port, "0.0.0.0")
    com.acdan.sat.scripts.SchedulerRuntime.start()
    com.acdan.sat.scripts.SqsPoller.iniciar()
    com.acdan.sat.scripts.DocStore.hidratarEspejo()
    println("ACDAN SAT backend en http://localhost:$port/api/v1 — health en /health")
    Thread.currentThread().join()
}

