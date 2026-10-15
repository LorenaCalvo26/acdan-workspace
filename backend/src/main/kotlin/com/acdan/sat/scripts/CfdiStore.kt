package com.acdan.sat.scripts

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.io.ByteArrayInputStream
import java.io.File
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import javax.xml.parsers.DocumentBuilderFactory

data class CfdiPendiente(val id: String, val rfc: String, val periodo: YearMonth, val vista: String,
                         val folio: String, val acciones: Map<String, String>)

/** Metadatos idempotentes por RFC/periodo/vista/folio y archivos locales custodiados por RFC. */
object CfdiStore {
    private val mapper = jacksonObjectMapper()
    val zona: ZoneId = ZoneId.of("America/Mexico_City")
    fun ultimoMesCerrado(ahora: Instant = Instant.now()): YearMonth = YearMonth.from(ahora.atZone(zona)).minusMonths(1)
    private fun db() = app.getInstance(DynamoClient::class)
    private fun tabla() = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
    fun id(rfc: String, periodo: YearMonth, vista: String, folio: String) = "cfdi-$rfc-$periodo-$vista-$folio"
    fun archivo(p: CfdiPendiente, formato: String) = File("./cfdi-storage/${p.rfc}/${p.periodo}/${p.vista}/${p.folio}.${if (formato == "acuse") "acuse.pdf" else formato}")

    fun registrar(rfc: String, periodo: YearMonth, vistaPortal: String, captura: JsonNode): List<CfdiPendiente> {
        val vista = if (vistaPortal == "emisor") "emitidas" else "recibidas"
        return captura.path("grids").flatMap { grid ->
            val headers = grid.path("encabezados").map { it.asText() }
            grid.path("registros").map { row ->
                val campos = headers.zip(row.path("valores").map { it.asText() }).toMap()
                val folio = java.util.UUID.fromString(campos.getValue("Folio Fiscal")).toString().uppercase()
                check(campos[if (vista == "emitidas") "RFC Emisor" else "RFC Receptor"] == rfc) { "CFDI pertenece a otro RFC" }
                check(campos.getValue("Fecha de Emisión").startsWith(periodo.toString())) { "CFDI fuera del periodo solicitado" }
                val id = id(rfc, periodo, vista, folio)
                val previo = db().getItem(tabla(), "pk", id)?.mapValues { it.value.toString() }.orEmpty()
                val acciones = row.path("acciones").filter { it.hasNonNull("onclick") }
                    .associate { it.path("id").asText() to it.path("onclick").asText() }
                db().insertItem(tabla(), previo + mapOf(
                    "pk" to id, "docId" to id, "rfc" to rfc, "tipo" to "cfdi", "periodo" to periodo.toString(),
                    "vista" to vista, "folio" to folio, "campos" to mapper.writeValueAsString(campos),
                    "clasificacion" to (previo["clasificacion"] ?: when (campos["Efecto del Comprobante"]) {
                        "Ingreso" -> "Factura"; "Egreso" -> "Nota de crédito"; "Pago" -> "Complemento de pago"
                        "Nómina", "Nomina" -> "Nómina"; "Traslado" -> "Traslado"; else -> "Otro"
                    }),
                    "xmlDisponible" to acciones.containsKey("BtnDescarga").toString(),
                    "pdfDisponible" to acciones.containsKey("BtnRI").toString(),
                    "acuseDisponible" to acciones.keys.any { it.startsWith("BtnRecuperaAcuse") }.toString(),
                    "estadoDescarga" to (previo["estadoDescarga"] ?: "pendiente"),
                    "createdAt" to (previo["createdAt"] ?: Instant.now().toString()), "updatedAt" to Instant.now().toString()
                ))
                CfdiPendiente(id, rfc, periodo, vista, folio, acciones)
            }
        }.distinctBy { it.id }
    }

    /** Valida el contenido contra el folio/RFC, no solo la extensión del archivo. */
    fun validar(bytes: ByteArray, formato: String, p: CfdiPendiente) {
        if (formato != "xml") {
            check(bytes.size > 5 && String(bytes.copyOfRange(0, 5), Charsets.US_ASCII) == "%PDF-") { "SAT no devolvió un PDF válido" }
            return
        }
        val doc = leerXml(bytes)
        check(doc.documentElement.localName == "Comprobante") { "SAT no devolvió un XML CFDI" }
        val timbre = doc.getElementsByTagNameNS("http://www.sat.gob.mx/TimbreFiscalDigital", "TimbreFiscalDigital").item(0) as? org.w3c.dom.Element
        check(timbre?.getAttribute("UUID")?.equals(p.folio, true) == true) { "UUID del XML no coincide con el registro" }
        val rol = if (p.vista == "emitidas") "Emisor" else "Receptor"
        val parte = doc.getElementsByTagNameNS("*", rol).item(0) as? org.w3c.dom.Element
        check(parte?.getAttribute("Rfc")?.uppercase() == p.rfc) { "RFC del XML no coincide con el cliente" }
    }

    internal fun leerXml(bytes: ByteArray): org.w3c.dom.Document {
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            setFeature("http://xml.org/sax/features/external-general-entities", false)
            setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            setXIncludeAware(false)
            isExpandEntityReferences = false
        }
        return factory.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
    }

    fun descargar(browser: SatBrowser, p: CfdiPendiente): Boolean {
        val previo = db().getItem(tabla(), "pk", p.id)!!.mapValues { it.value.toString() }.toMutableMap()
        val acciones = mapOf("xml" to p.acciones["BtnDescarga"], "pdf" to p.acciones["BtnRI"],
            "acuse" to (p.acciones["BtnRecuperaAcuseFinal"] ?: p.acciones.entries.firstOrNull { it.key.startsWith("BtnRecuperaAcuse") }?.value))
        val errores = mutableListOf<String>()
        for ((formato, accion) in acciones) {
            if (accion == null) continue
            val file = archivo(p, formato)
            try {
                // Traslada únicamente archivos de esta integración, ya validados,
                // fuera del directorio público legacy /pdfs.
                val anterior = File("./storage/${p.rfc}/cfdi/${p.periodo}/${p.vista}/${file.name}")
                if (!file.exists() && anterior.isFile) {
                    validar(anterior.readBytes(), formato, p)
                    file.parentFile.mkdirs()
                    java.nio.file.Files.move(anterior.toPath(), file.toPath())
                }
                if (!file.exists() && DocStore.esS3()) {
                    DocStore.restaurarCfdi(file, p.rfc, p.periodo.toString(), p.vista, file.name)
                }
                if (!file.exists() || runCatching { validar(file.readBytes(), formato, p) }.isFailure) {
                    val bytes = browser.descargarArchivoCfdi(p.vista, formato, accion)
                    validar(bytes, formato, p)
                    file.parentFile.mkdirs()
                    file.writeBytes(bytes)
                    DocStore.respaldarCfdi(file, p.rfc, p.periodo.toString(), p.vista, file.name)
                }
                previo[formato + "Guardado"] = "true"
                if (formato == "xml") {
                    extraerEn(previo, file.readBytes())
                }
                previo.remove(formato + "Error")
            } catch (e: Exception) {
                previo[formato + "Guardado"] = "false"
                previo[formato + "Error"] = (e.message ?: "Descarga fallida").take(500)
                errores.add("$formato: ${e.message}")
                println("[cfdi ${p.rfc} ${p.vista} ${p.folio}] $formato: ${e.message?.take(200)}")
            }
        }
        previo["estadoDescarga"] = when { errores.isNotEmpty() -> "parcial"; acciones.values.all { it == null } -> "sin_archivos_sat"; else -> "completo" }
        previo["updatedAt"] = Instant.now().toString()
        db().insertItem(tabla(), previo)
        return errores.isEmpty()
    }

    /** Vuelca los datos fiscales del XML en el registro, preservando el UUID y la serie/folio como campos propios. */
    private fun extraerEn(previo: MutableMap<String, String>, bytes: ByteArray) {
        val datos = CfdiXml.extraer(bytes)
        previo["xmlDatos"] = mapper.writeValueAsString(datos)
        previo["clasificacion"] = datos["clasificacion"].toString()
        previo["serie"] = datos["serie"].toString()
        previo["folioComercial"] = datos["folioComercial"].toString()
    }

    /** Re-extrae los XML locales ya custodiados sin repetir login ni descargas al SAT. */
    fun reprocesar(rfc: String, periodo: YearMonth): Map<String, Any> {
        val items = db().scanItems(tabla()).filter {
            it["tipo"]?.toString() == "cfdi" && it["rfc"]?.toString() == rfc && it["periodo"]?.toString() == periodo.toString()
        }
        var actualizados = 0
        var sinXml = 0
        for (item in items) {
            val id = item["pk"].toString()
            val p = CfdiPendiente(id, rfc, periodo, item["vista"].toString(), item["folio"].toString(), emptyMap())
            val file = archivo(p, "xml")
            if (!file.isFile) DocStore.restaurarCfdi(file, rfc, periodo.toString(), item["vista"].toString(), file.name)
            if (!file.isFile) { sinXml++; continue }
            val previo = item.mapValues { it.value.toString() }.toMutableMap()
            extraerEn(previo, file.readBytes())
            previo["updatedAt"] = Instant.now().toString()
            db().insertItem(tabla(), previo)
            actualizados++
        }
        return mapOf("actualizados" to actualizados, "sinXml" to sinXml, "total" to items.size)
    }

    fun cerrar(rfc: String, periodo: YearMonth, jobId: String, total: Int, errores: Int, satEmitidas: Int = 0, satRecibidas: Int = 0) {        db().insertItem(tabla(), mapOf("pk" to "cfdi-mes-$rfc-$periodo", "tipo" to "cfdi-resumen", "rfc" to rfc,
            "periodo" to periodo.toString(), "jobId" to jobId, "total" to total.toString(), "errores" to errores.toString(),
            "satEmitidas" to satEmitidas.toString(), "satRecibidas" to satRecibidas.toString(),
            "estado" to if (errores == 0) "completo" else "parcial", "updatedAt" to Instant.now().toString()))
    }

    /**
     * Guarda los totales oficiales del SAT (pantalla de sumas del portal) en el
     * acta del mes para conciliar contra lo custodiado. Hoy los pega el contador
     * a mano; cuando el bot raspe esa pantalla llenará los mismos campos con
     * fuente "bot". Claves convencionales: emitidas_total, emitidas_vigentes,
     * emitidas_subtotal, recibidas_total, recibidas_vigentes, recibidas_subtotal.
     */
    fun guardarTotales(rfc: String, periodo: YearMonth, totales: Map<String, String>, corte: String, fuente: String): Map<String, String> {
        val pk = "cfdi-mes-$rfc-$periodo"
        val previo = db().getItem(tabla(), "pk", pk)?.mapValues { it.value.toString() }?.toMutableMap()
            ?: mutableMapOf("pk" to pk, "rfc" to rfc, "tipo" to "cfdi-resumen",
                "periodo" to periodo.toString(), "jobId" to "", "total" to "0", "errores" to "0",
                "satEmitidas" to "0", "satRecibidas" to "0", "estado" to "sin-cierre")
        val actuales = runCatching {
            jacksonObjectMapper().readValue(previo["satTotales"] ?: "{}", Map::class.java)
                .mapValues { it.value.toString() }.toMutableMap()
        }.getOrElse { mutableMapOf() }
        actuales.putAll(totales)
        previo["satTotales"] = jacksonObjectMapper().writeValueAsString(actuales)
        previo["satCorte"] = corte
        previo["satFuente"] = fuente.ifBlank { "manual" }
        previo["updatedAt"] = Instant.now().toString()
        db().insertItem(tabla(), previo)
        return mapOf("ok" to "true", "periodo" to periodo.toString(), "campos" to actuales.size.toString())
    }
}
