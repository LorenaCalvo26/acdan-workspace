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
                loop(url)
            } catch (t: Throwable) {
                println("[poller] hilo muerto: ${t.message}")
            }
        }, "sqs-poller").apply { isDaemon = true; start() }
        println("[poller] escuchando $url")
    }

    private fun loop(url: String) {
        val sqs = SqsClient.builder()
            .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
            .build()
        println("[poller] long-poll cada 20s, visibility 30min")
        while (corriendo) {
            try {
                val resp = sqs.receiveMessage(
                    ReceiveMessageRequest.builder()
                        .queueUrl(url)
                        .maxNumberOfMessages(5)
                        .waitTimeSeconds(20)
                        .visibilityTimeout(1800)
                        .build()
                )
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
    }
}
