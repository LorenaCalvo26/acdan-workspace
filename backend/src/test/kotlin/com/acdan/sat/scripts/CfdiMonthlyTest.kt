package com.acdan.sat.scripts

import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CfdiMonthlyTest {
    @Test fun `mes completo no se repite y un parcial no salta al siguiente`() {
        val sep = YearMonth.of(2026, 9)
        val oct = sep.plusMonths(1)
        assertEquals(sep, CfdiMonthly.pendiente(sep, oct, emptySet()))
        assertEquals(oct, CfdiMonthly.pendiente(sep, oct, setOf(sep)))
        assertEquals(sep, CfdiMonthly.pendiente(sep, oct, setOf(oct)))
        assertNull(CfdiMonthly.pendiente(sep, oct, setOf(sep, oct)))
    }
    @Test fun `cliente nuevo espera su primer cierre y se contempla cambio de anio`() {
        val dic = YearMonth.of(2026, 12)
        assertNull(CfdiMonthly.pendiente(dic, dic.minusMonths(1), emptySet()))
        assertEquals(dic.plusMonths(1), CfdiMonthly.pendiente(dic, dic.plusMonths(1), setOf(dic)))
    }
}
