package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.providers.jwt.JWT
import com.koupper.providers.jwt.JWTAgentEnum
import com.koupper.shared.annotations.Export
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class AuthLoginInput(val email: String = "", val password: String = "")
data class AuthTokenInput(val token: String = "")
data class AuthCreateInput(
    val token: String = "",
    val nombre: String = "",
    val email: String = "",
    val password: String = "",
    val rol: String = "OPERADOR"
)
data class AuthSeedInput(val email: String = "", val password: String = "", val nombre: String = "Admin")

internal object AuthStore {

    fun dynamo() = app.getInstance(DynamoClient::class)
    fun tabla() = env("ACDAN_USERS", required = false, default = "ACDAN_USERS")
    fun secretoJwt() = env("AUTH_JWT_SECRET", required = false, default = env("JWT_SECRET", required = false, default = "acdan-sat-super-secret-key"))
    fun expiracionSegundos() = env("AUTH_JWT_DIAS", required = false, default = "7").toLong() * 24 * 3600

    private fun jwtProvider(): JWT? = runCatching { app.getInstance(JWT::class) }.getOrNull()

    fun sha256(texto: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(texto.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    fun comparar(a: String, b: String): Boolean =
        MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))

    fun b64url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    fun b64url(texto: String): String = b64url(texto.toByteArray(Charsets.UTF_8))

    fun firmar(datos: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secretoJwt().toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return b64url(mac.doFinal(datos.toByteArray(Charsets.UTF_8)))
    }

    /**
     * Emite un token JWT firmado utilizando Koupper [JWT] Service Provider si está disponible,
     * con fallback seguro.
     */
    fun emitirJwt(userId: String, email: String, rol: String): String {
        val ahora = Instant.now().epochSecond
        val exp = ahora + expiracionSegundos()
        val jwt = jwtProvider()
        if (jwt != null) {
            val payload = mapOf(
                "sub" to userId,
                "email" to email,
                "rol" to rol,
                "iat" to ahora,
                "exp" to exp
            )
            val encoded = runCatching { jwt.encode(payload, JWTAgentEnum.HMAC256) }.getOrNull()
            if (encoded != null) return encoded
        }
        // Fallback nativo
        val header = b64url("""{"alg":"HS256","typ":"JWT"}""")
        val payload = b64url(
            """{"sub":"$userId","email":"$email","rol":"$rol","iat":$ahora,"exp":$exp}"""
        )
        return "$header.$payload.${firmar("$header.$payload")}"
    }

    /**
     * Emite un token JWT de portal de cliente: rol CLIENTE atado a un RFC.
     * Sirve únicamente para las rutas de portal y jamás para el dashboard interno.
     */
    fun emitirJwtPortal(rfc: String, nombre: String): String {
        val ahora = Instant.now().epochSecond
        val dias = env("PORTAL_JWT_DIAS", required = false, default = "30").toLong()
        val exp = ahora + dias * 24 * 3600
        val jwt = jwtProvider()
        if (jwt != null) {
            val payload = mapOf(
                "sub" to "portal:$rfc",
                "email" to "",
                "rol" to "CLIENTE",
                "rfc" to rfc,
                "iat" to ahora,
                "exp" to exp
            )
            val encoded = runCatching { jwt.encode(payload, JWTAgentEnum.HMAC256) }.getOrNull()
            if (encoded != null) return encoded
        }
        // Fallback nativo
        val header = b64url("""{"alg":"HS256","typ":"JWT"}""")
        val payload = b64url(
            """{"sub":"portal:$rfc","email":"","rol":"CLIENTE","rfc":"$rfc","iat":$ahora,"exp":$exp}"""
        )
        return "$header.$payload.${firmar("$header.$payload")}"
    }

    /**
     * Verifica la firma y expiración de un JWT utilizando Koupper [JWT] Service Provider.
     *
     * @return Map con claims `sub`, `email`, `rol` (y `rfc` en tokens de portal)
     * o `null` si el token es inválido o expiró.
     */
    fun verificarJwt(token: String): Map<String, String>? {
        val jwt = jwtProvider()
        if (jwt != null) {
            val kjwt = runCatching { jwt.decode(token, JWTAgentEnum.HMAC256) }.getOrNull()
            if (kjwt != null && !kjwt.isExpired()) {
                val sub = kjwt.claim<String>("sub") ?: kjwt.subject
                val email = kjwt.claim<String>("email")
                val rol = kjwt.claim<String>("rol")
                val rfc = kjwt.claim<String>("rfc")
                if (sub != null && rol != null) {
                    val m = mutableMapOf("sub" to sub, "email" to (email ?: ""), "rol" to rol)
                    if (rfc != null) m["rfc"] = rfc
                    return m
                }
            }
        }
        // Fallback nativo
        val partes = token.split(".")
        if (partes.size != 3) return null
        if (!comparar(firmar("${partes[0]}.${partes[1]}"), partes[2])) return null
        val payload = runCatching {
            String(Base64.getUrlDecoder().decode(partes[1]), Charsets.UTF_8)
        }.getOrNull() ?: return null
        fun campo(nombre: String): String? =
            Regex("\"$nombre\"\\s*:\\s*\"?([^\",}]+)\"?").find(payload)?.groupValues?.get(1)
        val exp = campo("exp")?.toLongOrNull() ?: return null
        if (Instant.now().epochSecond > exp) return null
        val sub = campo("sub") ?: return null
        val email = campo("email") ?: ""
        val rol = campo("rol") ?: return null
        val m = mutableMapOf("sub" to sub, "email" to email, "rol" to rol)
        campo("rfc")?.let { m["rfc"] = it }
        return m
    }

    fun emailValido(email: String) = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(email)


    fun publico(item: Map<String, Any?>): Map<String, Any?> = mapOf(
        "userId" to item["userId"],
        "email" to item["email"],
        "nombre" to item["nombre"],
        "rol" to item["rol"],
        "status" to item["status"]
    )

    fun jsonError(codigo: String) = "{\"error\":\"$codigo\"}"
}

private fun resp(status: Int, body: String) = mapOf("statusCode" to status, "body" to body)

private fun jsonValor(v: Any?): String = when (v) {
    null -> "null"
    is Number, is Boolean -> v.toString()
    else -> "\"" + v.toString().replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}

private fun jsonObj(mapa: Map<String, Any?>): String =
    mapa.entries.joinToString(",", "{", "}") { "\"${it.key}\":${jsonValor(it.value)}" }

@Export
val loginUser: (AuthLoginInput?) -> Map<String, Any?> = { input ->
    if (input == null || input.email.isBlank() || input.password.isBlank()) {
        resp(400, AuthStore.jsonError("CREDENCIALES_REQUERIDAS"))
    } else {
        val email = input.email.trim().lowercase()
        val item = runCatching {
            AuthStore.dynamo().getItem(AuthStore.tabla(), "pk", email)
        }.getOrNull()
        if (item == null) {
            resp(401, AuthStore.jsonError("CREDENCIALES_INVALIDAS"))
        } else if ((item["status"]?.toString() ?: "") != "active") {
            resp(403, AuthStore.jsonError("USUARIO_INACTIVO"))
        } else {
            val partes = (item["passwordHash"]?.toString() ?: "").split(":")
            if (partes.size != 2) {
                resp(500, AuthStore.jsonError("PASSWORD_CORRUPTO"))
            } else {
                val calculado = AuthStore.sha256(input.password + partes[1])
                if (!AuthStore.comparar(calculado, partes[0])) {
                    resp(401, AuthStore.jsonError("CREDENCIALES_INVALIDAS"))
                } else {
                    val rol = item["rol"]?.toString() ?: "OPERADOR"
                    val jwt = AuthStore.emitirJwt(
                        item["userId"]?.toString() ?: "",
                        item["email"]?.toString() ?: email,
                        rol
                    )
                    val user = AuthStore.publico(item)
                    resp(200, """{"ok":true,"jwt":"$jwt","user":${jsonObj(user)}}""")
                }
            }
        }
    }
}

@Export
val getUserInfo: (AuthTokenInput?) -> Map<String, Any?> = { input ->
    if (input == null || input.token.isBlank()) {
        resp(401, AuthStore.jsonError("TOKEN_REQUERIDO"))
    } else {
        val sesion = AuthStore.verificarJwt(input.token.trim())
        if (sesion == null) {
            resp(401, AuthStore.jsonError("TOKEN_INVALIDO"))
        } else {
            val item = runCatching {
                AuthStore.dynamo().getItem(AuthStore.tabla(), "pk", sesion.getValue("email"))
            }.getOrNull()
            if (item == null || (item["status"]?.toString() ?: "") != "active") {
                resp(401, AuthStore.jsonError("USUARIO_NO_DISPONIBLE"))
            } else {
                resp(200, """{"ok":true,"user":${jsonObj(AuthStore.publico(item))}}""")
            }
        }
    }
}

@Export
val createUser: (AuthCreateInput?) -> Map<String, Any?> = { input ->
    if (input == null || input.token.isBlank()) {
        resp(401, AuthStore.jsonError("TOKEN_REQUERIDO"))
    } else {
        val sesion = AuthStore.verificarJwt(input.token.trim())
        if (sesion == null) {
            resp(401, AuthStore.jsonError("TOKEN_INVALIDO"))
        } else if (sesion.getValue("rol") != "ADMIN") {
            // Solo el admin crea usuarios. El front lo oculta, pero la regla real vive aquí.
            resp(403, AuthStore.jsonError("SOLO_ADMIN"))
        } else if (input.nombre.trim().length < 2) {
            resp(400, AuthStore.jsonError("NOMBRE_REQUERIDO"))
        } else if (!AuthStore.emailValido(input.email.trim().lowercase())) {
            resp(400, AuthStore.jsonError("EMAIL_INVALIDO"))
        } else if (input.password.length < 8) {
            resp(400, AuthStore.jsonError("PASSWORD_MIN_8"))
        } else {
            val rol = input.rol.trim().uppercase().ifBlank { "OPERADOR" }
            if (rol != "ADMIN" && rol != "OPERADOR") {
                resp(400, AuthStore.jsonError("ROL_INVALIDO"))
            } else {
                val email = input.email.trim().lowercase()
                val existe = runCatching {
                    AuthStore.dynamo().getItem(AuthStore.tabla(), "pk", email)
                }.getOrNull()
                if (existe != null) {
                    resp(409, AuthStore.jsonError("EMAIL_YA_REGISTRADO"))
                } else if ((runCatching { AuthStore.dynamo().scanItems(AuthStore.tabla()).size }.getOrDefault(0)) >= (env("PLAN_MAX_USUARIOS", required = false, default = "3").toIntOrNull() ?: 3)) {
                    resp(409, AuthStore.jsonError("LIMITE_USUARIOS"))
                } else {
                    val salt = UUID.randomUUID().toString()
                    val item = mapOf(
                        "pk" to email,
                        "userId" to UUID.randomUUID().toString(),
                        "email" to email,
                        "nombre" to input.nombre.trim(),
                        "passwordHash" to "${AuthStore.sha256(input.password + salt)}:$salt",
                        "rol" to rol,
                        "status" to "active",
                        "createdAt" to Instant.now().toString(),
                        "updatedAt" to Instant.now().toString()
                    )
                    val guardado = runCatching { AuthStore.dynamo().insertItem(AuthStore.tabla(), item) }
                    if (guardado.isFailure) {
                        resp(500, AuthStore.jsonError("ERROR_GUARDANDO"))
                    } else {
                        resp(200, """{"ok":true,"user":${jsonObj(AuthStore.publico(item))}}""")
                    }
                }
            }
        }
    }
}

@Export
val listUsers: (AuthTokenInput?) -> Map<String, Any?> = { input ->
    if (input == null || input.token.isBlank()) {
        resp(401, AuthStore.jsonError("TOKEN_REQUERIDO"))
    } else {
        val sesion = AuthStore.verificarJwt(input.token.trim())
        if (sesion == null) {
            resp(401, AuthStore.jsonError("TOKEN_INVALIDO"))
        } else if (sesion.getValue("rol") != "ADMIN") {
            resp(403, AuthStore.jsonError("SOLO_ADMIN"))
        } else {
            val items = runCatching { AuthStore.dynamo().scanItems(AuthStore.tabla()) }
                .getOrDefault(emptyList())
            val arr = items.map { AuthStore.publico(it) }
                .joinToString(",", "[", "]") { jsonObj(it) }
            resp(200, arr)
        }
    }
}

// Semilla única del primer admin. Se rehúsa si la tabla ya tiene usuarios:
// no es una ruta web, solo corre con `koupper run` o desde AuthController.seed.
@Export
val seedAdmin: (AuthSeedInput?) -> Map<String, Any?> = { input ->
    if (input == null || input.email.isBlank() || input.password.isBlank()) {
        resp(400, AuthStore.jsonError("EMAIL_PASSWORD_REQUERIDOS"))
    } else if (!AuthStore.emailValido(input.email.trim().lowercase())) {
        resp(400, AuthStore.jsonError("EMAIL_INVALIDO"))
    } else if (input.password.length < 8) {
        resp(400, AuthStore.jsonError("PASSWORD_MIN_8"))
    } else {
        val existentes = runCatching { AuthStore.dynamo().scanItems(AuthStore.tabla()) }
            .getOrDefault(emptyList())
        if (existentes.isNotEmpty()) {
            resp(409, AuthStore.jsonError("YA_EXISTE_ADMIN"))
        } else {
            val email = input.email.trim().lowercase()
            val salt = UUID.randomUUID().toString()
            val item = mapOf(
                "pk" to email,
                "userId" to UUID.randomUUID().toString(),
                "email" to email,
                "nombre" to input.nombre.trim().ifBlank { "Admin" },
                "passwordHash" to "${AuthStore.sha256(input.password + salt)}:$salt",
                "rol" to "ADMIN",
                "status" to "active",
                "createdAt" to Instant.now().toString(),
                "updatedAt" to Instant.now().toString()
            )
            val guardado = runCatching { AuthStore.dynamo().insertItem(AuthStore.tabla(), item) }
            if (guardado.isFailure) {
                resp(500, AuthStore.jsonError("ERROR_GUARDANDO"))
            } else {
                resp(200, """{"ok":true,"user":${jsonObj(AuthStore.publico(item))}}""")
            }
        }
    }
}
