package com.acdan.sat.scripts

import kotlin.test.Test
import kotlin.test.assertEquals

class CfdiXmlTest {
    @Test fun `nomina distingue ordinaria extraordinaria y version sin inventar categorias`() {
        for ((codigo, clase) in listOf("O" to "Nómina ordinaria", "E" to "Nómina extraordinaria")) {
            val xml = """<c:Comprobante xmlns:c="http://www.sat.gob.mx/cfd/4" xmlns:n="http://www.sat.gob.mx/nomina12" TipoDeComprobante="N" Version="4.0"><c:Complemento><n:Nomina Version="1.2" TipoNomina="$codigo"/></c:Complemento></c:Comprobante>"""
            val datos = CfdiXml.extraer(xml.toByteArray())
            assertEquals(clase, datos["clasificacion"])
            assertEquals("1.2", datos["versionNomina"])
        }
    }
    @Test fun `complemento de pago conserva folio relacionado y saldo insoluto`() {
        val xml = """<c:Comprobante xmlns:c="http://www.sat.gob.mx/cfd/4" xmlns:p="http://www.sat.gob.mx/Pagos20" TipoDeComprobante="P"><c:Complemento><p:Pagos Version="2.0"><p:Pago FechaPago="2026-09-30T12:00:00"><p:DoctoRelacionado IdDocumento="12345678-1234-1234-1234-123456789ABC" MonedaDR="MXN" NumParcialidad="2" ImpSaldoAnt="100" ImpPagado="100" ImpSaldoInsoluto="0"/></p:Pago></p:Pagos></c:Complemento></c:Comprobante>"""
        val datos = CfdiXml.extraer(xml.toByteArray())
        assertEquals("Complemento de pago", datos["clasificacion"])
        assertEquals("2.0", datos["versionPagos"])
        val pagos = datos["pagosRelacionados"] as List<*>
        assertEquals("0", (pagos.single() as Map<*, *>)["ImpSaldoInsoluto"])
    }
}
