package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

object ResetAdmin {
    fun reset(password: String): String {
        val dc = app.getInstance(DynamoClient::class)
        val tabla = env("ACDAN_USERS", required = false, default = "ACDAN_USERS")
        val email = "admin@acdan.mx"
        val salt = UUID.randomUUID().toString()
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest((password + salt).toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        val passwordHash = "$hash:$salt"
        val item = mapOf(
            "pk" to email,
            "userId" to UUID.randomUUID().toString(),
            "email" to email,
            "nombre" to "Administrador",
            "passwordHash" to passwordHash,
            "rol" to "ADMIN",
            "status" to "active",
            "createdAt" to Instant.now().toString(),
            "updatedAt" to Instant.now().toString()
        )
        dc.insertItem(tabla, item)
        return "SUCCESS: admin@acdan.mx -> password: $password"
    }
}
