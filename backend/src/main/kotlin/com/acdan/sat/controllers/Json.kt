package com.acdan.sat.controllers

// Esc helpers. El armadillo de rutas devuelve los maps de Dynamo como texto JSON a mano,
// así que sin escapar comillas un valor con " rompe el JSON y el front recibe campos vacíos.
object Json {

    fun esc(s: String): String {
        val sb = StringBuilder(s.length + 16)
        for (c in s) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (c < ' ') sb.append("\\u%04x".format(c.code)) else sb.append(c)
            }
        }
        return sb.toString()
    }

    /** Serializa un map de Dynamo a objeto JSON. `sinTruncar` se usa para `campos`,
     *  que es un JSON anidado y no puede cortarse a media estructura. */
    fun obj(map: Map<*, *>, sinTruncar: Set<String> = emptySet(), max: Int = 2000): String =
        map.entries.joinToString(",", "{", "}") { (k, v) ->
            val value = v?.toString() ?: ""
            val limited = if (k.toString() in sinTruncar) value else value.take(max)
            "\"${esc(k.toString())}\":\"${esc(limited)}\""
        }
}
