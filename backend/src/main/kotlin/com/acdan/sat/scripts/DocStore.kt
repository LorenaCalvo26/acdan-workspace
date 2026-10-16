package com.acdan.sat.scripts

import com.koupper.os.env
import java.io.File
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Delete
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.amazon.awssdk.services.s3.model.PutObjectRequest

/**
 * Custodia de archivos con doble motor: disco local (`DOCS_DRIVER=local`, desarrollo)
 * o S3 (`DOCS_DRIVER=s3`, producción).
 *
 * Buenas prácticas aplicadas:
 * - S3 es la fuente de verdad en prod; el disco de Fargate es efímero y se pierde.
 * - Los PDF chicos (32-D/constancia) llevan espejo local: los lectores actuales
 *   (`/pdfs`, portal, debug) siguen funcionando sin cambios.
 * - Los CFDI (pesados) van solo a S3 con restauración bajo demanda.
 * - Misma ruta relativa en ambos motores: `storage/{RFC}/...`, `cfdi-storage/...`.
 */
object DocStore {
    data class Guardado(val archivo: File, val clave: String)

    fun driver() = env("DOCS_DRIVER", required = false, default = "local").lowercase()
    fun esS3() = driver() == "s3"
    private fun bucket() = env("S3_BUCKET", required = false, default = "")
    private fun prefijo() = env("S3_PREFIX", required = false, default = "").trim().trim('/')
    fun clave(relativa: String) = (listOf(prefijo(), relativa.trim('/')).filter { it.isNotBlank() }).joinToString("/")

    private val s3: S3Client? by lazy {
        if (!esS3() || bucket().isBlank()) null else runCatching {
            S3Client.builder()
                .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
                .build()
        }.getOrNull()
    }

    /** Guarda el PDF de 32-D/constancia. En S3 también deja espejo local (ver arriba). */
    fun guardarPdf(rfc: String, docId: String, bytes: ByteArray): Guardado {
        val relativa = "storage/$rfc/$docId.pdf"
        val local = File("./$relativa").apply { parentFile.mkdirs(); writeBytes(bytes) }
        val c = s3
        if (c != null) {
            runCatching {
                c.putObject(
                    PutObjectRequest.builder().bucket(bucket()).key(clave(relativa))
                        .contentType("application/pdf").build(),
                    RequestBody.fromBytes(bytes)
                )
            }.onFailure { println("[docstore] no se pudo subir $relativa: ${it.message}") }
        }
        return Guardado(local, if (c != null) "s3:$relativa" else local.path)
    }

    /** Lee el PDF (local, espejo o S3 con restauración). */
    fun leerPdf(rfc: String, docId: String): ByteArray? {
        val local = File("./storage/$rfc/$docId.pdf")
        if (local.isFile) return runCatching { local.readBytes() }.getOrNull()
        val c = s3 ?: return null
        return runCatching {
            val bytes = c.getObjectAsBytes(
                GetObjectRequest.builder().bucket(bucket()).key(clave("storage/$rfc/$docId.pdf")).build()
            ).asByteArray()
            local.parentFile.mkdirs()
            local.writeBytes(bytes)
            bytes
        }.getOrNull()
    }

    fun existePdf(rfc: String, docId: String): Boolean {
        if (File("./storage/$rfc/$docId.pdf").isFile) return true
        val c = s3 ?: return false
        return runCatching {
            c.headObject(
                HeadObjectRequest.builder().bucket(bucket()).key(clave("storage/$rfc/$docId.pdf")).build()
            )
            true
        }.getOrDefault(false)
    }

    /** Respalda un CFDI ya validado en disco hacia S3. */
    fun respaldarCfdi(rutaLocal: File, rfc: String, periodo: String, vista: String, nombre: String) {
        val c = s3 ?: return
        if (!rutaLocal.isFile) return
        val rel = "cfdi-storage/$rfc/$periodo/$vista/$nombre"
        runCatching {
            val mime = when {
                nombre.endsWith(".xml") -> "application/xml"
                else -> "application/pdf"
            }
            c.putObject(
                PutObjectRequest.builder().bucket(bucket()).key(clave(rel))
                    .contentType(mime).build(),
                RequestBody.fromFile(rutaLocal)
            )
        }.onFailure { println("[docstore] no se pudo respaldar $rel: ${it.message}") }
    }

    /** Restaura un CFDI de S3 al disco local. Devuelve true si quedó disponible. */
    fun restaurarCfdi(rutaLocal: File, rfc: String, periodo: String, vista: String, nombre: String): Boolean {
        if (rutaLocal.isFile) return true
        val c = s3 ?: return false
        return runCatching {
            val bytes = c.getObjectAsBytes(
                GetObjectRequest.builder().bucket(bucket())
                    .key(clave("cfdi-storage/$rfc/$periodo/$vista/$nombre")).build()
            ).asByteArray()
            rutaLocal.parentFile.mkdirs()
            rutaLocal.writeBytes(bytes)
            true
        }.getOrDefault(false)
    }

    /** Baja de S3 a disco todo el espejo storage/ (32-D/constancia) que falte.
     * Repara el visor staff `/pdfs` tras wipes del disco efímero (redeploys).
     * Corre en hilo fondo y nunca bloquea el arranque. */
    fun hidratarEspejo() {
        val c = s3 ?: return
        Thread({
            try {
                val base = clave("storage")
                var token: String? = null
                var bajados = 0
                do {
                    val req = ListObjectsV2Request.builder().bucket(bucket())
                        .prefix("$base/").continuationToken(token).build()
                    val res = c.listObjectsV2(req)
                    for (obj in res.contents()) {
                        // Misma ruta relativa que en disco: storage/{RFC}/...
                        val rel = "storage/" + obj.key().removePrefix("$base/")
                        if (rel == "storage/") continue
                        val local = File("./$rel")
                        if (!local.isFile) {
                            runCatching {
                                val bytes = c.getObjectAsBytes(
                                    software.amazon.awssdk.services.s3.model.GetObjectRequest.builder()
                                        .bucket(bucket()).key(obj.key()).build()
                                ).asByteArray()
                                local.parentFile.mkdirs()
                                local.writeBytes(bytes)
                                bajados++
                            }
                        }
                    }
                    token = res.nextContinuationToken()
                } while (!token.isNullOrBlank())
                println("[docstore] espejo hidratado: $bajados PDFs restaurados")
            } catch (t: Throwable) {
                println("[docstore] hidratar espejo falló: ${t.message}")
            }
        }, "docstore-hidratar").apply { isDaemon = true; start() }
    }

    /** Borra todo rastro de un RFC en ambos motores. */
    fun borrarRfc(rfc: String) {
        runCatching { File("./storage/$rfc").takeIf { it.exists() }?.deleteRecursively() }
        runCatching { File("./cfdi-storage/$rfc").takeIf { it.exists() }?.deleteRecursively() }
        val c = s3 ?: return
        for (base in listOf("storage/$rfc", "cfdi-storage/$rfc")) {
            runCatching {
                var token: String? = null
                do {
                    val req = ListObjectsV2Request.builder().bucket(bucket())
                        .prefix(clave(base) + "/").continuationToken(token).build()
                    val res = c.listObjectsV2(req)
                    val ids = res.contents().map { ObjectIdentifier.builder().key(it.key()).build() }
                    if (ids.isNotEmpty()) {
                        c.deleteObjects(
                            DeleteObjectsRequest.builder().bucket(bucket())
                                .delete(Delete.builder().objects(ids).build()).build()
                        )
                    }
                    token = res.nextContinuationToken()
                } while (!token.isNullOrBlank())
            }.onFailure { println("[docstore] no se pudo borrar $base: ${it.message}") }
        }
    }
}
