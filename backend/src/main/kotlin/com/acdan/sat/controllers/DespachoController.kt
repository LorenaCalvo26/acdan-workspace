package com.acdan.sat.controllers

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.acdan.sat.schemas.RFC_REGEX
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.time.Instant

@JsonIgnoreProperties(ignoreUnknown = true)
data class PaqueteDespachoRequest(
    val token: String = "",
    val rfc: String = "",
    val periodo: String = "",
    val enviar: Boolean = true
)

data class LogoRequest(val rfc: String = "", val fileType: String = "")
@JsonIgnoreProperties(ignoreUnknown = true)
data class LogoGuardarRequest(val rfc: String = "", val url: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
data class DespachoForm(
    val rfc: String = "",
    val nombre: String = "",
    val email: String = "",
    val telefono: String = "",
    val notas: String = "",
    /** "true" envia el paquete del mes automaticamente al terminar la cartera. */
    val paqueteAuto: String = "true"
)

/**
 * Despachos (cuentas).
 *
 * Pilli se vende por despacho: el despacho es el cliente comercial y su cartera
 * son los contribuyentes que opera. Los clientes sueltos quedan como cartera
 * individual (sin despacho).
 */
object DespachoController {
    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun tabla() = env("ACDAN_DESPACHOS", required = false, default = "ACDAN_DESPACHOS")

    fun listar(): ControllerResponse {
        val items = runCatching { dynamo().scanItems(tabla()) }.getOrDefault(emptyList())
            .sortedBy { it["nombre"]?.toString().orEmpty().lowercase() }
        val json = items.joinToString(",", "[", "]") { item ->
            item.entries.joinToString(",", "{", "}") { (k, v) ->
                "\"${k.replace("\"", "\\\"")}\":\"${v.toString().replace("\"", "\\\"").replace("\n", " ")}\""
            }
        }
        return ControllerResponse(200, """{"ok":true,"items":$json}""")
    }

    fun guardar(form: DespachoForm): ControllerResponse {
        val rfc = form.rfc.trim().uppercase()
        if (!RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        if (form.nombre.trim().isBlank()) return ControllerResponse(400, """{"error":"NOMBRE_REQUERIDO"}""")
        val email = form.email.trim().lowercase()
        if (email.isNotBlank() && !Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(email)) {
            return ControllerResponse(400, """{"error":"EMAIL_INVALIDO"}""")
        }
        val previo = runCatching { dynamo().getItem(tabla(), "pk", rfc) }.getOrNull()
        val item = mutableMapOf<String, String>(
            "pk" to rfc,
            "rfc" to rfc,
            "nombre" to form.nombre.trim(),
            "email" to email,
            "telefono" to form.telefono.trim(),
            "notas" to form.notas.trim(),
            "paqueteAuto" to if (form.paqueteAuto.trim() == "false") "false" else "true",
            "activo" to (previo?.get("activo")?.toString() ?: "true"),
            "creadoEn" to (previo?.get("creadoEn")?.toString() ?: Instant.now().toString()),
            "updatedAt" to Instant.now().toString()
        )
        dynamo().insertItem(tabla(), item)
        // Al darlo de alta se le da la bienvenida; si falla el correo, el alta sigue.
        if (previo == null) {
            runCatching {
                com.acdan.sat.scripts.EmailNotifier.notificarBienvenidaDespacho(
                    emailDespacho = email,
                    nombreDespacho = item["nombre"] ?: "",
                    logoDespacho = item["logoUrl"] ?: ""
                )
            }
        }
        return ControllerResponse(200, """{"ok":true,"rfc":"$rfc"}""")
    }

    /** Firma la subida del logo y devuelve donde subirlo y su URL final. */
    fun logoUrl(req: LogoRequest): ControllerResponse {
        val rfc = req.rfc.trim().uppercase()
        if (!RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        if (!com.acdan.sat.scripts.BrandingStore.configurado()) return ControllerResponse(503, """{"error":"ALMACEN_NO_CONFIGURADO"}""")
        val firma = com.acdan.sat.scripts.BrandingStore.firmar("despachos/" + rfc, req.fileType)
            ?: return ControllerResponse(400, """{"error":"FORMATO_NO_SOPORTADO"}""")
        return ControllerResponse(200, """{"ok":true,"uploadUrl":"${firma.uploadUrl}","publicUrl":"${firma.publicUrl}"}""")
    }

    /** Guarda la URL publica del logo ya subido. */
    fun logoGuardar(req: LogoGuardarRequest): ControllerResponse {
        val rfc = req.rfc.trim().uppercase()
        if (!RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        if (!req.url.trim().startsWith("https://")) return ControllerResponse(400, """{"error":"URL_INVALIDA"}""")
        val item = runCatching { dynamo().getItem(tabla(), "pk", rfc) }.getOrNull()
            ?: return ControllerResponse(404, """{"error":"DESPACHO_NO_ENCONTRADO"}""")
        val merged = item.toMutableMap<String, Any?>()
        merged["logoUrl"] = req.url.trim()
        merged["updatedAt"] = java.time.Instant.now().toString()
        runCatching { dynamo().insertItem(tabla(), merged.mapValues { it.value.toString() }) }
            .getOrElse { return ControllerResponse(500, """{"error":"NO_SE_PUDO_GUARDAR"}""") }
        return ControllerResponse(200, """{"ok":true,"rfc":"$rfc","logoUrl":"${req.url.trim()}"}""")
    }

    /** Reenvia la bienvenida al correo del despacho. */
    fun bienvenida(req: LogoRequest): ControllerResponse {
        val rfc = req.rfc.trim().uppercase()
        if (!RFC_REGEX.matches(rfc)) return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        val item = runCatching { dynamo().getItem(tabla(), "pk", rfc) }.getOrNull()
            ?: return ControllerResponse(404, """{"error":"DESPACHO_NO_ENCONTRADO"}""")
        val email = item["email"]?.toString().orEmpty()
        if (email.isBlank()) return ControllerResponse(400, """{"error":"SIN_CORREO"}""")
        runCatching {
            com.acdan.sat.scripts.EmailNotifier.notificarBienvenidaDespacho(
                emailDespacho = email,
                nombreDespacho = item["nombre"]?.toString().orEmpty(),
                logoDespacho = item["logoUrl"]?.toString().orEmpty()
            )
        }.getOrElse { return ControllerResponse(500, """{"error":"NO_SE_PUDO_ENVIAR"}""") }
        return ControllerResponse(200, """{"ok":true,"email":"$email"}""")
    }

    /** Arma el paquete del mes de toda la cartera y devuelve la liga de descarga. */
    fun paquete(req: PaqueteDespachoRequest): ControllerResponse {
        val sesion = runCatching { com.acdan.sat.scripts.AuthStore.verificarJwt(req.token) }.getOrNull()
            ?: return ControllerResponse(401, """{"error":"TOKEN_INVALIDO"}""")
        if (sesion["rol"] != "ADMIN" && sesion["rol"] != "OPERADOR") {
            return ControllerResponse(403, """{"error":"SOLO_STAFF"}""")
        }
        val rfc = req.rfc.trim().uppercase()
        // "ACDAN" es la cartera de los clientes individuales, no un RFC real.
        if (rfc != com.acdan.sat.scripts.PaqueteDespacho.CLAVE_INDIVIDUALES && !RFC_REGEX.matches(rfc)) {
            return ControllerResponse(400, """{"error":"RFC_INVALIDO"}""")
        }
        val periodo = if (req.periodo.isBlank()) com.acdan.sat.scripts.CfdiStore.ultimoMesCerrado()
            else runCatching { java.time.YearMonth.parse(req.periodo) }.getOrNull()
            ?: return ControllerResponse(400, """{"error":"PERIODO_INVALIDO"}""")

        val r = runCatching { com.acdan.sat.scripts.PaqueteDespacho.generar(rfc, periodo) }.getOrNull()
            ?: return ControllerResponse(404, """{"error":"SIN_CFDI","detalle":"El despacho no tiene clientes con CFDI de ese mes."}""")

        // A quien se le avisa: al despacho, o a los admins si es la cartera individual.
        val esIndividuales = rfc == com.acdan.sat.scripts.PaqueteDespacho.CLAVE_INDIVIDUALES
        val usuariosTabla = env("ACDAN_USERS", required = false, default = "ACDAN_USERS")
        val destinatarios: List<String> = if (esIndividuales) {
            runCatching { dynamo().scanItems(usuariosTabla) }.getOrDefault(emptyList())
                .filter { it["rol"]?.toString() == "ADMIN" && it["status"]?.toString() != "inactive" }
                .mapNotNull { it["email"]?.toString()?.takeIf { e -> e.isNotBlank() } }
        } else {
            listOf(runCatching { dynamo().getItem(tabla(), "pk", rfc) }.getOrNull()?.get("email")?.toString().orEmpty())
                .filter { it.isNotBlank() }
        }

        val despachoItem = if (esIndividuales) null else runCatching { dynamo().getItem(tabla(), "pk", rfc) }.getOrNull()
        val nombreMarca = if (esIndividuales) "ACDAN Consultores" else despachoItem?.get("nombre")?.toString().orEmpty()
        // ACDAN es la cartera de individuales: manda el avatar del admin y, si no
        // tiene, el logo fijo de ACDAN.
        val logoMarca = if (esIndividuales) {
            val avatar = runCatching { dynamo().scanItems(usuariosTabla) }.getOrDefault(emptyList())
                .firstOrNull { it["rol"]?.toString() == "ADMIN" && !it["avatarUrl"]?.toString().isNullOrBlank() }
                ?.get("avatarUrl")?.toString()
            // Si el archivo ya no está (por ejemplo, lo borró un despliegue), no
            // se manda un logo roto: se usa el de ACDAN.
            if (!avatar.isNullOrBlank() && com.acdan.sat.scripts.BrandingStore.urlViva(avatar)) avatar
            else env("ACDAN_LOGO_URL", required = false, default = "").ifBlank {
                env("BRAND_LOGO_URL", required = false, default = "")
            }
        } else {
            despachoItem?.get("logoUrl")?.toString().orEmpty()
        }
        val caduca = java.time.LocalDate.now().plusDays(30).toString()
        var enviados = 0
        if (req.enviar) {
            for (para in destinatarios.distinct()) {
                runCatching {
                    com.acdan.sat.scripts.EmailNotifier.notificarPaquete(
                        para = para,
                        nombreDespacho = nombreMarca,
                        logoDespacho = logoMarca,
                        periodo = periodo,
                        clientes = r.cliente,
                        archivos = r.archivos,
                        bytes = r.bytes,
                        liga = r.url,
                        caduca = caduca
                    )
                }.onSuccess { enviados++ }
            }
        }

        return ControllerResponse(200, """{"ok":true,"despacho":"${r.despacho}","periodo":"${r.periodo}","cliente":${r.cliente},"archivos":${r.archivos},"bytes":${r.bytes},"url":"${r.url}","enviados":$enviados}""")
    }

    fun eliminar(rfc: String): ControllerResponse {
        val key = rfc.trim().uppercase()
        if (key.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUERIDO"}""")
        // Los clientes de la cartera no se borran: quedan como individuales.
        runCatching { dynamo().deleteItem(tabla(), mapOf("pk" to key)) }
        return ControllerResponse(200, """{"ok":true,"rfc":"$key"}""")
    }
}
