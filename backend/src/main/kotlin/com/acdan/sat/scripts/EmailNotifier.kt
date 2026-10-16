package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.mailing.Sender

/**
 * Notificaciones por email de los dictámenes, eventos del bot del SAT y formularios de contacto web.
 *
 * Reglas de Notificación:
 *  - Dictamen POSITIVO: Email estilizado de marca al cliente (si tiene email válido) + copia limpia al admin (CONTACT_ADMIN_EMAIL).
 *  - Dictamen NEGATIVO / SIN RESULTADO: Email ÚNICAMENTE al admin, para no alarmar al cliente sin previa revisión contable.
 *  - FALLO / ERROR DE EJECUCIÓN: Email ÚNICAMENTE al admin informando la situación con el cliente.
 *  - LEAD DE CONTACTO WEB: Confirmación al prospecto y alerta inmediata al Admin con los datos.
 */
object EmailNotifier {

    private const val MARINO = "#0F2A44"
    private const val DORADO = "#C9A86A"
    private const val HUESO = "#FAF7F2"

    private fun adminEmail() = env("CONTACT_ADMIN_EMAIL", required = false, default = "contador@acdanconsultores.mx")
    private fun logoUrl() = env("BRAND_LOGO_URL", required = false, default = "")
    private fun activo() = !env("NOTIFICAR_EMAILS", required = false, default = "true").equals("false", true)
    private fun esEmail(e: String) = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(e.trim())

    /**
     * Notifica el resultado del dictamen (Opinión de Cumplimiento 32-D).
     */
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
                htmlClientePositivo(saludo, rfc, folio, fecha, ligaPortal)
            )
        }

        // 2) Admin / Ejecutor: SIEMPRE recibe el reporte limpio.
        val asuntoAdmin = if (positivo) "[Pilli] Dictamen POSITIVO — $rfc" else "[ALERT Pilli] Dictamen $estado — $rfc"
        enviar(
            adminEmail(),
            asuntoAdmin,
            htmlAdminDictamen(estado, positivo, nombreCliente, rfc, folio, fecha)
        )
    }

    /**
     * Notifica fallos de ejecución, errores de captcha o situaciones especiales únicamente al Admin.
     */
    fun notificarFallo(
        rfc: String,
        nombreCliente: String,
        errorMensaje: String
    ) {
        if (!activo()) return
        enviar(
            adminEmail(),
            "[ATENCIÓN Pilli] Error al consultar RFC $rfc",
            htmlAdminFallo(rfc, nombreCliente, errorMensaje)
        )
    }

    /**
     * Procesa la solicitud del formulario de contacto del sitio web institucional.
     */
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
                htmlClienteLead(saludo)
            )
        }

        // 2) Notificación inmediata al equipo Admin/Contable
        val motivo = interes?.ifBlank { "Información general" } ?: "Información general"
        enviar(
            adminEmail(),
            "[NUEVO LEAD WEB] $motivo — ${nombre.trim()}",
            htmlAdminLead(nombre, email, telefono, rfc, interes, mensaje)
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
            htmlBienvenida(saludo, rfc, codigo, ligaPortal)
        )
    }

    /**
     * Aviso de vencimiento próximo (0 a 7 días): va al cliente tenga el sentido
     * que tenga, y al contador le llega de todos modos el dictamen (positivo y
     * negativo van al admin por criterio).
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
            htmlVencimiento(saludo, rfc, cuando, fechaVence)
        )
    }

    private fun portalBase() = env("PORTAL_BASE_URL", required = false, default = "http://localhost:5174")

    /** Liga pública del portal de un RFC (misma forma que el front). */
    fun ligaPortal(rfc: String) = portalBase().trimEnd('/') + "/c/" + rfc.trim().uppercase()

    private fun enviar(to: String, asunto: String, html: String) {
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

    private fun nombreCorto(nombre: String): String {
        val n = nombre.trim()
        if (n.isBlank()) return "contribuyente"
        val primer = n.split(Regex("\\s+")).firstOrNull { it.length > 1 } ?: n
        return primer.substring(0, 1).uppercase() + primer.substring(1).lowercase()
    }

    private fun esc(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    // ------------------------------------------------------------------ HTML TEMPLATES
    private fun logotipo(): String {
        val url = logoUrl().trim()
        // Estilo home de Pilli: logo centrado + "Pilli Contable" + tagline.
        val img = if (url.isNotBlank()) {
            """<img src="$url" alt="Pilli" width="120" style="display:block;border:0;max-width:120px;height:auto;margin:0 auto;"/>"""
        } else {
            ""
        }
        return """<div style="text-align:center;">$img
<div style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:$MARINO;margin-top:10px;">Pilli <span style="color:$DORADO;">Contable</span></div>
<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#7B8AA0;margin-top:4px;">Tu Opinión 32-D y tu Constancia siempre vigentes, sin mover un dedo.</div>
<div style="height:4px;margin-top:14px;border-radius:2px;background:#C9A86A;background-image:linear-gradient(90deg,#0F2A44 0%,#C9A86A 55%,#0F2A44 100%);"></div></div>"""
    }

    private fun htmlClientePositivo(saludo: String, rfc: String, folio: String, fecha: String, ligaPortal: String = ""): String {
        val boton = if (ligaPortal.isNotBlank()) """
                <div style="text-align:center;margin:4px 0 20px;">
                  <a href="${esc(ligaPortal)}" style="display:inline-block;background:$MARINO;color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;padding:12px 28px;border-radius:10px;">Ver mis documentos y CFDI</a>
                </div>""" else ""
        return """
        <!doctype html>
        <html lang="es"><head><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);" bgcolor="#FAF7F2">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FAF7F2" style="background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);padding:32px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
              <tr><td style="padding-bottom:20px;text-align:left;">${logotipo()}</td></tr>
              <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #EDE7DA;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:$MARINO;">¡Buenas noticias, ${esc(saludo)}!</h1>
                <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#33465B;">
                  Tu <strong>Opinión del cumplimiento de obligaciones fiscales (32-D)</strong> se encuentra emitida <strong>al corriente (POSITIVA)</strong>.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:$HUESO;border-radius:12px;padding:16px;">
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7B8AA0;padding:4px 12px;">RFC</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:$MARINO;padding:4px 12px;">${esc(rfc)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7B8AA0;padding:4px 12px;">Folio</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:$MARINO;padding:4px 12px;">${esc(folio)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7B8AA0;padding:4px 12px;">Emisión</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:$MARINO;padding:4px 12px;">${esc(fecha)}</td></tr>
                </table>
                $boton
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }

    private fun htmlAdminDictamen(estado: String, positivo: Boolean, nombre: String, rfc: String, folio: String, fecha: String): String {
        val colorEstado = if (positivo) "#0F9D6A" else "#C0392B"
        return """
        <!doctype html>
        <html lang="es"><body style="margin:0;padding:0;background:#F5F6F8;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F6F8;padding:24px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;">
              <tr><td style="padding-bottom:12px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;">Pilli · Monitoreo Automático SAT</td></tr>
              <tr><td style="background:#ffffff;border:1px solid #E5E9EF;border-radius:12px;padding:24px;">
                <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#5A6A7E;text-transform:uppercase;">Dictamen 32-D</p>
                <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:$colorEstado;">$estado</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">RFC</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:$MARINO;padding:4px 0;">${esc(rfc)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Contribuyente</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(nombre)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Folio</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(folio)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Fecha Emisión</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(fecha)}</td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }

    private fun htmlAdminFallo(rfc: String, nombre: String, error: String): String {
        return """
        <!doctype html>
        <html lang="es"><body style="margin:0;padding:0;background:#FDF2F2;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF2F2;padding:24px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;">
              <tr><td style="padding-bottom:12px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#9B2C2C;">Pilli · Alerta de Sistema</td></tr>
              <tr><td style="background:#ffffff;border:1px solid #F8B4B4;border-radius:12px;padding:24px;">
                <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#9B2C2C;font-weight:700;">SITUACIÓN REQUIERE ATENCIÓN</p>
                <h2 style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:18px;color:#742A2A;">Fallo en consulta de cliente</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#718096;padding:4px 0;">RFC</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#2D3748;padding:4px 0;">${esc(rfc)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#718096;padding:4px 0;">Contribuyente</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#2D3748;padding:4px 0;">${esc(nombre)}</td></tr>
                </table>
                <div style="background:#FFF5F5;border-left:4px solid #E53E3E;padding:12px;border-radius:4px;">
                  <p style="margin:0;font-family:monospace;font-size:12px;color:#C53030;">${esc(error)}</p>
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }

    private fun htmlBienvenida(saludo: String, rfc: String, codigo: String, liga: String): String {
        return """
        <!doctype html>
        <html lang="es"><head><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);" bgcolor="#FAF7F2">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FAF7F2" style="background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);padding:32px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
              <tr><td style="padding-bottom:20px;text-align:left;">${logotipo()}</td></tr>
              <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #EDE7DA;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:$MARINO;">Hola, ${esc(saludo)}, tu portal ya está activo</h1>
                <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#33465B;">
                  Aquí verás tu Opinión de cumplimiento, tus documentos y tus CFDI, siempre actualizados por tu contador.
                </p>
                <div style="background:$HUESO;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
                  <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7B8AA0;margin-bottom:8px;">TU CÓDIGO DE ACCESO (úsalo una vez, luego pide otro a tu contador)</div>
                  <div style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:$MARINO;">${esc(codigo)}</div>
                </div>
                <div style="text-align:center;margin-bottom:20px;">
                  <a href="${esc(liga)}" style="display:inline-block;background:$MARINO;color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;padding:12px 28px;border-radius:10px;">Entrar a mi portal</a>
                </div>
                <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;">RFC: ${esc(rfc)} · Si no pediste este acceso, ignora este correo.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }

    private fun htmlVencimiento(saludo: String, rfc: String, cuando: String, fechaVence: String): String {
        return """
        <!doctype html>
        <html lang="es"><head><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);" bgcolor="#FAF7F2">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FAF7F2" style="background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);padding:32px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
              <tr><td style="padding-bottom:20px;text-align:left;">${logotipo()}</td></tr>
              <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #EDE7DA;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:$MARINO;">${esc(saludo)}, $cuando</h1>
                <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#33465B;">
                  Tu <strong>Opinión de cumplimiento 32-D</strong> del RFC <strong>${esc(rfc)}</strong> vence el <strong>${esc(fechaVence)}</strong>.
                  Tu contador ya está al tanto y la renovará; no necesitas hacer nada.
                </p>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }

    private fun htmlClienteLead(saludo: String): String {
        return """
        <!doctype html>
        <html lang="es"><head><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);" bgcolor="#FAF7F2">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#FAF7F2" style="background-color:#FAF7F2;background-image:linear-gradient(135deg,#FFFDF7 0%,#F7ECD4 45%,#E9D9B4 100%);padding:32px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
              <tr><td style="padding-bottom:20px;text-align:left;">${logotipo()}</td></tr>
              <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #EDE7DA;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:22px;color:$MARINO;">¡Hola, ${esc(saludo)}!</h1>
                <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#33465B;">
                  Gracias por ponerte en contacto con <strong>ACDAN Consultores</strong>. Hemos recibido tu solicitud correctamente.
                </p>
                <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#33465B;">
                  Un consultor de nuestro equipo revisará tus datos y se pondrá en contacto contigo en breve para diseñar la mejor estrategia para tu negocio.
                </p>
                <div style="border-top:1px solid #EDE7DA;padding-top:16px;margin-top:20px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;">
                  ACDAN Consultores · Tu guía en contabilidad y finanzas
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }

    private fun htmlAdminLead(nombre: String, email: String, telefono: String?, rfc: String?, interes: String?, mensaje: String): String {
        val telRow = if (!telefono.isNullOrBlank()) "<tr><td style=\"font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;\">Teléfono</td><td style=\"font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;\">${esc(telefono)}</td></tr>" else ""
        val rfcRow = if (!rfc.isNullOrBlank()) "<tr><td style=\"font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;\">RFC</td><td style=\"font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;\">${esc(rfc)}</td></tr>" else ""

        return """
        <!doctype html>
        <html lang="es"><body style="margin:0;padding:0;background:#F5F6F8;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F6F8;padding:24px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
              <tr><td style="padding-bottom:12px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;">Sitio Web ACDAN · Solicitud de Contacto</td></tr>
              <tr><td style="background:#ffffff;border:1px solid #E5E9EF;border-radius:12px;padding:24px;">
                <h2 style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:18px;color:$MARINO;">Nuevo Lead de Contacto</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Nombre</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:$MARINO;padding:4px 0;">${esc(nombre)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Email</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(email)}</td></tr>
                  $telRow
                  $rfcRow
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Interés</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:$DORADO;padding:4px 0;">${esc(interes ?: "N/A")}</td></tr>
                </table>
                <div style="background:#F8FAFC;border:1px solid #E2E8F0;padding:12px;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#334155;line-height:1.5;">
                  <strong>Mensaje:</strong><br/>
                  ${esc(mensaje)}
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }
}
