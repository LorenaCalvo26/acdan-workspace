package com.acdan.sat.controllers

import com.acdan.sat.schemas.PortalEntrarRequest
import com.acdan.sat.schemas.PortalGenerarRequest
import com.acdan.sat.schemas.PortalPdfRequest
import com.acdan.sat.schemas.PortalTokenRequest
import com.acdan.sat.scripts.AuthStore
import com.acdan.sat.scripts.DocStore
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.UUID

/**
 * Portal del cliente: landing por RFC protegida con código de acceso.
 * La URL (`/c/:rfc`) sola no abre nada: sin código válido no hay sesión,
 * y la sesión (JWT rol CLIENTE atado al RFC) solo sirve para rutas de portal.
 */
object PortalController {

    private fun dynamo() = app.getInstance(DynamoClient::class)
    private fun clientesTable() = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
    private fun docsTable() = env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")

    /** Sin I, L, O, 0 ni 1 para dictarlo sin confusiones. */
    private const val ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    private const val MAX_INTENTOS = 8
    private const val VENTANA_SEG = 600L

    /** Intentos fallidos por RFC: rfc -> (conteo, inicioVentanaEpoch). */
    private val intentos = mutableMapOf<String, Pair<Int, Long>>()

    private fun staffAutenticado(token: String): Boolean {
        val s = runCatching { AuthStore.verificarJwt(token) }.getOrNull() ?: return false
        return s["rol"] == "ADMIN" || s["rol"] == "OPERADOR"
    }

    /** Valida un JWT de cliente y devuelve su RFC, o `null` si no sirve. */
    internal fun rfcDeSesion(token: String): String? {
        val s = runCatching { AuthStore.verificarJwt(token) }.getOrNull() ?: return null
        if (s["rol"] != "CLIENTE") return null
        val rfc = s["rfc"]?.uppercase().orEmpty()
        if (rfc.isBlank()) return null
        // El cliente debe seguir existiendo y con el portal activo.
        val item = runCatching { dynamo().getItem(clientesTable(), "pk", rfc) }.getOrNull() ?: return null
        if (item["portalActivo"]?.toString() != "true") return null
        return rfc
    }

    private fun normalizarCodigo(codigo: String) =
        codigo.uppercase().filter { it.isLetterOrDigit() }

    private fun generarCodigo(): String {
        val rnd = SecureRandom()
        val crudo = (1..8).map { ALFABETO[rnd.nextInt(ALFABETO.length)] }.joinToString("")
        return "${crudo.substring(0, 4)}-${crudo.substring(4)}"
    }

    private fun bloqueado(rfc: String): Boolean {
        synchronized(intentos) {
            val (n, inicio) = intentos[rfc] ?: return false
            if (Instant.now().epochSecond - inicio > VENTANA_SEG) {
                intentos.remove(rfc)
                return false
            }
            return n >= MAX_INTENTOS
        }
    }

    private fun registrarFallo(rfc: String) {
        synchronized(intentos) {
            val ahora = Instant.now().epochSecond
            val (n, inicio) = intentos[rfc] ?: (0 to ahora)
            intentos[rfc] = if (ahora - inicio > VENTANA_SEG) 1 to ahora else (n + 1) to inicio
        }
    }

    private fun limpiarIntentos(rfc: String) {
        synchronized(intentos) { intentos.remove(rfc) }
    }

    /**
     * Genera (o regenera) el código de acceso de un cliente.
     * Solo personal interno. El código se muestra una sola vez al generarlo.
     */
    fun generar(req: PortalGenerarRequest): ControllerResponse {
        if (!staffAutenticado(req.token)) return ControllerResponse(401, """{"error":"TOKEN_INVALIDO"}""")
        val codigo = generarPara(req.rfc.trim().uppercase())
            ?: return ControllerResponse(404, """{"error":"CLIENTE_NO_ENCONTRADO"}""")
        return ControllerResponse(200, """{"ok":true,"rfc":"${req.rfc.trim().uppercase()}","codigo":"$codigo"}""")
    }

    /** Genera el código sin pedir token (uso interno: alta automática). */
    internal fun generarPara(rfc: String): String? {
        val key = rfc.trim().uppercase()
        if (key.isBlank()) return null
        val item = runCatching { dynamo().getItem(clientesTable(), "pk", key) }.getOrNull()
            ?: return null

        val codigo = generarCodigo()
        val salt = UUID.randomUUID().toString()
        val merged = item.toMutableMap()
        merged["portalCodigoHash"] = AuthStore.sha256(normalizarCodigo(codigo) + salt)
        merged["portalSalt"] = salt
        merged["portalActivo"] = "true"
        merged["portalUltimoAcceso"] = ""
        runCatching { dynamo().insertItem(clientesTable(), merged.mapValues { it.value.toString() }) }
            .getOrElse { return null }
        limpiarIntentos(key)
        // Bienvenida con acceso por email (no bloquea; solo si hay correo válido).
        runCatching {
            com.acdan.sat.scripts.EmailNotifier.notificarBienvenida(
                emailCliente = item["email"]?.toString().orEmpty(),
                nombreCliente = item["nombre"]?.toString().orEmpty(),
                rfc = key, codigo = codigo,
                ligaPortal = com.acdan.sat.scripts.EmailNotifier.ligaPortal(key)
            )
        }
        return codigo
    }

    /** Revoca el acceso del cliente sin borrar sus datos. */
    fun revocar(req: PortalGenerarRequest): ControllerResponse {
        if (!staffAutenticado(req.token)) return ControllerResponse(401, """{"error":"TOKEN_INVALIDO"}""")
        val key = req.rfc.trim().uppercase()
        if (key.isBlank()) return ControllerResponse(400, """{"error":"RFC_REQUIRED"}""")
        val item = runCatching { dynamo().getItem(clientesTable(), "pk", key) }.getOrNull()
            ?: return ControllerResponse(404, """{"error":"CLIENTE_NO_ENCONTRADO"}""")
        val merged = item.toMutableMap()
        merged["portalActivo"] = "false"
        runCatching { dynamo().insertItem(clientesTable(), merged.mapValues { it.value.toString() }) }
        limpiarIntentos(key)
        return ControllerResponse(200, """{"ok":true,"rfc":"$key"}""")
    }

    /** Canjea RFC + código por una sesión de cliente (JWT 30 días). */
    fun entrar(req: PortalEntrarRequest): ControllerResponse {
        val key = req.rfc.trim().uppercase()
        val codigo = normalizarCodigo(req.codigo)
        if (key.isBlank() || codigo.isBlank()) return ControllerResponse(400, """{"error":"DATOS_INCOMPLETOS"}""")
        if (bloqueado(key)) return ControllerResponse(429, """{"error":"BLOQUEADO_TEMPORAL"}""")

        val item = runCatching { dynamo().getItem(clientesTable(), "pk", key) }.getOrNull()
        val hash = item?.get("portalCodigoHash")?.toString().orEmpty()
        val salt = item?.get("portalSalt")?.toString().orEmpty()
        val activo = item?.get("portalActivo")?.toString() == "true"
        // Mensaje genérico: no revelar si el RFC existe ni si tiene portal.
        if (!activo || hash.isBlank() || salt.isBlank() ||
            !AuthStore.comparar(AuthStore.sha256(codigo + salt), hash)
        ) {
            registrarFallo(key)
            return ControllerResponse(401, """{"error":"CODIGO_INVALIDO"}""")
        }
        limpiarIntentos(key)
        val merged = item!!.toMutableMap()
        merged["portalUltimoAcceso"] = Instant.now().toString()
        runCatching { dynamo().insertItem(clientesTable(), merged.mapValues { it.value.toString() }) }

        val nombre = item["nombre"]?.toString().orEmpty()
        val jwt = AuthStore.emitirJwtPortal(key, nombre)
        return ControllerResponse(200, """{"ok":true,"jwt":"$jwt","rfc":"$key","nombre":"$nombre"}""")
    }

    /** Valida una sesión de cliente guardada (para abrir directo al resumen). */
    fun sesion(req: PortalTokenRequest): ControllerResponse {
        val rfc = rfcDeSesion(req.token) ?: return ControllerResponse(401, """{"error":"SESION_VENCIDA"}""")
        val item = runCatching { dynamo().getItem(clientesTable(), "pk", rfc) }.getOrNull()
        val nombre = item?.get("nombre")?.toString().orEmpty()
        return ControllerResponse(200, """{"ok":true,"rfc":"$rfc","nombre":"$nombre"}""")
    }

    /** Resumen del cliente dueño de la sesión. Jamás acepta RFC por parámetro. */
    fun resumen(req: PortalTokenRequest): ControllerResponse {
        val rfc = rfcDeSesion(req.token) ?: return ControllerResponse(401, """{"error":"SESION_VENCIDA"}""")
        return DashboardController.resumenPorRfc(rfc)
    }

    /** Documentos del cliente dueño de la sesión. */
    fun docs(req: PortalTokenRequest): ControllerResponse {
        val rfc = rfcDeSesion(req.token) ?: return ControllerResponse(401, """{"error":"SESION_VENCIDA"}""")
        return SatController.docsPorRfc(rfc)
    }

    /**
     * Sirve el PDF de un documento del cliente dueño de la sesión (base64).
     * El portal nunca usa las URLs directas de `/pdfs`, que no llevan auth.
     */
    fun pdf(req: PortalPdfRequest): ControllerResponse {
        val rfc = rfcDeSesion(req.token) ?: return ControllerResponse(401, """{"error":"SESION_VENCIDA"}""")
        if (req.docId.isBlank()) return ControllerResponse(400, """{"error":"DOC_REQUIRED"}""")
        val docs = runCatching { dynamo().scanItems(docsTable()) }.getOrDefault(emptyList())
        val doc = docs.firstOrNull {
            it["docId"]?.toString() == req.docId && it["rfc"]?.toString()?.uppercase() == rfc
        } ?: return ControllerResponse(404, """{"error":"PDF_NO_ENCONTRADO"}""")

        val bytes = DocStore.leerPdf(rfc, req.docId)
            ?: return ControllerResponse(404, """{"error":"PDF_NO_ENCONTRADO"}""")
        val b64 = runCatching { Base64.getEncoder().encodeToString(bytes) }.getOrNull()
            ?: return ControllerResponse(500, """{"error":"NO_SE_PUDO_LEER"}""")
        val tipo = doc["tipo"]?.toString().orEmpty()
        return ControllerResponse(200, """{"ok":true,"docId":"${req.docId}","tipo":"$tipo","pdfBase64":"$b64"}""")
    }
}
