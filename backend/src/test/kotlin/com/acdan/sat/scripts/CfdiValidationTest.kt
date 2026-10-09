package com.acdan.sat.scripts

import java.time.Instant
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

class CfdiValidationTest {
    private val p = CfdiPendiente("test", "AAA010101AAA", YearMonth.of(2026, 9), "emitidas", "12345678-1234-1234-1234-123456789ABC", emptyMap())
    private fun xml(folio: String = p.folio, rfc: String = p.rfc) = """<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"><cfdi:Emisor Rfc="$rfc"/><cfdi:Receptor Rfc="BBB010101BBB"/><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="$folio"/></cfdi:Complemento></cfdi:Comprobante>""".toByteArray()

    @Test fun `cierre usa medianoche de Mexico y no UTC`() {
        assertEquals(YearMonth.of(2026, 8), CfdiStore.ultimoMesCerrado(Instant.parse("2026-10-01T05:59:59Z")))
        assertEquals(YearMonth.of(2026, 9), CfdiStore.ultimoMesCerrado(Instant.parse("2026-10-01T06:00:00Z")))
        assertEquals(YearMonth.of(2027, 12), CfdiStore.ultimoMesCerrado(Instant.parse("2028-01-01T06:00:00Z")))
        assertEquals(YearMonth.of(2028, 2), CfdiStore.ultimoMesCerrado(Instant.parse("2028-03-01T06:00:00Z")))
    }
    @Test fun `XML exige folio y RFC del rol correcto`() {
        CfdiStore.validar(xml(), "xml", p)
        assertFails { CfdiStore.validar(xml(folio = "87654321-1234-1234-1234-123456789ABC"), "xml", p) }
        assertFails { CfdiStore.validar(xml(rfc = "BBB010101BBB"), "xml", p) }
        CfdiStore.validar(xml(), "xml", p.copy(rfc = "BBB010101BBB", vista = "recibidas"))
    }
    @Test fun `HTML y entidades externas no se guardan como archivos fiscales`() {
        assertFails { CfdiStore.validar("<html>Error SAT</html>".toByteArray(), "pdf", p) }
        assertFails { CfdiStore.validar("<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///fake'>]><x>&e;</x>".toByteArray(), "xml", p) }
    }
    @Test fun `archivo distingue RFC mes y vista para reintentos sin duplicados`() {
        assertEquals(CfdiStore.archivo(p, "xml"), CfdiStore.archivo(p.copy(), "xml"))
        kotlin.test.assertNotEquals(CfdiStore.archivo(p, "xml"), CfdiStore.archivo(p.copy(vista = "recibidas"), "xml"))
        kotlin.test.assertNotEquals(CfdiStore.archivo(p, "xml"), CfdiStore.archivo(p.copy(periodo = p.periodo.plusMonths(1)), "xml"))
    }
}
