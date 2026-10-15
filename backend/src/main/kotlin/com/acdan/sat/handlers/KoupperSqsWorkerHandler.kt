package com.acdan.sat.handlers

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.koupper.octopus.createDefaultConfiguration
import com.koupper.orchestrator.JobRunner
import com.koupper.orchestrator.JobSerializer
import java.io.File

private object KoupperWorkerBootstrap {
    @Volatile
    private var initialized = false

    fun ensureInitialized() {
        if (!initialized) {
            synchronized(this) {
                if (!initialized) {
                    val writableBase = File("/tmp/koupper-runtime")
                    writableBase.mkdirs()
                    File(writableBase, ".koupper").mkdirs()
                    System.setProperty("user.home", writableBase.absolutePath)
                    System.setProperty("user.dir", writableBase.absolutePath)
                    createDefaultConfiguration()
                    initialized = true
                }
            }
        }
    }
}

class KoupperSqsWorkerHandler : RequestHandler<SQSEvent, Map<String, Any>> {
    companion object {
        /** Ejecuta un mensaje de la cola. true = hecho (borrar), false = reintentar. */
        fun procesar(body: String): Boolean {
            return try {
                val task = JobSerializer.deserialize(body)
                val taskContext = task.context?.takeIf { it.isNotBlank() } ?: File(".").absolutePath
                JobRunner.runCompiled(taskContext, task)
                true
            } catch (e: Exception) {
                println("[worker] mensaje fallido: ${e.message}")
                false
            }
        }
    }

    override fun handleRequest(event: SQSEvent?, context: Context?): Map<String, Any> {
        KoupperWorkerBootstrap.ensureInitialized()

        val records = event?.records ?: emptyList()
        val failures = mutableListOf<Map<String, String>>()
        var processed = 0

        records.forEach { record ->
            val messageId = record.messageId ?: "unknown"
            val ok = procesar(record.body)
            if (ok) processed += 1
            else {
                context?.logger?.log("[worker] failed messageId=$messageId\n")
                failures += mapOf("itemIdentifier" to messageId)
            }
        }

        return mapOf(
            "ok" to failures.isEmpty(),
            "processed" to processed,
            "failed" to failures.size,
            "batchItemFailures" to failures
        )
    }
}
