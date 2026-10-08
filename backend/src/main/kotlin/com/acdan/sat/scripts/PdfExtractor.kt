package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.providers.pdf.PDFReaderProvider

// Extrae campos relevantes según tipo de documento.
// Constancia: RFC, CURP, nombre, domicilio, régimen, fecha emisión, QR/CIF.
// 32-D: sentido (positivo/negativo), fecha emisión, vigencia, folio.
object PdfExtractor {

    fun extract(pdfPath: String, tipo: String): Map<String, String> {
        val reader = app.getInstance(PDFReaderProvider::class)
        val doc = reader.read(pdfPath)
        val text = doc.text
        return if (tipo == "32d") extract32d(text) else extractConstancia(text)
    }

    /** Texto normalizado tal como lo ven los regex (para afinar patrones sin quemar intentos). */
    fun vistaConstancia(pdfPath: String): String {
        val reader = app.getInstance(PDFReaderProvider::class)
        val text = reader.read(pdfPath).text
        return norm(text)
    }

    private fun extract32d(raw: String): Map<String, String> {
        // El 32-D es una tabla de dos columnas: la ETIQUETA va en una fila y el VALOR
        // en la siguiente ("RFC Folio" / "GUAJ880224I62 26NL7585903"). Por eso
        // primero aplanamos el texto: sin normalizar, ningún regex encuentra los valores.
        val t = norm(raw)

        // El RFC del contribuyente es el primer token con forma de RFC en todo el texto.
        val rfcRx = Regex("[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}")
        val rfc = rfcRx.find(t)?.value ?: ""

        // Folio SAT: 2 dígitos + 2 letras + 7 dígitos (p.ej. 26NL7585903).
        val folioRx = Regex("\\b[0-9]{2}[A-Z]{2}[0-9]{7}\\b")
        val folio = folioRx.find(t)?.value ?: ""

        // "Sentido" va antes de la columna con POSITIVO/NEGATIVO: acotamos la búsqueda
        // a esa ventana para no confundir una observación con el dictamen.
        val iSentido = t.indexOf("Sentido", ignoreCase = true)
        val ventana = if (iSentido >= 0) t.substring(iSentido, minOf(t.length, iSentido + 140)) else t
        val sentido = when {
            ventana.contains("POSITIVO", ignoreCase = true) -> "positivo"
            ventana.contains("NEGATIVO", ignoreCase = true) -> "negativo"
            ventana.contains("SIN OBLIGACIONES", ignoreCase = true) -> "sin-obligaciones"
            else -> "desconocido"
        }

        // Nombre: va entre la columna "Sentido" y el valor del dictamen.
        val nombre = Regex("Sentido\\s+(.{3,80}?)\\s+(?:POSITIVO|NEGATIVO|SIN\\s+OBLIGACIONES)", RegexOption.IGNORE_CASE)
            .find(t)?.groupValues?.getOrNull(1)?.trim() ?: ""

        // "Fecha y hora de emisión" seguido de texto en español hasta "horas".
        val fechaEmision = Regex(
            "(?:Fecha y hora de emisi[óo]n|Fecha de emisi[óo]n)\\s+(.{5,60}?)\\s+horas?",
            RegexOption.IGNORE_CASE
        ).find(t)?.groupValues?.getOrNull(1)?.trim() ?: ""

        // Párrafo descriptivo que sigue a la fórmula de cortesía.
        val detalle = Regex("(?:Apreciable contribuyente|Estimado contribuyente)\\s+(.{40,700})", RegexOption.DOT_MATCHES_ALL)
            .find(t)?.groupValues?.getOrNull(1)?.trim() ?: ""

        return mapOf(
            "sentido" to sentido,
            "nombre" to nombre,
            "rfc" to rfc,
            "folio" to folio,
            "fechaEmision" to fechaEmision,
            "detalle" to detalle,
            "raw" to raw.take(4000)
        )
    }

    private fun extractConstancia(raw: String): Map<String, String> {
        // El texto del PDF trae acentos latinos correctos (áéíóúÉÓ): los patrones
        // los incluyen tal cual. (Un artefacto de consola hizo creer que había
        // mojibake griego; se verificó por codepoints devueltos por la JVM.)
        val t = norm(raw)
        val rfc = Regex("[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}").find(t)?.value ?: ""
        fun find(rx: String): String =
            Regex(rx, RegexOption.IGNORE_CASE).find(t)?.groupValues?.getOrNull(1)?.trim() ?: ""
        // Nombre: tres partes de un token, o Nombre Comercial hasta su remate.
        val partes = listOf(
            find("Nombre \\(s\\):\\s*([A-ZÑ]+)"),
            find("Primer Apellido:\\s*([A-ZÑ]+)"),
            find("Segundo Apellido:\\s*([A-ZÑ]+)")
        ).filter { it.isNotBlank() }
        val nombre = when {
            partes.size == 3 -> partes.joinToString(" ")
            else -> find("Nombre Comercial:\\s*(.+?)\\s+Datos del domicilio")
        }
        return mapOf(
            "rfc" to rfc,
            "curp" to find("\\b([A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2})\\b"),
            "nombre" to nombre,
            "regimen" to find("Regímenes:\\s*Régimen Fecha Inicio Fecha Fin\\s+(.+?)\\s+\\d{2}/\\d{2}/\\d{4}"),
            "cp" to find("Código Postal:?\\s*(\\d{5})"),
            "fechaEmision" to find("A (\\d{2} DE [A-ZÁÉÍÓÚÜÑ]+ DE \\d{4})"),
            "idCIF" to find("idCIF:\\s*(\\d+)"),
            "raw" to raw.take(4000)
        )
    }

    // PDFBox deja tabs, saltos y no-break spaces entre celdas: se aplana a un solo
    // espacio para que los regex working sobre etiquetas y valores en filas distintas.
    private fun norm(text: String): String =
        text.replace('\u00A0', ' ')
            .replace(Regex("[ \\t\\r\\n]+"), " ")
            .trim()
}
