package com.acdan.sat.scripts

/**
 * Evita avisar dos veces la misma Opinión 32-D.
 *
 * La corrida puede repetirse: si baja la opinión y después falla la constancia,
 * se vuelve a intentar y volvería a mandar el correo. La fuente de verdad es el
 * propio cliente: guarda qué opinión se le avisó por última vez, así que basta
 * compararla para saber si el aviso ya salió.
 *
 * Se compara folio y fecha, no el sentido: una opinión nueva puede cambiar de
 * sentido y eso sí debe avisarse.
 */
object AvisoOpinion {

    private const val CAMPO = "ultimaOpinionAvisada"

    /** Clave estable de una opinión concreta. */
    fun clave(folio: String, fecha: String): String {
        val f = folio.trim()
        if (f.isBlank()) return ""
        return "$f|${fecha.trim()}"
    }

    /** true si esa opinión ya se le comunicó al cliente. */
    fun yaAvisada(cliente: Map<String, *>, clave: String): Boolean {
        if (clave.isBlank()) return false
        return cliente[CAMPO]?.toString().orEmpty() == clave
    }

    /**
     * Deja registrado que esa opinión ya se avisó. No guarda nada si la clave
     * viene vacía (sin folio no hay forma de reconocer la opinión).
     */
    fun marcar(cliente: MutableMap<String, Any>, clave: String) {
        if (clave.isBlank()) return
        cliente[CAMPO] = clave
    }
}
