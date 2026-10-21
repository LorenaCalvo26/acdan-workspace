package com.acdan.sat.scripts

import com.acdan.sat.handlers.KoupperSqsWorkerHandler
import com.koupper.os.env
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.DeleteMessageRequest
import software.amazon.awssdk.services.sqs.model.ReceiveMessageRequest

/**
 * Consumidor SQS para Fargate: pregunta a la cola (long-poll 20s) y ejecuta
 * cada mensaje con el mismo runner del handler Lambda. Si el mensaje falla no
 * se borra: vuelve a la cola tras el visibility timeout y a la DLQ tras 3
 * intentos. Arranca solo cuando KQ_SQS_QUEUE_URL está configurada.
 *
 * Modo on-demand (ROLE=worker): `runBlocking()` procesa la cola y regresa
 * cuando lleva WORKER_IDLE_EXIT_SECONDS sin mensajes. El proceso termina y la
 * tarea Fargate se apaga; no hay servicio ni ALB encendido 24/7.
 */
object SqsPoller {
    @Volatile
    var corriendo = true

    fun iniciar() {
        val url = env("KQ_SQS_QUEUE_URL", required = false, default = "")
        if (url.isBlank()) {
            println("[poller] sin KQ_SQS_QUEUE_URL: modo local (pool interno)")
            return
        }
        Thread({
            try {
                runBlocking()
            } catch (t: Throwable) {
                println("[poller] hilo muerto: ${t.message}")
            }
        }, "sqs-poller").apply { isDaemon = true; start() }
        println("[poller] escuchando $url")
    }

    /**
     * Corre el consumidor en el hilo actual. Con WORKER_IDLE_EXIT_SECONDS > 0
     * sale tras ese tiempo sin mensajes (worker on-demand); con 0 queda
     * escuchando para siempre (servidor local / modo `all`).
     */
    fun runBlocking() {
        val url = env("KQ_SQS_QUEUE_URL", required = false, default = "")
        if (url.isBlank()) {
            println("[poller] sin KQ_SQS_QUEUE_URL: modo local (pool interno)")
            return
        }
        val maxMensajes = env("SQS_MAX_MESSAGES", required = false, default = "1")
            .toIntOrNull()?.coerceIn(1, 10) ?: 1
        val visibility = env("SQS_VISIBILITY", required = false, default = "1800")
            .toIntOrNull()?.coerceAtLeast(30) ?: 1800
        val idleExit = env("WORKER_IDLE_EXIT_SECONDS", required = false, default = "0")
            .toLongOrNull()?.coerceAtLeast(0) ?: 0

        val sqs = SqsClient.builder()
            .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
            .build()
        println("[poller] long-poll 20s, max=$maxMensajes, visibility=${visibility}s, idleExit=${idleExit}s")
        var idlePolls = 0
        while (corriendo) {
            try {
                val resp = sqs.receiveMessage(
                    ReceiveMessageRequest.builder()
                        .queueUrl(url)
                        .maxNumberOfMessages(maxMensajes)
                        .waitTimeSeconds(20)
                        .visibilityTimeout(visibility)
                        .build()
                )
                if (resp.messages().isEmpty()) {
                    if (idleExit > 0) {
                        idlePolls++
                        if (idlePolls * 20 >= idleExit) {
                            println("[poller] ${idleExit}s sin trabajo; saliendo")
                            break
                        }
                    }
                    continue
                }
                idlePolls = 0
                for (m in resp.messages()) {
                    val ok = runCatching { KoupperSqsWorkerHandler.procesar(m.body()) }.getOrDefault(false)
                    if (ok) {
                        runCatching {
                            sqs.deleteMessage(
                                DeleteMessageRequest.builder()
                                    .queueUrl(url).receiptHandle(m.receiptHandle()).build()
                            )
                        }
                        println("[poller] mensaje hecho y borrado")
                    } else {
                        println("[poller] mensaje fallido: vuelve a la cola (reintento/DLQ)")
                    }
                }
            } catch (e: Exception) {
                println("[poller] ${e.message}; reintento en 10s")
                Thread.sleep(10000)
            }
        }
        corriendo = false
    }
}
