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
    @Synchronized
    fun solicitar(payload: SatSolicitarRequest): ControllerResponse {
        val rfc = payload.rfc.trim().uppercase()
        if (rfc.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUIRED"}""")
        if (!com.acdan.sat.schemas.RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        if (payload.tipos.isEmpty() || payload.tipos.any { it !in setOf("32d", "constancia", "cfdi") })
            return ControllerResponse(400, """{"error":"TIPOS_INVALIDOS"}""")
        val periodo = if ("cfdi" in payload.tipos) {
            val mes = if (payload.periodo.isBlank()) com.acdan.sat.scripts.CfdiStore.ultimoMesCerrado()
                else runCatching { java.time.YearMonth.parse(payload.periodo) }.getOrNull()
                    ?: return ControllerResponse(400, """{"error":"PERIODO_INVALIDO"}""")
            if (mes > com.acdan.sat.scripts.CfdiStore.ultimoMesCerrado()) return ControllerResponse(400, """{"error":"MES_NO_CERRADO"}""")
            mes.toString()
        } else ""
        val jobId = UUID.randomUUID().toString()
        val dynamo = app.getInstance(DynamoClient::class)
        val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
        val actual = dynamo.scanItems(jobsTable).firstOrNull {
            it["rfc"]?.toString() == rfc && it["status"]?.toString() in setOf("queued", "login", "captcha", "descargando", "extrayendo", "consultando_cfdi", "descargando_cfdi")
        }
        if (actual != null) return ControllerResponse(409, Json.obj(mapOf("error" to "JOB_EN_CURSO", "jobId" to actual["jobId"].toString())))
        dynamo.insertItem(jobsTable, mapOf(
            "pk" to jobId, "jobId" to jobId, "rfc" to rfc,
            "tipos" to payload.tipos.joinToString(","), "status" to "queued",
            "periodo" to periodo, "updatedAt" to Instant.now().toString()
        ))
        val req = SatBotRequest(jobId, rfc, payload.tipos.distinct(), periodo)
        if (env("KQ_SQS_QUEUE_URL", required = false, default = "").isNotBlank()) {
            runCatching { ::satBotJob.asJob(req).dispatchToQueue() }.getOrElse {
                dynamo.insertItem(jobsTable, mapOf("pk" to jobId, "jobId" to jobId, "rfc" to rfc, "tipos" to payload.tipos.joinToString(","), "periodo" to periodo, "status" to "error", "error" to "No se pudo encolar", "updatedAt" to Instant.now().toString()))
                return ControllerResponse(500, """{"error":"QUEUE_FAILED"}""")
            }
        } else pool.submit { runCatching { satBotJob(req) } }
        return ControllerResponse(200, """{"ok":true,"jobId":"$jobId","status":"queued"}""")
    }

    /**
     * Bitácora de corridas por RFC: historial de jobs (éxitos y fallos con su
     * clasificación) ordenado del más reciente al más viejo. Base de la línea
     * de tiempo que ve el contador en el detalle del cliente.
     *
     * @param rfc Registro Federal de Contribuyentes.
     * @return [ControllerResponse] con el historial JSON (máx 50).
     */
    fun historial(rfc: String): ControllerResponse {
        val key = rfc.trim().uppercase()
        if (key.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUIRED"}""")
        val dynamo = app.getInstance(DynamoClient::class)
        val jobsTable = env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS")
        val items = runCatching { dynamo.scanItems(jobsTable) }.getOrDefault(emptyList())
            .filter { (it["rfc"]?.toString()?.uppercase() ?: "") == key }
            .sortedByDescending { it["updatedAt"]?.toString().orEmpty() }
            .take(50)
        val json = items.joinToString(",", "[", "]") { Json.obj(it, sinTruncar = setOf("error"), max = 500) }
        return ControllerResponse(200, json)
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
        val items = dynamo.scanItems(docsTable).filter { it["rfc"]?.toString() == rfc.uppercase() && it["tipo"]?.toString() in setOf("32d", "constancia") }
        // `campos` es JSON anidado: si se trunca a media estructura el front no lo parsea.
        val json = items.joinToString(",", "[", "]") { Json.obj(it, sinTruncar = setOf("campos")) }
        return ControllerResponse(200, json)
    }

    /**
     * Heartbeat del SAT: sonda ligera de alcanzabilidad (sin captcha ni login,
     * no gasta intentos) de los tres frentes que usa el bot. Sirve para saber
     * antes de correr si el SAT responde, filtra (403) o está caído.
     *
     * @return [ControllerResponse] con estado global y detalle por host.
     */
    fun salud(): ControllerResponse {
        val objetivos = listOf(
            "login" to "https://login.siat.sat.gob.mx/nidp/app/login?id=ciec&sid=0&option=credential&sid=0",
            "32d" to "https://ptsc32d.clouda.sat.gob.mx/",
            "acuses" to "https://wwwmat.sat.gob.mx/operacion/43824/reimprime-tus-acuses-del-rfc"
        )
        val cliente = java.net.http.HttpClient.newBuilder()
            .connectTimeout(java.time.Duration.ofSeconds(8))
            .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
            // HTTP/1.1 explícito: algunos frentes del SAT rompen el handshake con ALPN/HTTP2.
            .version(java.net.http.HttpClient.Version.HTTP_1_1)
            .build()
        val resultados = objetivos.map { (nombre, url) ->
            val t0 = System.currentTimeMillis()
            var codigo = -1
            var nota = "sin-respuesta"
            try {
                val req = java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                    .timeout(java.time.Duration.ofSeconds(10))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36")
                    .GET().build()
                val resp = cliente.send(req, java.net.http.HttpResponse.BodyHandlers.discarding())
                codigo = resp.statusCode()
                nota = when {
                    codigo == 403 -> "responde-pero-filtra"
                    codigo in 200..399 -> "ok"
                    else -> "http-$codigo"
                }
            } catch (e: javax.net.ssl.SSLException) {
                // El login nidp usa una cadena que el cacerts de Java no traga
                // (curl y el navegador sí llegan). Fallback: si el 443 abre, el host vive.
                try {
                    java.net.Socket().use { s ->
                        s.connect(java.net.InetSocketAddress(java.net.URI.create(url).host, 443), 5000)
                        codigo = 0
                        nota = "tcp-ok"
                    }
                } catch (e2: Exception) {
                    nota = (e2.javaClass.simpleName ?: "error").take(40)
                }
            } catch (e: Exception) {
                nota = (e.javaClass.simpleName ?: "error").take(40)
            }
            val ms = System.currentTimeMillis() - t0
            Triple(nombre, codigo, nota to ms)
        }
        val items = resultados.map { (nombre, codigo, notaMs) ->
            val (nota, ms) = notaMs
            """{"nombre":"$nombre","alcanzable":${codigo >= 0},"codigo":$codigo,"ms":$ms,"nota":"$nota"}"""
        }
        // tcp-ok cuenta como vivo para el global: el bot usa navegador real,
        // que sí completa el TLS donde Java no puede. El punto por host sigue
        // en ámbar para no esconder el matiz.
        val oks = resultados.count { it.third.first == "ok" || it.third.first == "tcp-ok" }
        val alcanzables = resultados.count { it.second >= 0 }
        val estado = when {
            oks == resultados.size -> "vivo"
            alcanzables == 0 -> "caido"
            else -> "degradado"
        }
        val cuerpo = """{"ok":true,"estado":"$estado","medidoEn":"${Instant.now()}","hosts":[${items.joinToString(",")}]}"""
        return ControllerResponse(200, cuerpo)
    }
}
