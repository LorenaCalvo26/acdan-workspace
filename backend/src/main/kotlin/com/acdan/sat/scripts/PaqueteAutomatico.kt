package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth

/**
 * Envio automatico del paquete mensual.
 *
 * Cuando toda la cartera de un despacho ya termino de operar el mes (todos sus
 * clientes con una corrida en estado final), se arma el paquete y se avisa por
 * correo una sola vez. El tick horario llama aqui.
 */
object PaqueteAutomatico {
    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun docsTable() = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
    private fun despachosTable() = env("ACDAN_DESPACHOS", required = false, default = "ACDAN_DESPACHOS")
    private fun clientesTable() = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
    private fun usuariosTable() = env("ACDAN_USERS", required = false, default = "ACDAN_USERS")

    private val TERMINALES = setOf("listo", "error", "parcial")

    /** Marca para no mandar dos veces el paquete del mismo mes. */
    private fun marca(despacho: String, periodo: String) = "paquete#$despacho#$periodo"

    private fun yaEnviado(despacho: String, periodo: String): Boolean {
        val id = marca(despacho, periodo)
        return runCatching { dynamo().getItem(docsTable(), "pk", id) }.getOrNull() != null
    }

    private fun marcarEnviado(despacho: String, periodo: String, r: PaqueteDespacho.Resultado) {
        runCatching {
            dynamo().insertItem(
                docsTable(),
                mapOf(
                    "pk" to marca(despacho, periodo),
                    "tipo" to "paquete",
                    "despacho" to despacho,
                    "periodo" to periodo,
                    "clave" to r.clave,
                    "cliente" to r.cliente.toString(),
                    "archivos" to r.archivos.toString(),
                    "bytes" to r.bytes.toString(),
                    "enviadoEn" to Instant.now().toString()
                )
            )
        }
    }

    private fun destinatarios(despacho: String): List<String> =
        if (despacho == PaqueteDespacho.CLAVE_INDIVIDUALES) {
            runCatching { dynamo().scanItems(usuariosTable()) }.getOrDefault(emptyList())
                .filter { it["rol"]?.toString() == "ADMIN" && it["status"]?.toString() != "inactive" }
                .mapNotNull { it["email"]?.toString()?.takeIf { e -> e.isNotBlank() } }
        } else {
            runCatching { dynamo().getItem(despachosTable(), "pk", despacho) }.getOrNull()
                ?.get("email")?.toString()?.takeIf { it.isNotBlank() }?.let { listOf(it) }.orEmpty()
        }

    private fun marcaDespacho(despacho: String): Pair<String, String> =
        if (despacho == PaqueteDespacho.CLAVE_INDIVIDUALES) "ACDAN Consultores" to ""
        else {
            val d = runCatching { dynamo().getItem(despachosTable(), "pk", despacho) }.getOrNull()
            d?.get("nombre")?.toString().orEmpty() to d?.get("logoUrl")?.toString().orEmpty()
        }

    /**
     * Revisa si alguna cartera ya termino el mes y manda su paquete.
     * Procesa como maximo [maximo] paquetes por llamada para no agotar el tiempo
     * de la Lambda; el siguiente tick continua con los demas.
     */
    fun revisar(periodo: YearMonth, maximo: Int = 1): List<String> {
        val clientes = runCatching { dynamo().scanItems(clientesTable()) }.getOrDefault(emptyList())
        val jobs = runCatching {
            dynamo().scanItems(env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS"))
        }.getOrDefault(emptyList())
        val docs = runCatching { dynamo().scanItems(docsTable()) }.getOrDefault(emptyList())

        // Clientes por cartera (un RFC solo pertenece a una).
        val carteras = mutableMapOf<String, MutableList<Map<String, Any?>>>()
        for (c in clientes) {
            if (c["activo"]?.toString() == "false") continue
            val clave = c["despacho"]?.toString()?.uppercase().orEmpty().ifBlank { PaqueteDespacho.CLAVE_INDIVIDUALES }
            carteras.getOrPut(clave) { mutableListOf() }.add(c)
        }

        val enviados = mutableListOf<String>()
        for ((despacho, miembros) in carteras) {
            if (enviados.size >= maximo) break
            val conCfdi = miembros.filter { it["cfdiMensual"]?.toString() != "false" }
            if (conCfdi.isEmpty()) continue
            if (yaEnviado(despacho, periodo.toString())) continue

            // Interruptor por despacho: apagado = no se manda solo (los individuales siempre van).
            if (despacho != PaqueteDespacho.CLAVE_INDIVIDUALES) {
                val cfg = runCatching { dynamo().getItem(despachosTable(), "pk", despacho) }.getOrNull()
                if (cfg?.get("paqueteAuto")?.toString() == "false") continue
            }

            // Todos deben tener una corrida final del mes.
            val terminados = conCfdi.count { c ->
                val rfc = c["rfc"]?.toString()?.uppercase().orEmpty()
                jobs.any {
                    it["rfc"]?.toString()?.uppercase() == rfc &&
                        it["periodo"]?.toString() == periodo.toString() &&
                        it["status"]?.toString() in TERMINALES
                }
            }
            if (terminados < conCfdi.size) continue

            val r = runCatching { PaqueteDespacho.generar(despacho, periodo) }.getOrNull() ?: continue
            val (nombre, logo) = marcaDespacho(despacho)
            val caduca = LocalDate.now().plusDays(30).toString()
            for (para in destinatarios(despacho).distinct()) {
                runCatching {
                    EmailNotifier.notificarPaquete(
                        para = para,
                        nombreDespacho = nombre,
                        logoDespacho = logo,
                        periodo = periodo,
                        clientes = r.cliente,
                        archivos = r.archivos,
                        bytes = r.bytes,
                        liga = r.url,
                        caduca = caduca
                    )
                }
            }
            marcarEnviado(despacho, periodo.toString(), r)
            enviados.add(despacho)
        }
        return enviados
    }
}
