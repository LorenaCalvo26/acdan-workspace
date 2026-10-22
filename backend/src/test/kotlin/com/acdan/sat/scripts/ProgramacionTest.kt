package com.acdan.sat.scripts

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class ProgramacionTest {

    @Test fun `la fecha elegida usa 08 00 por defecto en hora de Mexico`() {
        assertEquals(
            Instant.parse("2026-11-05T14:00:00Z"),
            Programacion.parseFechaHora("2026-11-05", "")
        )
    }

    @Test fun `mensual conserva el dia 31 y usa el ultimo dia cuando el mes es corto`() {
        val enero = Instant.parse("2026-01-31T15:00:00Z") // 31 ene 09:00 CDMX
        val febrero = Programacion.siguienteMensual(enero, 31, "08:00")
        assertEquals(Instant.parse("2026-02-28T14:00:00Z"), febrero)

        val marzo = Programacion.siguienteMensual(febrero, 31, "08:00")
        assertEquals(Instant.parse("2026-03-31T14:00:00Z"), marzo)
    }

    @Test fun `si la hora de hoy ya paso salta al siguiente mes`() {
        val hoy = Instant.parse("2026-11-05T16:00:00Z") // 10:00 CDMX
        assertEquals(
            Instant.parse("2026-12-05T14:00:00Z"),
            Programacion.siguienteMensual(hoy, 5, "08:00")
        )
    }
}
