package com.acdan.sat.scripts

import org.apache.poi.ss.usermodel.BorderStyle
import org.apache.poi.ss.usermodel.FillPatternType
import org.apache.poi.ss.usermodel.IndexedColors
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.time.YearMonth

/**
 * Excel mensual de un RFC, generado en el servidor para el paquete del despacho.
 *
 * Replica la exportación del navegador (Misma estructura de hojas) con las
 * columnas que el contador usa de verdad. Todo sale de los CFDI guardados:
 * `campos` (lo que se ve en el SAT) y `xmlDatos` (lo que trae el XML).
 */
object CfdiExcel {

    private val COLUMNAS = listOf(
        "Verificado", "Estado SAT", "Version", "Tipo",
        "Fecha Emision", "Fecha Timbrado", "EstadoPago", "FechaPago",
        "Serie", "Folio", "UUID", "UUID Relacion",
        "RFC Emisor", "Nombre Emisor", "RFC Receptor", "Nombre Receptor",
        "UsoCFDI", "SubTotal", "Descuento", "IVA 16%", "Retenido IVA", "Retenido ISR",
        "Total", "Moneda", "Tipo De Cambio", "FormaDePago", "Metodo de Pago",
        "RegimenFiscalReceptor", "Conceptos", "Archivo XML"
    )

    private fun texto(x: Map<*, *>, campos: Map<*, *>, vararg claves: String): String {
        for (k in claves) {
            val v = x[k] ?: campos[k]
            if (v != null && v.toString().isNotBlank()) return v.toString()
        }
        return ""
    }

    private fun conceptos(x: Map<*, *>): String {
        val lista = x["conceptos"] as? List<*> ?: return ""
        return lista.mapNotNull { c ->
            (c as? Map<*, *>)?.get("descripcion")?.toString()?.takeIf { it.isNotBlank() }
        }.joinToString(" | ")
    }

    /** Filas del mes para el RFC: cada item es una fila de la tabla de CFDI. */
    fun generar(rfc: String, periodo: YearMonth, items: List<Map<String, Any>>): ByteArray {
        val wb = XSSFWorkbook()
        val negrita = wb.createFont().apply { bold = true }
        val cabecera = wb.createCellStyle().apply {
            fillForegroundColor = IndexedColors.GREY_25_PERCENT.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
            borderBottom = BorderStyle.THIN
            setFont(negrita)
        }

        val porVista = items.groupBy {
            (it["vista"]?.toString() ?: "").ifBlank { "emitidas" }
        }

        // --- Hoja Resumen ---
        val resumen = wb.createSheet("Resumen")
        var fila = 0
        fun linea(a: Any?, b: Any? = null) {
            val r = resumen.createRow(fila++)
            r.createCell(0).setCellValue(a?.toString() ?: "")
            if (b != null) r.createCell(1).setCellValue(b.toString())
        }
        linea("CFDI Pilli")
        linea("")
        linea("RFC", rfc)
        linea("Periodo", periodo.toString())
        linea("Comprobantes", items.size)
        val totales = items.groupBy { texto(it["xmlDatos"] as? Map<*, *> ?: emptyMap<String, Any>(), it["campos"] as? Map<*, *> ?: emptyMap<String, Any>(), "moneda") }
        linea("")
        linea("Totales por moneda")
        val rCab = resumen.createRow(fila++)
        listOf("Moneda", "Comprobantes", "SubTotal", "Total").forEachIndexed { i, v ->
            rCab.createCell(i).setCellValue(v); rCab.getCell(i).cellStyle = cabecera
        }
        for ((moneda, filas) in totales) {
            val r = resumen.createRow(fila++)
            fun num(clave: String) = filas.sumOf { f ->
                val x = f["xmlDatos"] as? Map<*, *> ?: emptyMap<String, Any>()
                (x[clave]?.toString() ?: "0").replace(",", "").toDoubleOrNull() ?: 0.0
            }
            r.createCell(0).setCellValue(if (moneda.isBlank()) "MXN" else moneda)
            r.createCell(1).setCellValue(filas.size.toDouble())
            r.createCell(2).setCellValue(num("subTotal"))
            r.createCell(3).setCellValue(num("total"))
        }
        linea("")
        linea("Cifras de resumen: no infieren deducibilidad ni impuesto a pagar.")

        // --- Una hoja por vista ---
        for ((vista, filas) in porVista) {
            val nombre = when (vista.lowercase()) {
                "recibidas" -> "Recibidas"
                else -> "Emitidas"
            }
            val hoja = wb.createSheet(nombre)
            val cab = hoja.createRow(0)
            COLUMNAS.forEachIndexed { i, c ->
                cab.createCell(i).setCellValue(c)
                cab.getCell(i).cellStyle = cabecera
            }
            filas.forEachIndexed { n, item ->
                val x = item["xmlDatos"] as? Map<*, *> ?: emptyMap<String, Any>()
                val campos = item["campos"] as? Map<*, *> ?: emptyMap<String, Any>()
                val r = hoja.createRow(n + 1)
                val valores = listOf(
                    "",
                    texto(x, campos, "Estado del Comprobante"),
                    texto(x, campos, "versionCfdi"),
                    texto(x, campos, "clasificacion"),
                    texto(x, campos, "fecha", "Fecha de Emisión"),
                    texto(x, campos, "fechaTimbrado"),
                    texto(x, campos, "estadoPago"),
                    texto(x, campos, "fechaPago"),
                    texto(x, campos, "serie"),
                    texto(x, campos, "folioComercial"),
                    item["folio"]?.toString() ?: "",
                    texto(x, campos, "uuidRelacion"),
                    texto(x, campos, "emisorRfc", "RFC Emisor"),
                    texto(x, campos, "emisorNombre"),
                    texto(x, campos, "receptorRfc", "RFC Receptor"),
                    texto(x, campos, "receptorNombre"),
                    texto(x, campos, "usoCfdiDesc", "usoCfdi"),
                    texto(x, campos, "subTotal"),
                    texto(x, campos, "descuento"),
                    texto(x, campos, "iva16"),
                    texto(x, campos, "retIva"),
                    texto(x, campos, "retIsr"),
                    texto(x, campos, "total", "Total"),
                    texto(x, campos, "moneda"),
                    texto(x, campos, "tipoCambio"),
                    texto(x, campos, "formaPagoDesc", "formaPago"),
                    texto(x, campos, "metodoPagoDesc", "metodoPago"),
                    texto(x, campos, "receptorRegimenFiscalDesc", "receptorRegimenFiscal"),
                    conceptos(x),
                    (item["folio"]?.toString() ?: "").let { if (it.isBlank()) "" else "$it.xml" }
                )
                valores.forEachIndexed { i, v -> r.createCell(i).setCellValue(v) }
            }
            COLUMNAS.indices.forEach { hoja.setColumnWidth(it, 18 * 256) }
            hoja.createFreezePane(0, 1)
        }

        val salida = ByteArrayOutputStream()
        wb.write(salida)
        wb.close()
        return salida.toByteArray()
    }
}
