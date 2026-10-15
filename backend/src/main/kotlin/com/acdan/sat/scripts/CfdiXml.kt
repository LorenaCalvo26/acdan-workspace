package com.acdan.sat.scripts

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Clasificación y datos fiscales desde el XML. Nunca infiere pagado por el tipo P;
 * los importes ausentes se omiten y los presentes en cero se conservan como "0.00".
 */
object CfdiXml {
    fun extraer(bytes: ByteArray): Map<String, Any> {
        val doc = CfdiStore.leerXml(bytes)
        val c = doc.documentElement

        fun todos(nombre: String) = doc.getElementsByTagNameNS("*", nombre)
        fun primero(nombre: String) = todos(nombre).item(0) as? org.w3c.dom.Element
        fun attr(e: org.w3c.dom.Element?, nombre: String) = e?.getAttribute(nombre)?.trim().orEmpty()
        fun hijoDirecto(padre: org.w3c.dom.Element?, nombre: String): org.w3c.dom.Element? {
            if (padre == null) return null
            val nodos = padre.childNodes
            for (i in 0 until nodos.length) {
                val n = nodos.item(i)
                if (n is org.w3c.dom.Element && n.localName == nombre) return n
            }
            return null
        }
        fun hijos(padre: org.w3c.dom.Element?, nombre: String): List<org.w3c.dom.Element> {
            if (padre == null) return emptyList()
            val salida = mutableListOf<org.w3c.dom.Element>()
            val nodos = padre.childNodes
            for (i in 0 until nodos.length) {
                val n = nodos.item(i)
                if (n is org.w3c.dom.Element && n.localName == nombre) salida.add(n)
            }
            return salida
        }

        val nomina = primero("Nomina")
        val pagos = primero("Pagos")
        val tipo = attr(c, "TipoDeComprobante").ifBlank { attr(c, "tipoDeComprobante") }.uppercase()
        val clase = when (tipo) {
            "I", "INGRESO" -> "Factura"; "E", "EGRESO" -> "Nota de crédito"
            "P", "PAGO" -> "Complemento de pago"; "T", "TRASLADO" -> "Traslado"
            "N", "NOMINA", "NÓMINA" -> when (attr(nomina, "TipoNomina")) {
                "O" -> "Nómina ordinaria"; "E" -> "Nómina extraordinaria"; else -> "Nómina"
            }; else -> "Otro"
        }

        val emisor = hijoDirecto(c, "Emisor") ?: primero("Emisor")
        val receptor = hijoDirecto(c, "Receptor") ?: primero("Receptor")
        val tfd = primero("TimbreFiscalDigital")
        val usoCfdi = attr(receptor, "UsoCFDI").ifBlank { attr(receptor, "usoCFDI") }
        val conceptosElems = hijos(hijoDirecto(c, "Conceptos"), "Concepto")
        val conceptos = conceptosElems.map { concepto(it) }
        val impuestosDatos = impuestos(c, conceptosElems, ::hijoDirecto)

        val datos = linkedMapOf<String, Any>(
            "tipoComprobante" to tipo,
            "tipoComprobanteDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.tipoComprobante, tipo),
            "clasificacion" to clase,
            "versionCfdi" to attr(c, "Version"),
            "serie" to attr(c, "Serie"),
            "folioComercial" to attr(c, "Folio"),
            "uuid" to attr(tfd, "UUID").uppercase(),
            "fecha" to attr(c, "Fecha"),
            "fechaTimbrado" to attr(tfd, "FechaTimbrado"),
            "subTotal" to attr(c, "SubTotal"),
            "descuento" to attr(c, "Descuento"),
            "total" to attr(c, "Total"),
            "moneda" to attr(c, "Moneda").uppercase().ifBlank { (if (tipo == "P") "XXX" else "") },
            "tipoCambio" to attr(c, "TipoCambio"),
            "exportacion" to attr(c, "Exportacion"),
            "exportacionDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.exportacion, attr(c, "Exportacion")),
            "formaPago" to attr(c, "FormaPago"),
            "formaPagoDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.formaPago, attr(c, "FormaPago")),
            "metodoPago" to attr(c, "MetodoPago"),
            "metodoPagoDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.metodoPago, attr(c, "MetodoPago")),
            "condicionPago" to attr(c, "CondicionesDePago"),
            "usoCfdi" to usoCfdi,
            "usoCfdiDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.usoCfdi, usoCfdi),
            "lugarExpedicion" to attr(c, "LugarExpedicion"),
            "emisorRfc" to attr(emisor, "Rfc").uppercase(),
            "emisorNombre" to attr(emisor, "Nombre"),
            "emisorRegimenFiscal" to attr(emisor, "RegimenFiscal"),
            "emisorRegimenFiscalDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.regimenFiscal, attr(emisor, "RegimenFiscal")),
            "receptorRfc" to attr(receptor, "Rfc").uppercase(),
            "receptorNombre" to attr(receptor, "Nombre"),
            "receptorRegimenFiscal" to attr(receptor, "RegimenFiscalReceptor"),
            "receptorRegimenFiscalDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.regimenFiscal, attr(receptor, "RegimenFiscalReceptor")),
            "receptorDomicilioFiscal" to attr(receptor, "DomicilioFiscalReceptor"),
            "receptorResidenciaFiscal" to attr(receptor, "ResidenciaFiscal"),
            "receptorNumRegIdTrib" to attr(receptor, "NumRegIdTrib"),
            "uuidRelacion" to relacionados(primero("CfdiRelacionados")),
            "conceptos" to conceptos,
            "conceptosResumen" to conceptos.joinToString(" | ") { "${it["cantidad"]} x ${it["descripcion"]} = ${it["importe"]}" },
            "versionNomina" to attr(nomina, "Version"),
            "tipoNomina" to attr(nomina, "TipoNomina"),
            "versionPagos" to attr(pagos, "Version"),
            "pagosRelacionados" to relacionesDePago(doc)
        )
        datos["impuestos"] = impuestosDatos.comoMapa()
        datos.putAll(impuestosDatos.flat)
        return datos
    }

    private fun concepto(e: org.w3c.dom.Element): Map<String, Any> = linkedMapOf(
        "claveProdServ" to e.getAttribute("ClaveProdServ").trim(),
        "claveUnidad" to e.getAttribute("ClaveUnidad").trim(),
        "cantidad" to e.getAttribute("Cantidad").trim(),
        "descripcion" to e.getAttribute("Descripcion").trim(),
        "valorUnitario" to e.getAttribute("ValorUnitario").trim(),
        "importe" to e.getAttribute("Importe").trim(),
        "descuento" to e.getAttribute("Descuento").trim(),
        "objetoImp" to e.getAttribute("ObjetoImp").trim(),
        "objetoImpDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.objetoImp, e.getAttribute("ObjetoImp"))
    )

    private fun relacionados(cfdiRelacionados: org.w3c.dom.Element?): String {
        if (cfdiRelacionados == null) return ""
        val nodos = cfdiRelacionados.getElementsByTagNameNS("*", "CfdiRelacionado")
        val out = mutableListOf<String>()
        for (i in 0 until nodos.length) out.add((nodos.item(i) as org.w3c.dom.Element).getAttribute("UUID").uppercase())
        return out.filter { it.isNotBlank() }.joinToString(",")
    }

    private data class Desglose(
        val filas: List<Map<String, String>>,
        val total: BigDecimal,
        val porImpuesto: Map<String, BigDecimal>,
        val porTasa: Map<String, Map<String, BigDecimal>>
    )

    private fun impuestos(
        c: org.w3c.dom.Element,
        conceptos: List<org.w3c.dom.Element>,
        hijoDirecto: (org.w3c.dom.Element?, String) -> org.w3c.dom.Element?
    ): Impuestos {
        val global = hijoDirecto(c, "Impuestos")
        val trasladosNodos = if (global != null) {
            hijos(hijoDirecto(global, "Traslados"), "Traslado")
        } else {
            conceptos.flatMap { ce -> hijos(hijoDirecto(hijoDirecto(ce, "Impuestos"), "Traslados"), "Traslado") }
        }
        val retencionesNodos = if (global != null) {
            hijos(hijoDirecto(global, "Retenciones"), "Retencion")
        } else {
            conceptos.flatMap { ce -> hijos(hijoDirecto(hijoDirecto(ce, "Impuestos"), "Retenciones"), "Retencion") }
        }
        val traslados = desglosar(trasladosNodos)
        val retenciones = desglosar(retencionesNodos)
        val totalTrasladados = global?.getAttribute("TotalImpuestosTrasladados")?.takeIf { it.isNotBlank() }
            ?.let { bd(it) } ?: traslados.total
        val totalRetenidos = global?.getAttribute("TotalImpuestosRetenidos")?.takeIf { it.isNotBlank() }
            ?.let { bd(it) } ?: retenciones.total
        return Impuestos(traslados, retenciones, totalTrasladados ?: BigDecimal.ZERO, totalRetenidos ?: BigDecimal.ZERO, locales(c))
    }

    private fun desglosar(nodos: List<org.w3c.dom.Element>): Desglose {
        val acumulado = linkedMapOf<String, MutableMap<String, Any>>()
        for (n in nodos) {
            val impuesto = n.getAttribute("Impuesto").trim()
            val tipo = n.getAttribute("TipoFactor").trim()
            val tasa = n.getAttribute("TasaOCuota").trim()
            val clave = "$impuesto|$tipo|$tasa"
            val fila = acumulado.getOrPut(clave) {
                mutableMapOf("impuesto" to impuesto, "impuestoDesc" to CfdiCatalogo.descripcion(CfdiCatalogo.impuesto, impuesto),
                    "tipoFactor" to tipo, "tasaOCuota" to tasa, "tasa" to tasaPorcentaje(tasa), "base" to BigDecimal.ZERO, "importe" to BigDecimal.ZERO)
            }
            fila["base"] = (fila["base"] as BigDecimal) + (bd(n.getAttribute("Base")) ?: BigDecimal.ZERO)
            fila["importe"] = (fila["importe"] as BigDecimal) + (bd(n.getAttribute("Importe")) ?: BigDecimal.ZERO)
        }
        val filas = acumulado.values.map { fila ->
            fila.mapValues { (k, v) -> if (v is BigDecimal && k in setOf("base", "importe")) fmt(v) else v.toString() }
        }
        val total = acumulado.values.sumOf { it["importe"] as BigDecimal }
        val porImpuesto = mutableMapOf<String, BigDecimal>()
        val porTasa = mutableMapOf<String, MutableMap<String, BigDecimal>>()
        for (fila in acumulado.values) {
            val imp = fila["impuesto"].toString()
            val importe = fila["importe"] as BigDecimal
            porImpuesto[imp] = (porImpuesto[imp] ?: BigDecimal.ZERO) + importe
            val tasa = fila["tasa"].toString()
            porTasa.getOrPut(imp) { mutableMapOf() }[tasa] = (porTasa[imp]!![tasa] ?: BigDecimal.ZERO) + importe
        }
        return Desglose(filas, total, porImpuesto, porTasa)
    }

    private data class Locales(val trasladados: String, val retenidos: String, val porNombre: Map<String, String>) {
        val flat: Map<String, Any> get() = linkedMapOf(
            "totalLocalTrasladado" to trasladados, "totalLocalRetenido" to retenidos,
            "localesPorNombre" to porNombre, "ish" to (porNombre["ISH"] ?: "")
        )
    }

    private fun locales(c: org.w3c.dom.Element): Locales {
        val locales = c.getElementsByTagNameNS("*", "ImpuestosLocales").item(0) as? org.w3c.dom.Element
            ?: return Locales("", "", emptyMap())
        val porNombre = mutableMapOf<String, BigDecimal>()
        for (nombre in listOf("TrasladosLocales", "RetencionesLocales")) {
            val nodos = locales.getElementsByTagNameNS("*", nombre)
            for (i in 0 until nodos.length) {
                val n = nodos.item(i) as org.w3c.dom.Element
                val etiqueta = n.getAttribute("ImpLocTrasladado").ifBlank { n.getAttribute("ImpLocRetenido") }.trim()
                val importe = bd(n.getAttribute("Importe")) ?: BigDecimal.ZERO
                if (etiqueta.isNotBlank()) porNombre[etiqueta.uppercase()] = (porNombre[etiqueta.uppercase()] ?: BigDecimal.ZERO) + importe
            }
        }
        return Locales(
            locales.getAttribute("TotaldeTrasladosLocales").trim(),
            locales.getAttribute("TotaldeRetencionesLocales").trim(),
            porNombre.mapValues { fmt(it.value) }
        )
    }

    private fun relacionesDePago(doc: org.w3c.dom.Document): List<Map<String, String>> {
        val relaciones = mutableListOf<Map<String, String>>()
        val nodos = doc.getElementsByTagNameNS("*", "DoctoRelacionado")
        for (i in 0 until nodos.length) {
            val nodo = nodos.item(i) as org.w3c.dom.Element
            val pago = nodo.parentNode as? org.w3c.dom.Element
            relaciones.add(listOf("IdDocumento", "MonedaDR", "NumParcialidad", "ImpSaldoAnt", "ImpPagado", "ImpSaldoInsoluto")
                .associateWith { nodo.getAttribute(it) } + ("FechaPago" to (pago?.getAttribute("FechaPago") ?: "")))
        }
        return relaciones
    }

    private fun hijos(padre: org.w3c.dom.Element?, nombre: String): List<org.w3c.dom.Element> {
        if (padre == null) return emptyList()
        val salida = mutableListOf<org.w3c.dom.Element>()
        val nodos = padre.childNodes
        for (i in 0 until nodos.length) {
            val n = nodos.item(i)
            if (n is org.w3c.dom.Element && n.localName == nombre) salida.add(n)
        }
        return salida
    }

    private fun bd(valor: String?): BigDecimal? = valor?.trim()?.takeIf { it.isNotEmpty() }?.let { runCatching { BigDecimal(it) }.getOrNull() }
    private fun fmt(valor: BigDecimal) = valor.setScale(2, RoundingMode.HALF_UP).toPlainString()
    private fun tasaPorcentaje(tasa: String): String = bd(tasa)?.let {
        it.movePointRight(2).stripTrailingZeros().toPlainString()
    } ?: ""

    /** Estructura interna con desglose y totales, más una vista plana lista para exportar. */
    private class Impuestos(
        val traslados: Desglose,
        val retenciones: Desglose,
        val totalTrasladados: BigDecimal,
        val totalRetenidos: BigDecimal,
        val locales: Locales
    ) {
        private fun bucket(desglose: Desglose, impuesto: String, tasa: String? = null): BigDecimal {
            val porTasa = desglose.porTasa[impuesto].orEmpty()
            return if (tasa == null) desglose.porImpuesto[impuesto] ?: BigDecimal.ZERO else porTasa[tasa] ?: BigDecimal.ZERO
        }
        val flat: Map<String, Any> get() = linkedMapOf<String, Any>(
            "iva16" to fmt(bucket(traslados, "002", "16")),
            "iva8" to fmt(bucket(traslados, "002", "8")),
            "iepsTotal" to fmt(bucket(traslados, "003")),
            "retIva" to fmt(bucket(retenciones, "002")),
            "ivaRet6" to fmt(bucket(retenciones, "002", "6")),
            "retIsr" to fmt(bucket(retenciones, "001")),
            "totalTrasladados" to fmt(totalTrasladados),
            "totalRetenidos" to fmt(totalRetenidos),
            "iepsPorTasa" to traslados.porTasa["003"].orEmpty().mapValues { fmt(it.value) },
            "ivaPorTasa" to traslados.porTasa["002"].orEmpty().mapValues { fmt(it.value) }
        ) + locales.flat

        fun comoMapa(): Map<String, Any> = linkedMapOf(
            "traslados" to traslados.filas,
            "retenciones" to retenciones.filas,
            "totalTrasladados" to fmt(totalTrasladados),
            "totalRetenidos" to fmt(totalRetenidos),
            "locales" to locales.porNombre
        )
    }
}
