package com.acdan.sat.scripts

/** Clasificación fiscal desde el XML y relaciones de pago; nunca infiere pagado por el tipo P. */
object CfdiXml {
    fun extraer(bytes: ByteArray): Map<String, Any> {
        val doc = CfdiStore.leerXml(bytes)
        val c = doc.documentElement
        fun primero(nombre: String) = doc.getElementsByTagNameNS("*", nombre).item(0) as? org.w3c.dom.Element
        val nomina = primero("Nomina")
        val pagos = primero("Pagos")
        val tipo = c.getAttribute("TipoDeComprobante").ifBlank { c.getAttribute("tipoDeComprobante") }.uppercase()
        val clase = when (tipo) {
            "I", "INGRESO" -> "Factura"; "E", "EGRESO" -> "Nota de crédito"
            "P", "PAGO" -> "Complemento de pago"; "T", "TRASLADO" -> "Traslado"
            "N", "NOMINA", "NÓMINA" -> when (nomina?.getAttribute("TipoNomina")) {
                "O" -> "Nómina ordinaria"; "E" -> "Nómina extraordinaria"; else -> "Nómina"
            }; else -> "Otro"
        }
        val relaciones = mutableListOf<Map<String, String>>()
        val nodos = doc.getElementsByTagNameNS("*", "DoctoRelacionado")
        for (i in 0 until nodos.length) {
            val nodo = nodos.item(i) as org.w3c.dom.Element
            val pago = nodo.parentNode as? org.w3c.dom.Element
            relaciones.add(listOf("IdDocumento", "MonedaDR", "NumParcialidad", "ImpSaldoAnt", "ImpPagado", "ImpSaldoInsoluto")
                .associateWith { nodo.getAttribute(it) } + ("FechaPago" to (pago?.getAttribute("FechaPago") ?: "")))
        }
        return mapOf("tipoComprobante" to tipo, "clasificacion" to clase,
            "versionCfdi" to c.getAttribute("Version"), "moneda" to c.getAttribute("Moneda"),
            "metodoPago" to c.getAttribute("MetodoPago"), "formaPago" to c.getAttribute("FormaPago"),
            "versionNomina" to (nomina?.getAttribute("Version") ?: ""), "tipoNomina" to (nomina?.getAttribute("TipoNomina") ?: ""),
            "versionPagos" to (pagos?.getAttribute("Version") ?: ""), "pagosRelacionados" to relaciones)
    }
}
