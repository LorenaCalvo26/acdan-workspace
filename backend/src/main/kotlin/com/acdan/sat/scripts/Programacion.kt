package com.acdan.sat.scripts

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Reglas de la programación mensual de Pilli.
 *
 * La fecha que elige el contador es la **próxima corrida**; después de un
 * éxito se repite el mismo día de cada mes a la misma hora. Si el mes no
 * tiene ese día (31 en febrero, por ejemplo) se usa el último día del mes,
 * pero se conserva el día original para los meses siguientes.
 */
object Programacion {

    val zona: ZoneId = ZoneId.of("America/Mexico_City")
    const val HORA_DEFAULT = "08:00"

    private val entradaHora = DateTimeFormatter.ofPattern("H:mm")
    private val salidaHora = DateTimeFormatter.ofPattern("HH:mm")

    /** Normaliza "8:00", "08:00" o "08:00:00" a "HH:mm". */
    fun normalizarHora(hora: String): String {
        val raw = hora.trim()
        if (raw.isBlank()) return HORA_DEFAULT
        return runCatching { LocalTime.parse(raw, entradaHora).format(salidaHora) }
            .recoverCatching { LocalTime.parse(raw).format(salidaHora) }
            .getOrElse { throw IllegalArgumentException("HORA_INVALIDA") }
    }

    /** Convierte fecha `YYYY-MM-DD` + hora local de México a un instante UTC. */
    fun parseFechaHora(fecha: String, hora: String): Instant {
        val raw = fecha.trim()
        if (raw.isBlank()) throw IllegalArgumentException("FECHA_REQUERIDA")
        val dia = runCatching { LocalDate.parse(raw) }
            .getOrElse { throw IllegalArgumentException("FECHA_INVALIDA") }
        val time = runCatching { LocalTime.parse(normalizarHora(hora), salidaHora) }
            .getOrElse { throw IllegalArgumentException("HORA_INVALIDA") }
        return dia.atTime(time).atZone(zona).toInstant()
    }

    fun diaDe(fecha: String): Int =
        runCatching { LocalDate.parse(fecha.trim()).dayOfMonth }
            .getOrElse { throw IllegalArgumentException("FECHA_INVALIDA") }

    /**
     * Siguiente ocurrencia mensual estrictamente posterior a [desde].
     * Se usa después de un job exitoso, para no volver a programar el mismo día.
     */
    fun siguienteMensual(desde: Instant, dia: Int, hora: String): Instant {
        val time = runCatching { LocalTime.parse(normalizarHora(hora), salidaHora) }
            .getOrDefault(LocalTime.of(8, 0))
        val diaOriginal = dia.coerceIn(1, 31)
        var mes = YearMonth.from(desde.atZone(zona))

        fun ocurrencia(m: YearMonth): Instant {
            val diaReal = diaOriginal.coerceAtMost(m.lengthOfMonth())
            return m.atDay(diaReal).atTime(time).atZone(zona).toInstant()
        }

        var candidato = ocurrencia(mes)
        if (!candidato.isAfter(desde)) {
            mes = mes.plusMonths(1)
            candidato = ocurrencia(mes)
        }
        return candidato
    }

    /** Fecha local (México) de un instante, en formato `YYYY-MM-DD`. */
    fun fechaLocal(instant: Instant): String = instant.atZone(zona).toLocalDate().toString()

    /** Hora local (México) de un instante, en formato `HH:mm`. */
    fun horaLocal(instant: Instant): String = instant.atZone(zona).toLocalTime().format(salidaHora)
}
