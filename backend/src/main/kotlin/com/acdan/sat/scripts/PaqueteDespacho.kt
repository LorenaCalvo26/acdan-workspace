package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import org.apache.poi.ss.usermodel.IndexedColors
import org.apache.poi.ss.usermodel.FillPatternType
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Duration
import java.time.YearMonth
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Paquete mensual de una cartera: un ZIP por despacho con una carpeta por RFC
 * (XML, PDF y el Excel del mes) más un índice de la cartera.
 *
 * El ZIP se arma en /tmp, se sube al bucket de documentos y se devuelve una liga
 * firmada de 7 días: el correo nunca lleva el archivo adjunto.
 */
object PaqueteDespacho {
    data class Fila(val rfc: String, val nombre: String, val emitidas: Int, val recibidas: Int, val total: String)
    data class Resultado(
        val despacho: String,
        val periodo: String,
        val cliente: Int,
        val archivos: Int,
        val bytes: Long,
        val url: String,
        val clave: String
    )

    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun docsBucket() = env("S3_BUCKET", required = false, default = "")
    private fun prefijo() = env("S3_PREFIX", required = false, default = "")

    private val s3: S3Client? by lazy {
        runCatching {
            S3Client.builder()
                .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
                .build()
        }.getOrNull()
    }

    private fun clave(relativa: String) =
        (listOf(prefijo(), relativa.trim('/')).filter { it.isNotBlank() }).joinToString("/")

    private fun bytesCfdi(rfc: String, periodo: String, vista: String, nombre: String): ByteArray? {
        val c = s3 ?: return null
        val k = clave("cfdi-storage/$rfc/$periodo/$vista/$nombre")
        return runCatching {
            c.getObjectAsBytes(GetObjectRequest.builder().bucket(docsBucket()).key(k).build()).asByteArray()
        }.getOrNull()
    }

    private fun indiceExcel(filas: List<Fila>, despacho: String, periodo: YearMonth): ByteArray {
        XSSFWorkbook().use { wb ->
            val hoja = wb.createSheet("Índice")
            val cab = hoja.createRow(0)
            listOf("RFC", "Nombre", "Emitidas", "Recibidas", "Total").forEachIndexed { i, v ->
                cab.createCell(i).setCellValue(v)
                cab.getCell(i).cellStyle = wb.createCellStyle().apply {
                    fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
                    fillPattern = FillPatternType.SOLID_FOREGROUND
                    setFont(wb.createFont().apply { bold = true })
                }
            }
            filas.forEachIndexed { n, f ->
                val r = hoja.createRow(n + 1)
                r.createCell(0).setCellValue(f.rfc)
                r.createCell(1).setCellValue(f.nombre)
                r.createCell(2).setCellValue(f.emitidas.toDouble())
                r.createCell(3).setCellValue(f.recibidas.toDouble())
                r.createCell(4).setCellValue(f.total)
            }
            hoja.setColumnWidth(0, 20 * 256)
            hoja.setColumnWidth(1, 34 * 256)
            val bos = ByteArrayOutputStream()
            wb.write(bos)
            return bos.toByteArray()
        }
    }

    /**
     * Arma el paquete de [despachoRfc] para [periodo].
     * Devuelve null si el despacho no tiene clientes o ninguno tiene CFDI del mes.
     */
    fun generar(despachoRfc: String, periodo: YearMonth): Resultado? {
        val clientesTable = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
        val cfdiTable = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
        val bucket = docsBucket()
        val clienteS3 = s3
        if (bucket.isBlank() || clienteS3 == null) return null

        val clientes = runCatching { dynamo().scanItems(clientesTable) }.getOrDefault(emptyList())
            .filter { it["despacho"]?.toString()?.uppercase() == despachoRfc.uppercase() }
            .sortedBy { it["rfc"]?.toString().orEmpty() }
        if (clientes.isEmpty()) return null

        val cfdi = runCatching { dynamo().scanItems(cfdiTable) }.getOrDefault(emptyList())
            .filter { it["tipo"]?.toString() == "cfdi" && it["periodo"]?.toString() == periodo.toString() }
            .groupBy { it["rfc"]?.toString()?.uppercase().orEmpty() }

        val tmp = File.createTempFile("paquete-", ".zip")
        var archivos = 0
        val indice = mutableListOf<Fila>()
        try {
            ZipOutputStream(tmp.outputStream().buffered()).use { zip ->
                for (cli in clientes) {
                    val rfc = cli["rfc"]?.toString()?.uppercase().orEmpty()
                    if (rfc.isBlank()) continue
                    val nombre = cli["nombre"]?.toString().orEmpty()
                    val items = cfdi[rfc].orEmpty()
                    val emitidas = items.count { it["vista"]?.toString() == "emitidas" }
                    val recibidas = items.count { it["vista"]?.toString() == "recibidas" }
                    val total = items.sumOf { item ->
                        val x = item["xmlDatos"]?.toString().orEmpty()
                        Regex("\"total\"\\s*:\\s*\"?([0-9.]+)").find(x)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
                    }

                    if (items.isNotEmpty()) {
                        // Excel del mes
                        val planos = items.map { item ->
                            val m = item.mapValues { it.value.toString() }.toMutableMap<String, Any>()
                            m["campos"] = runCatching {
                                com.fasterxml.jackson.databind.ObjectMapper().readValue(item["campos"].toString(), Map::class.java)
                            }.getOrDefault(emptyMap<String, Any>())
                            m["xmlDatos"] = runCatching {
                                com.fasterxml.jackson.databind.ObjectMapper().readValue(item["xmlDatos"].toString(), Map::class.java)
                            }.getOrDefault(emptyMap<String, Any>())
                            m
                        }
                        val excel = CfdiExcel.generar(rfc, periodo, planos)
                        zip.putNextEntry(ZipEntry("$rfc/$rfc-$periodo.xlsx"))
                        zip.write(excel); zip.closeEntry(); archivos++

                        for (item in items) {
                            val vista = item["vista"]?.toString() ?: continue
                            val folio = item["folio"]?.toString()?.uppercase() ?: continue
                            for (ext in listOf("xml", "pdf")) {
                                val disponible = item["${ext}Disponible"]?.toString() == "true" ||
                                    item["${ext}Guardado"]?.toString() == "true"
                                if (!disponible) continue
                                val b = bytesCfdi(rfc, periodo.toString(), vista, "$folio.$ext") ?: continue
                                zip.putNextEntry(ZipEntry("$rfc/${ext.uppercase()}/$folio.$ext"))
                                zip.write(b); zip.closeEntry(); archivos++
                            }
                        }
                    }
                    indice += Fila(rfc, nombre, emitidas, recibidas, String.format("%.2f", total))
                }

                zip.putNextEntry(ZipEntry("INDICE.xlsx"))
                zip.write(indiceExcel(indice, despachoRfc, periodo)); zip.closeEntry()
            }

            if (archivos == 0) return null

            val claveZip = clave("paquetes/$despachoRfc/$periodo.zip")
            clienteS3.putObject(
                PutObjectRequest.builder().bucket(bucket).key(claveZip).contentType("application/zip").build(),
                RequestBody.fromFile(tmp)
            )

            val presigner = S3Presigner.builder()
                .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
                .build()
            val url = presigner.presignGetObject(
                GetObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofDays(7))
                    .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(claveZip).build())
                    .build()
            ).url().toString()
            presigner.close()

            return Resultado(
                despacho = despachoRfc,
                periodo = periodo.toString(),
                cliente = indice.count { it.emitidas + it.recibidas > 0 },
                archivos = archivos,
                bytes = tmp.length(),
                url = url,
                clave = claveZip
            )
        } finally {
            tmp.delete()
        }
    }
}
