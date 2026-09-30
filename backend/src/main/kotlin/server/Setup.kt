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
    // Inicializar Service Providers nativos de Koupper
    runCatching { InteractiveBrowserServiceProvider().up() }
    runCatching { JWTServiceProvider().up() }
    runCatching { NotificationsServiceProvider().up() }


    router.registerMiddleware("request-log") { ctx ->
        println("[${ctx.method}] ${ctx.path}")
        com.koupper.providers.runtime.router.MiddlewareResult(true, 200, "")
    }
    router.registerRouter {
        cors {
            allowedOrigins = env("CORS_ORIGINS", required = false, default = "http://localhost:5174").split(",")
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
    val port = env("PORT", required = false, default = "8090").toInt()
    router.start(port, "0.0.0.0")
    println("ACDAN SAT backend en http://localhost:$port/api/v1 — health en /health")
    Thread.currentThread().join()
}

