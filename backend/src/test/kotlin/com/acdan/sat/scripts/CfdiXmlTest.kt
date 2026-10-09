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

    @Test fun `factura real 8529 expone serie folio uuid e impuestos sin duplicar`() {
        val datos = CfdiXml.extraer(FACTURA_8529.toByteArray())
        assertEquals("Factura", datos["clasificacion"])
        assertEquals("A", datos["serie"])
        assertEquals("8529", datos["folioComercial"])
        assertEquals("A7D360DA-C023-5361-BC52-4906DB83174E", datos["uuid"])
        assertEquals("125.00", datos["subTotal"])
        assertEquals("145.00", datos["total"])
        assertEquals("20.00", datos["iva16"], "no debe sumarse el desglose de conceptos sobre el global")
        assertEquals("20.00", datos["totalTrasladados"])
        assertEquals("G03", datos["usoCfdi"])
        assertEquals("Gastos en general", datos["usoCfdiDesc"])
        assertEquals("04", datos["formaPago"])
        assertEquals("Tarjeta de crédito", datos["formaPagoDesc"])
        assertEquals("Pago en una sola exhibición", datos["metodoPagoDesc"])
        assertEquals("612", datos["receptorRegimenFiscal"])
        assertEquals("55390", datos["receptorDomicilioFiscal"])
    }

    @Test fun `descuento exento retenciones y moneda distinta se conservan`() {
        val xml = """<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Moneda="USD" TipoCambio="17.5000" SubTotal="1000.00" Descuento="100.00" Total="972.00" TipoDeComprobante="I">
            <cfdi:Emisor Rfc="VRR190205JL7" RegimenFiscal="601"/>
            <cfdi:Receptor Rfc="XEXX010101000" UsoCFDI="G03" RegimenFiscalReceptor="616" DomicilioFiscalReceptor="06900"/>
            <cfdi:Conceptos><cfdi:Concepto Cantidad="1" Descripcion="EXENTO" Importe="1000.00" ValorUnitario="1000.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Exento"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
            <cfdi:Impuestos TotalImpuestosTrasladados="0.00" TotalImpuestosRetenidos="128.00"><cfdi:Retenciones><cfdi:Retencion Base="1000.00" Importe="100.00" Impuesto="002" TasaOCuota="0.100000"/><cfdi:Retencion Base="1000.00" Importe="28.00" Impuesto="001" TasaOCuota="0.028000"/></cfdi:Retenciones></cfdi:Impuestos>
        </cfdi:Comprobante>"""
        val datos = CfdiXml.extraer(xml.toByteArray())
        assertEquals("USD", datos["moneda"])
        assertEquals("17.5000", datos["tipoCambio"])
        assertEquals("100.00", datos["descuento"])
        assertEquals("128.00", datos["totalRetenidos"])
        assertEquals("100.00", datos["retIva"])
        assertEquals("28.00", datos["retIsr"])
        assertEquals("0.00", datos["iva16"])
    }

    @Test fun `ieps por tasa e impuesto local ish se desglosan`() {
        val xml = """<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:implocal="http://www.sat.gob.mx/implocal" Version="4.0" Moneda="MXN" SubTotal="500.00" Total="686.00" TipoDeComprobante="I">
            <cfdi:Emisor Rfc="VRR190205JL7" RegimenFiscal="601"/>
            <cfdi:Receptor Rfc="ROPR751016R77" UsoCFDI="G03" RegimenFiscalReceptor="612" DomicilioFiscalReceptor="55390"/>
            <cfdi:Conceptos><cfdi:Concepto Cantidad="1" Descripcion="GASOLINA" Importe="500.00" ValorUnitario="500.00"/></cfdi:Conceptos>
            <cfdi:Impuestos TotalImpuestosTrasladados="186.00"><cfdi:Traslados><cfdi:Traslado Base="500.00" Importe="40.00" Impuesto="003" TasaOCuota="0.080000" TipoFactor="Tasa"/><cfdi:Traslado Base="500.00" Importe="16.00" Impuesto="002" TasaOCuota="0.160000" TipoFactor="Tasa"/></cfdi:Traslados></cfdi:Impuestos>
            <cfdi:Complemento><implocal:ImpuestosLocales TotaldeTrasladosLocales="130.00"><implocal:TrasladosLocales ImpLocTrasladado="ISH" TasadeTraslado="26.00" Importe="130.00"/></implocal:ImpuestosLocales></cfdi:Complemento>
        </cfdi:Comprobante>"""
        val datos = CfdiXml.extraer(xml.toByteArray())
        assertEquals("40.00", datos["iepsTotal"])
        assertEquals(mapOf("8" to "40.00"), datos["iepsPorTasa"])
        assertEquals("16.00", datos["iva16"])
        assertEquals("130.00", datos["totalLocalTrasladado"])
        assertEquals("130.00", datos["ish"])
    }

    private val FACTURA_8529 = """
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="8529" Fecha="2026-09-29T13:11:42" FormaPago="04" MetodoPago="PUE" Moneda="MXN" SubTotal="125.00" Total="145.00" TipoDeComprobante="I" LugarExpedicion="55390" Exportacion="01">
          <cfdi:Emisor Rfc="VRR190205JL7" Nombre="VENTAS, REPARACIONES Y RENTAS AVRO" RegimenFiscal="601"/>
          <cfdi:Receptor Rfc="ROPR751016R77" Nombre="ROSA MARIA ROSAS PAREDES" UsoCFDI="G03" RegimenFiscalReceptor="612" DomicilioFiscalReceptor="55390"/>
          <cfdi:Conceptos><cfdi:Concepto Cantidad="1.000000" ClaveProdServ="26101404" ClaveUnidad="H87" Descripcion="JUEGO DE CARBONES" Importe="125.00" ValorUnitario="125.00" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="125.00" Importe="20.00" Impuesto="002" TasaOCuota="0.160000" TipoFactor="Tasa"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
          <cfdi:Impuestos TotalImpuestosTrasladados="20.00"><cfdi:Traslados><cfdi:Traslado Base="125.00" Importe="20.00" Impuesto="002" TasaOCuota="0.160000" TipoFactor="Tasa"/></cfdi:Traslados></cfdi:Impuestos>
          <cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="A7D360DA-C023-5361-BC52-4906DB83174E" FechaTimbrado="2026-10-02T13:06:43"/></cfdi:Complemento>
        </cfdi:Comprobante>""".trimIndent()
}
