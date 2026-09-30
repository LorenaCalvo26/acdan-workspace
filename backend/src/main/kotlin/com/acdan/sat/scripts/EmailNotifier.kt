package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.mailing.Sender

/**
 * Notificaciones por email de los dictámenes.
 *
 * Reglas:
 *  - Dictamen POSITIVO: email amable y de marca al contribuyente (si tiene email) + copia
 *    austera al admin (CONTACT_ADMIN_EMAIL).
 *  - Dictamen NEGATIVO (o cualquier otro sentido): solo al admin, sin alarmar al cliente.
 *
 * El remitente es la cuenta SMTP configurada (MAIL_USERNAME) con nombre EMAIL_FROM_NAME,
 * que normalmente es el admin que programó el bot.
 */
object EmailNotifier {

    private const val MARINO = "#0F2A44"
    private const val DORADO = "#C9A86A"
    private const val HUESO = "#FAF7F2"

    private fun adminEmail() = env("CONTACT_ADMIN_EMAIL", required = false, default = "contador@acdanconsultores.mx")
    private fun logoUrl() = env("BRAND_LOGO_URL", required = false, default = "")
    private fun activo() = !env("NOTIFICAR_EMAILS", required = false, default = "true").equals("false", true)
    private fun esEmail(e: String) = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(e.trim())

    fun notificarDictamen(
        emailCliente: String,
        nombreCliente: String,
        rfc: String,
        folio: String,
        fecha: String,
        sentido: String
    ) {
        if (!activo()) return
        val positivo = sentido.equals("positivo", ignoreCase = true)
        val estado = when {
            positivo -> "POSITIVO"
            sentido.equals("negativo", ignoreCase = true) -> "NEGATIVO"
            sentido.isBlank() -> "SIN RESULTADO"
            else -> sentido.trim().uppercase()
        }

        // 1) Contribuyente: solo si es positivo y tiene correo.
        if (positivo && emailCliente.isNotBlank() && esEmail(emailCliente)) {
            val saludo = nombreCorto(nombreCliente)
            enviar(
                emailCliente.trim(),
                "¡Buenas noticias, $saludo! Tu opinión fiscal está al corriente",
                htmlClientePositivo(saludo, rfc, folio, fecha)
            )
        }

        // 2) Admin / ejecutor: siempre, en formato austero.
        enviar(
            adminEmail(),
            "[Pilli] Dictamen $estado — $rfc",
            htmlAdmin(estado, positivo, nombreCliente, rfc, folio, fecha)
        )
    }

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

    // ------------------------------------------------------------------ HTML
    private fun logotipo(): String {
        val url = logoUrl().trim()
        return if (url.isNotBlank()) {
            """<img src="$url" alt="Pilli" width="44" height="44" style="border-radius:10px;display:block;border:0;"/>"""
        } else {
            """<span style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:$MARINO;">Pilli <span style="color:$DORADO;">Contable</span></span>"""
        }
    }

    private fun htmlClientePositivo(saludo: String, rfc: String, folio: String, fecha: String): String {
        return """
        <!doctype html>
        <html lang="es"><body style="margin:0;padding:0;background:$HUESO;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:$HUESO;padding:32px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
              <tr><td style="padding-bottom:20px;text-align:left;">${logotipo()}</td></tr>
              <tr><td style="background:#ffffff;border:1px solid #EDE7DA;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:$MARINO;">¡Buenas noticias, ${esc(saludo)}!</h1>
                <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#33465B;">
                  Tu <strong>Opinión del cumplimiento de obligaciones fiscales</strong> está <strong>al corriente</strong>.
                  Todo en orden, no tienes que hacer nada.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:$HUESO;border-radius:12px;padding:16px;">
                  <tr>
                    <td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7B8AA0;padding:4px 12px;">RFC</td>
                    <td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:$MARINO;padding:4px 12px;">${esc(rfc)}</td>
                  </tr>
                  <tr>
                    <td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7B8AA0;padding:4px 12px;">Folio</td>
                    <td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:$MARINO;padding:4px 12px;">${esc(folio)}</td>
                  </tr>
                  <tr>
                    <td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#7B8AA0;padding:4px 12px;">Emisión</td>
                    <td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:$MARINO;padding:4px 12px;">${esc(fecha)}</td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8B99AA;">
                  Seguimos vigilando tus vencimientos para que nunca pierdas un trámite.
                </p>
              </td></tr>
              <tr><td style="padding-top:20px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#9AA6B5;">
                Pilli Contable · un producto de ACDAN Consultores
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }

    private fun htmlAdmin(estado: String, positivo: Boolean, nombre: String, rfc: String, folio: String, fecha: String): String {
        val colorEstado = if (positivo) "#0F9D6A" else "#C0392B"
        return """
        <!doctype html>
        <html lang="es"><body style="margin:0;padding:0;background:#F5F6F8;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F6F8;padding:24px 12px;">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;">
              <tr><td style="padding-bottom:12px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;">Pilli · monitoreo automático</td></tr>
              <tr><td style="background:#ffffff;border:1px solid #E5E9EF;border-radius:12px;padding:24px;">
                <p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#5A6A7E;">Resultado del dictamen:</p>
                <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:$colorEstado;">$estado</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">RFC</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(rfc)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Contribuyente</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(nombre)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Folio</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(folio)}</td></tr>
                  <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8B99AA;padding:4px 0;">Emisión</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:$MARINO;padding:4px 0;">${esc(fecha)}</td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """.trimIndent()
    }
}
