package com.acdan.sat.scripts

import java.time.YearMonth

object CfdiMonthly {
    fun pendiente(desde: YearMonth, ultimoCerrado: YearMonth, completos: Set<YearMonth>): YearMonth? {
        var mes = desde
        while (mes <= ultimoCerrado && mes in completos) mes = mes.plusMonths(1)
        return mes.takeIf { it <= ultimoCerrado }
    }
}
