package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.providers.mailing.Sender
import com.koupper.providers.templates.TemplateProvider

/**
 * Notificaciones por email de los dictámenes, eventos del bot del SAT y formularios de contacto web.
 *
 * Reglas de Notificación:
 *  - Dictamen POSITIVO: Email estilizado de marca al cliente (si tiene email válido) + copia limpia a los admins.
 *  - Dictamen NEGATIVO / SIN RESULTADO: Email ÚNICAMENTE a los admins, para no alarmar al cliente sin previa revisión contable.
 *  - FALLO / ERROR DE EJECUCIÓN: Email ÚNICAMENTE a los admins informando la situación con el cliente.
 *  - LEAD DE CONTACTO WEB: Confirmación al prospecto y alerta inmediata a los admins con los datos.
 *
 * "Admins" = usuarios con rol ADMIN activos en ACDAN_USERS más el buzón
 * CONTACT_ADMIN_EMAIL (respaldo). Así le llega a quien realmente usa Pilli,
 * no a una dirección fija que nadie revisa.
 *
 * El HTML vive en `src/main/resources/templates/` (un archivo por correo) y se resuelve con el
 * TemplateProvider de Koupper (marcadores `{{ nombre }}`). Aquí solo se
 * calculan los valores y se envían.
 */
object EmailNotifier {

    private const val COLOR_POSITIVO = "#0F9D6A"
    private const val COLOR_NEGATIVO = "#C0392B"

    /** GIF transparente de 1x1: evita el icono de imagen rota si falta el logo. */
    private const val PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

    private fun adminEmail() = env("CONTACT_ADMIN_EMAIL", required = false, default = "contador@acdanconsultores.mx")

    /** Buzones admin reales: ADMIN activos de ACDAN_USERS + buzón de respaldo (sin duplicados). */
    private fun adminEmails(): List<String> {
        val fijos = adminEmail().trim().lowercase().takeIf { esEmail(it) }?.let { listOf(it) } ?: emptyList()
        val deTabla = runCatching {
            val tabla = env("ACDAN_USERS", required = false, default = "ACDAN_USERS")
            app.getInstance(DynamoClient::class).scanItems(tabla)
                .filter { it["rol"]?.toString()?.uppercase() == "ADMIN" && it["status"]?.toString() == "active" }
                .mapNotNull { it["email"]?.toString()?.trim()?.lowercase()?.takeIf { e -> esEmail(e) } }
        }.getOrDefault(emptyList())
        return (deTabla + fijos).distinct()
    }

    private fun logoUrl() = env("BRAND_LOGO_URL", required = false, default = "")
    private fun acdanLogoUrl() = env("ACDAN_LOGO_URL", required = false, default = "")
    private fun activo() = !env("NOTIFICAR_EMAILS", required = false, default = "true").equals("false", true)
    private fun esEmail(e: String) = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(e.trim())

    // ------------------------------------------------------------------ plantillas

    /**
     * Carga una plantilla del classpath y reemplaza los marcadores `{{ clave }}`.
     * Si al final queda algún marcador sin resolver, lo reporta en el log: es
     * preferible un correo con un hueco a que se envíe con literatura `{{ }}`.
     */
    private fun plantilla(nombre: String, vars: Map<String, String>): String {
        val html = runCatching {
            app.getInstance(TemplateProvider::class).load("templates/$nombre", vars)
        }.getOrElse {
            println("[email] no se pudo cargar la plantilla $nombre: ${it.message}")
            return ""
        }
        val pendientes = Regex("\\{\\{\\s*([A-Za-z0-9_]+)\\s*}}")
            .findAll(html).map { it.groupValues[1] }.toSet()
        if (pendientes.isNotEmpty()) {
            println("[email] plantilla $nombre con marcadores sin resolver: $pendientes")
        }
        return html
    }

    /** Marcas comunes a todos los correos. */
    private fun marcas(): Map<String, String> = mapOf(
        "logoAcdan" to acdanLogoUrl().trim().ifBlank { PIXEL },
        "logoPilli" to logoUrl().trim().ifBlank { PIXEL }
    )

    // ------------------------------------------------------------------ notificaciones

    /** Notifica el resultado del dictamen (Opinión de Cumplimiento 32-D). */
    fun notificarDictamen(
        emailCliente: String,
        nombreCliente: String,
        rfc: String,
        folio: String,
        fecha: String,
        sentido: String,
        ligaPortal: String = ""
    ) {
        if (!activo()) return
        val positivo = sentido.equals("positivo", ignoreCase = true)
        val estado = when {
            positivo -> "POSITIVO"
            sentido.equals("negativo", ignoreCase = true) -> "NEGATIVO"
            sentido.isBlank() -> "SIN RESULTADO"
            else -> sentido.trim().uppercase()
        }

        // 1) Contribuyente: SOLO si es POSITIVO y tiene correo válido.
        if (positivo && emailCliente.isNotBlank() && esEmail(emailCliente)) {
            val saludo = nombreCorto(nombreCliente)
            enviar(
                emailCliente.trim(),
                "¡Buenas noticias, $saludo! Tu opinión fiscal está al corriente",
                plantilla(
                    "cliente-opinion-positiva.html",
                    marcas() + mapOf(
                        "saludo" to esc(saludo),
                        "rfc" to esc(rfc),
                        "folio" to esc(folio),
                        "fecha" to esc(fecha),
                        "ligaPortal" to esc(ligaPortal.ifBlank { ligaPortal(rfc) })
                    )
                )
            )
        }

        // 2) Admins: SIEMPRE reciben el reporte limpio.
        val asuntoAdmin = if (positivo) "[Pilli] Dictamen POSITIVO — $rfc" else "[ALERT Pilli] Dictamen $estado — $rfc"
        enviarATodos(
            adminEmails(),
            asuntoAdmin,
            plantilla(
                "admin-dictamen.html",
                marcas() + mapOf(
                    "estado" to esc(estado),
                    "colorEstado" to if (positivo) COLOR_POSITIVO else COLOR_NEGATIVO,
                    "nombre" to esc(nombreCliente),
                    "rfc" to esc(rfc),
                    "folio" to esc(folio),
                    "fecha" to esc(fecha)
                )
            )
        )
    }

    /** Notifica fallos de ejecución, errores de captcha o situaciones especiales únicamente a los admins. */
    fun notificarFallo(
        rfc: String,
        nombreCliente: String,
        errorMensaje: String
    ) {
        if (!activo()) return
        enviarATodos(
            adminEmails(),
            "[ATENCIÓN Pilli] Error al consultar RFC $rfc",
            plantilla(
                "admin-fallo.html",
                marcas() + mapOf(
                    "rfc" to esc(rfc),
                    "nombre" to esc(nombreCliente),
                    "error" to esc(errorMensaje)
                )
            )
        )
    }

    /** Procesa la solicitud del formulario de contacto del sitio web institucional. */
    fun notificarLeadContacto(
        nombre: String,
        email: String,
        telefono: String?,
        rfc: String?,
        interes: String?,
        mensaje: String
    ) {
        if (!activo()) return

        // 1) Acuse de recibo de marca al prospecto
        if (email.isNotBlank() && esEmail(email)) {
            val saludo = nombreCorto(nombre)
            enviar(
                email.trim(),
                "Hemos recibido tu mensaje — ACDAN Consultores",
                plantilla("cliente-lead.html", marcas() + mapOf("saludo" to esc(saludo)))
            )
        }

        // 2) Notificación inmediata al equipo Admin/Contable
        val motivo = interes?.ifBlank { "Información general" } ?: "Información general"
        enviarATodos(
            adminEmails(),
            "[NUEVO LEAD WEB] $motivo — ${nombre.trim()}",
            plantilla(
                "admin-lead.html",
                marcas() + mapOf(
                    "nombre" to esc(nombre.trim()),
                    "email" to esc(email.trim()),
                    "telefono" to esc(telefono?.ifBlank { "—" } ?: "—"),
                    "rfc" to esc(rfc?.ifBlank { "—" } ?: "—"),
                    "interes" to esc(motivo),
                    "mensaje" to esc(mensaje.trim())
                )
            )
        )
    }

    /**
     * Bienvenida con acceso al portal: liga + código de un solo uso visual.
     * Se envía al generar (o regenerar) el código, si el cliente tiene email.
     */
    fun notificarBienvenida(
        emailCliente: String,
        nombreCliente: String,
        rfc: String,
        codigo: String,
        ligaPortal: String
    ) {
        if (!activo()) return
        if (emailCliente.isBlank() || !esEmail(emailCliente)) return
        val saludo = nombreCorto(nombreCliente)
        enviar(
            emailCliente.trim(),
            "Tu portal fiscal ya está activo, $saludo",
            plantilla(
                "cliente-bienvenida.html",
                marcas() + mapOf(
                    "saludo" to esc(saludo),
                    "rfc" to esc(rfc),
                    "codigo" to esc(codigo),
                    "ligaPortal" to esc(ligaPortal.ifBlank { ligaPortal(rfc) })
                )
            )
        )
    }

    /**
     * Aviso de vencimiento próximo (0 a 7 días): va al cliente tenga el sentido
     * que tenga, y al contador le llega de todos modos el dictamen.
     */
    fun notificarVencimiento(
        emailCliente: String,
        nombreCliente: String,
        rfc: String,
        dias: Long,
        fechaVence: String
    ) {
        if (!activo()) return
        if (emailCliente.isBlank() || !esEmail(emailCliente)) return
        val saludo = nombreCorto(nombreCliente)
        val cuando = when {
            dias <= 0 -> "Vence hoy"
            dias == 1L -> "Vence mañana"
            else -> "Vence en $dias días"
        }
        enviar(
            emailCliente.trim(),
            "$cuando tu Opinión de cumplimiento — $rfc",
            plantilla(
                "cliente-vencimiento.html",
                marcas() + mapOf(
                    "saludo" to esc(saludo),
                    "rfc" to esc(rfc),
                    "cuando" to esc(cuando),
                    "cuandoBaja" to esc(cuando.replaceFirstChar { it.lowercase() }),
                    "fechaVence" to esc(fechaVence),
                    "ligaPortal" to esc(ligaPortal(rfc))
                )
            )
        )
    }

    /** Bienvenida a personal nuevo: sin contraseña (esa va por otro canal). */
    fun notificarBienvenidaStaff(
        emailDestino: String,
        nombre: String,
        loginUrl: String = ligaLogin(),
        rol: String = "OPERADOR"
    ) {
        if (!activo()) return
        if (emailDestino.isBlank() || !esEmail(emailDestino)) return
        val saludo = nombreCorto(nombre)
        val rolTxt = rol.trim().uppercase().ifBlank { "OPERADOR" }
        val quePuedes = if (rolTxt == "ADMIN")
            "Como <strong>Admin</strong> puedes ver el dashboard, gestionar clientes y crear usuarios."
        else
            "Como <strong>Operador</strong> puedes ver el dashboard y gestionar clientes."
        enviar(
            emailDestino.trim(),
            "Bienvenido a Pilli, $saludo",
            plantilla(
                "staff-bienvenida.html",
                marcas() + mapOf(
                    "saludo" to esc(saludo),
                    "email" to esc(emailDestino.trim()),
                    "loginUrl" to esc(loginUrl),
                    "rol" to esc(rolTxt),
                    "quePuedes" to quePuedes
                )
            )
        )
    }

    // ------------------------------------------------------------------ utilidades

    private fun portalBase() = env("PORTAL_BASE_URL", required = false, default = "http://localhost:5174")

    private fun appBase(): String {
        val app = env("APP_BASE_URL", required = false, default = "").trim()
        return if (app.isNotBlank()) app else portalBase()
    }

    /** Liga pública del portal de un RFC (misma forma que el front). */
    fun ligaPortal(rfc: String) = portalBase().trimEnd('/') + "/c/" + rfc.trim().uppercase()

    /** Liga de ingreso al dashboard interno (/login). */
    fun ligaLogin() = appBase().trimEnd('/') + "/login"

    private fun enviar(to: String, asunto: String, html: String) {
        if (html.isBlank()) {
            println("[email] sin contenido para $to :: $asunto")
            return
        }
        runCatching {
            val sender = app.getInstance(Sender::class)
            sender
                .sendTo(to)
                .subject(asunto)
                .withContent(html, "text/html")
                .send()
            println("[email] enviado a $to :: $asunto")
        }.onFailure {
            println("[email] ERROR al enviar a $to :: ${it.message}")
        }
    }

    /** Abanico a los admins: uno por buzón para no exponer direcciones entre sí. */
    private fun enviarATodos(destinatarios: List<String>, asunto: String, html: String) {
        if (destinatarios.isEmpty()) {
            println("[email] SIN DESTINATARIOS ADMIN :: $asunto")
            return
        }
        destinatarios.forEach { enviar(it, asunto, html) }
    }

    private fun nombreCorto(nombre: String): String {
        val n = nombre.trim()
        if (n.isBlank()) return "contribuyente"
        val primer = n.split(Regex("\\s+")).firstOrNull { it.length > 1 } ?: n
        return primer.substring(0, 1).uppercase() + primer.substring(1).lowercase()
    }

    private fun esc(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
}