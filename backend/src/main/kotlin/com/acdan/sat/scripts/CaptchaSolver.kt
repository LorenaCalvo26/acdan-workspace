package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.providers.vision.VisionProvider
import java.awt.Color
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

/**
 * Solver del captcha imagen del SAT.
 *
 * El SAT SIEMPRE genera exactamente 6 caracteres (letras mayúsculas y/o dígitos).
 * Eso es un oráculo gratis: cualquier lectura que no sea de 6 se sabe mala antes de
 * tocar el portal, así que se descarta y se pide otra imagen en vez de gastar un
 * intento de login. Solo se le manda al SAT un código de 6 caracteres.
 *
 * Además no se vota con una sola pasada: el modelo duda (la misma imagen da lecturas
 * distintas), así que seologierean varias variantes de la imagen y se pide coincidencia.
 */
object CaptchaSolver {

    /** Largo real del captcha del SAT. Cualquier lectura con otro largo es inválida. */
    const val LARGO_ESPERADO = 6

    private val PATRON = Regex("^[A-Z0-9]{$LARGO_ESPERADO}$")

    private const val PROMPT =
        "This image is a login CAPTCHA from the Mexican tax authority (SAT). " +
            "It contains EXACTLY 6 characters: uppercase letters and/or digits. " +
            "They appear in a single horizontal row over a noisy background of colored dots. " +
            "Ignore the colored dots and curves; they are not characters. " +
            "Read ONLY the 6 dark characters, strictly from LEFT to RIGHT as they appear on screen. " +
            "Do not reverse the order. Confusions to watch for: 0 vs O, 1 vs I vs L, 5 vs S, 8 vs B, 6 vs G, 2 vs Z. " +
            "Answer with ONLY the 6 characters, uppercase, no spaces, no punctuation, no explanation."

    enum class Modo { ORIGINAL, GRIS, SUAVE, DURO }

    /** Resultado de resolver una imagen: el código elegido y si hubo acuerdo. */
    data class Lectura(
        val code: String,
        val lecturas: List<String>,
        val consensoAlto: Boolean
    )

    fun esValido(code: String): Boolean = PATRON.matches(code)

    /** Votos coincidentes mínimos para dares a usar ese código en un login. */
    private const val VOTOS_MINIMOS = 3

    /**
     * Votación por variantes. Mínimo 3 lecturas coincidentes antes de arriesgar un
     * intento de login del SAT; con 4 en total es suficiente. Si ninguna lectura
     * alcanza el quorum devuelve "" para descartar la imagen y pedir otra, en vez de
     * mandar un código dudoso al SAT y gastar un intento (y arriesgar bloqueo).
     */
    fun solve(imageBytes: ByteArray): Lectura {
        val vision = app.getInstance(VisionProvider::class)
        val salidas = mutableListOf<String>()

        fun leer(modo: Modo) {
            val img = runCatching { preparar(imageBytes, modo) }.getOrElse { imageBytes }
            val crudo = runCatching { vision.analyzeAsText(img, PROMPT) }.getOrNull()
            if (crudo == null) println("[captcha] visión falló en $modo")
            else salidas.add(limpiar(crudo))
        }

        // Las 3 primeras van de menos a más destructivas; ORIGINAL no borra bordes,
        // que es lo que hacía perder caracteres antes.
        leer(Modo.ORIGINAL)
        leer(Modo.GRIS)
        leer(Modo.SUAVE)
        if (ganador(salidas) == null) leer(Modo.DURO)

        val validas = salidas.filter { esValido(it) }
        println("[captcha] lecturas=$salidas validas=$validas")
        val elegido = ganador(salidas)
        if (elegido == null) return Lectura("", salidas, false)
        return Lectura(elegido, salidas, cuenta(salidas).getValue(elegido) == salidas.size)
    }

    /** Lectura válida con al menos VOTOS_MINIMOS votos, o null si no hay quorum. */
    private fun ganador(salidas: List<String>): String? {
        val cuenta = cuenta(salidas)
        return cuenta.entries.firstOrNull { it.value >= VOTOS_MINIMOS }?.key
    }

    private fun cuenta(salidas: List<String>): Map<String, Int> =
        salidas.filter { esValido(it) }.groupingBy { it }.eachCount()

    private fun limpiar(s: String): String =
        s.uppercase().replace(Regex("[^A-Z0-9]"), "").take(10)

    /**
     * ORIGINAL: solo amplía, conserva los bordes suaves que usa el modelo para separar
     *   caracteres pegados. Es la variante con menos riesgo de perder un carácter.
     * GRIS: quita el color (el confeti es a color) estirando el contraste, sin
     *   binarizar: mantiene la información de borde.
     * SUAVE/DURO: además limpian el fondo, de forma progresiva más agresiva.
     */
    fun preparar(imageBytes: ByteArray, modo: Modo, escala: Int = 6): ByteArray {
        val src: BufferedImage = ImageIO.read(ByteArrayInputStream(imageBytes)) ?: return imageBytes
        val w = src.width * escala
        val h = src.height * escala
        val scaled = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
        val g: Graphics2D = scaled.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
        g.drawImage(src, 0, 0, w, h, null)
        g.dispose()
        return when (modo) {
            Modo.ORIGINAL -> codificar(scaled, 0, 0)
            Modo.GRIS -> grisContraste(scaled)
            Modo.SUAVE -> codificar(scaled, 90, 200)
            Modo.DURO -> codificar(scaled, 70, 175)
        }
    }

    /**
     * Filtro de confeti píxel a píxel. `satMax` en 0 significa "sin filtro" (solo copia),
     * que es el caso de ORIGINAL.
     */
    private fun codificar(img: BufferedImage, satMax: Int, brightMax: Int): ByteArray {
        val w = img.width
        val h = img.height
        val nuevo = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
        if (satMax <= 0) {
            val g = nuevo.createGraphics()
            g.drawImage(img, 0, 0, null)
            g.dispose()
        } else {
            for (y in 0 until h) {
                for (x in 0 until w) {
                    val rgb = img.getRGB(x, y)
                    val r = (rgb shr 16) and 0xFF
                    val gg = (rgb shr 8) and 0xFF
                    val b = rgb and 0xFF
                    val sat = maxOf(r, gg, b) - minOf(r, gg, b)
                    val bright = (r + gg + b) / 3
                    val v = if (sat < satMax && bright < brightMax) 0 else 255
                    nuevo.setRGB(x, y, (v shl 16) or (v shl 8) or v)
                }
            }
            // Rejilla vertical tenue cada 1/6 del ancho: ancla la lectura izquierda-derecha,
            // que es justo lo que el bot acertaba a medias.
            val g = nuevo.createGraphics()
            g.color = Color(215, 215, 215)
            g.stroke = java.awt.BasicStroke(1.0f)
            val paso = w.toDouble() / LARGO_ESPERADO
            for (k in 1 until LARGO_ESPERADO) {
                val x = (paso * k).toInt()
                g.drawLine(x, 0, x, h)
            }
            g.dispose()
        }
        val out = ByteArrayOutputStream()
        ImageIO.write(nuevo, "png", out)
        return out.toByteArray()
    }

    /**
     * Escala de grises con estiramiento de contraste: elimina el confeti a color sin
     * destruir los bordes, que es justo lo que separaba 8 de B y 6 de G.
     */
    private fun grisContraste(img: BufferedImage): ByteArray {
        val w = img.width
        val h = img.height
        val lum = IntArray(w * h)
        var min = 255
        var max = 0
        for (i in 0 until w * h) {
            val rgb = img.getRGB(i % w, i / w)
            val r = (rgb shr 16) and 0xFF
            val g = (rgb shr 8) and 0xFF
            val b = rgb and 0xFF
            val v = (r * 299 + g * 587 + b * 114) / 1000
            lum[i] = v
            if (v < min) min = v
            if (v > max) max = v
        }
        val span = maxOf(1, max - min)
        val nuevo = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
        for (i in 0 until w * h) {
            val v = ((lum[i] - min) * 255 / span).coerceIn(0, 255)
            nuevo.setRGB(i % w, i / w, (v shl 16) or (v shl 8) or v)
        }
        val out = ByteArrayOutputStream()
        ImageIO.write(nuevo, "png", out)
        return out.toByteArray()
    }

    /** Atajo usado por el endpoint de debug. */
    fun preprocess(imageBytes: ByteArray, scale: Int = 6): ByteArray = preparar(imageBytes, Modo.SUAVE, scale)
}
