package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.Instant
import java.util.UUID

/**
 * Registro de lo que hace el equipo dentro de Pilli: quién da de alta, quién
 * borra, quién regenera accesos. Sirve para responder "¿quién hizo esto?" sin
 * tener que reconstruirlo desde los logs de la nube.
 *
 * Se guarda en la tabla de documentos con `tipo = auditoria`.
 */
object Auditoria {

    private const val TIPO = "auditoria"

    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun tabla() = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")

    /**
     * Nunca interrumpe la operación: si falla el registro, la acción ya hecha
     * sigue siendo válida. Solo deja rastro en el log.
     */
    fun registrar(quien: String, accion: String, detalle: String) {
        runCatching {
            val ahora = Instant.now()
            dynamo().insertItem(
                tabla(),
                mapOf(
                    "pk" to "auditoria#${ahora.toEpochMilli()}-${UUID.randomUUID().toString().take(8)}",
                    "tipo" to TIPO,
                    "usuario" to quien.trim().lowercase().ifBlank { "sistema" },
                    "accion" to accion,
                    "detalle" to detalle,
                    "createdAt" to ahora.toString()
                )
            )
        }.onFailure { println("[auditoria] no se pudo registrar $accion :: ${it.message}") }
    }

    /** Últimos movimientos, del más reciente al más viejo. */
    fun listar(limite: Int = 100): List<Map<String, Any?>> = runCatching {
        dynamo().scanItems(tabla())
            .filter { it["tipo"]?.toString() == TIPO }
            .sortedByDescending { it["createdAt"]?.toString().orEmpty() }
            .take(limite)
            .map { item ->
                mapOf(
                    "usuario" to item["usuario"]?.toString().orEmpty(),
                    "accion" to item["accion"]?.toString().orEmpty(),
                    "detalle" to item["detalle"]?.toString().orEmpty(),
                    "createdAt" to item["createdAt"]?.toString().orEmpty()
                )
            }
    }.getOrDefault(emptyList())

    /** Correo del usuario detrás de un token, para firmar el registro. */
    fun quien(token: String): String =
        runCatching { AuthStore.verificarJwt(token)?.get("email")?.toString().orEmpty() }
            .getOrDefault("")
}
