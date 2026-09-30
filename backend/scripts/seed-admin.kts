// Semilla única del admin inicial — corre UNA vez en tu PC.
// Uso: koupper run backend/scripts/seed-admin.kts '{"email":"admin@acdan.mx","password":"PON_UNA_CLAVE_LARGA","nombre":"Admin"}'
// Se rehúsa si ACDAN_USERS ya tiene usuarios. Solo usa DI de Koupper + JDK.
import com.koupper.container.app
import com.koupper.octopus.createDefaultConfiguration
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.shared.annotations.Export
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

@Export
val seed: (Map<String, String>) -> Map<String, Any?> = { args ->
    createDefaultConfiguration()
    val dc = app.getInstance(DynamoClient::class)
    val tabla = env("ACDAN_USERS", required = false, default = "ACDAN_USERS")
    val email = (args["email"] ?: "").trim().lowercase()
    val password = args["password"] ?: ""
    val nombre = (args["nombre"] ?: "Admin").trim().ifBlank { "Admin" }

    fun err(codigo: String) = mapOf("statusCode" to 400, "body" to "{\"error\":\"$codigo\"}")

    if (!Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(email)) err("EMAIL_INVALIDO")
    else if (password.length < 8) err("PASSWORD_MIN_8")
    else if (runCatching { dc.scanItems(tabla) }.getOrDefault(emptyList()).isNotEmpty()) {
        mapOf("statusCode" to 409, "body" to "{\"error\":\"YA_EXISTE_ADMIN\"}")
    } else {
        val salt = UUID.randomUUID().toString()
        val hash = MessageDigest.getInstance("SHA-256")
            .digest((password + salt).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val item = mapOf(
            "pk" to email,
            "userId" to UUID.randomUUID().toString(),
            "email" to email,
            "nombre" to nombre,
            "passwordHash" to "$hash:$salt",
            "rol" to "ADMIN",
            "status" to "active",
            "createdAt" to Instant.now().toString(),
            "updatedAt" to Instant.now().toString()
        )
        dc.insertItem(tabla, item)
        println("[seed] admin creado: $email")
        mapOf("statusCode" to 200, "body" to "{\"ok\":true,\"email\":\"$email\"}")
    }
}
