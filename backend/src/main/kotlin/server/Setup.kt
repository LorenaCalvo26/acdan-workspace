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
            allowedOrigins = env("CORS_ORIGINS", required = false, default = "*").split(",")
            allowedMethods = listOf("GET", "POST", "PUT", "OPTIONS")
            allowedHeaders = listOf("Content-Type", "Authorization")
        }
        // PDFs descargados por el bot, servidos tal cual para el preview del dash.
        // URL: /pdfs/{RFC}/{docId}.pdf
        staticFiles("/pdfs", "./storage")
        satRoutes()
    }

    // Programador local: cada hora encola los clientes con proximoRun vencido.
    // (En cloud esto lo haría EventBridge; en local el tick vive en la JVM.)
    java.util.concurrent.Executors.newSingleThreadScheduledExecutor().scheduleAtFixedRate({
        runCatching {
            val r = com.acdan.sat.scripts.schedulerTick(emptyMap())
            println("[scheduler] tick: ${r.body}")
        }.onFailure { println("[scheduler] tick falló: ${it.message}") }
    }, 60, 3600, java.util.concurrent.TimeUnit.SECONDS)
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

