package com.acdan.sat.scripts

import com.koupper.os.env
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ssm.SsmClient
import software.amazon.awssdk.services.ssm.model.DeleteParameterRequest
import software.amazon.awssdk.services.ssm.model.GetParameterRequest
import software.amazon.awssdk.services.ssm.model.ParameterNotFoundException
import software.amazon.awssdk.services.ssm.model.ParameterType
import software.amazon.awssdk.services.ssm.model.PutParameterRequest

/**
 * Almacén persistente de contraseñas/CIEC del SAT.
 *
 * En AWS se usa SSM Parameter Store con tipo SecureString. A diferencia del
 * archivo local de Koupper, el parámetro persiste entre invocaciones de Lambda
 * y tareas ECS, que son contenedores distintos y no comparten disco.
 *
 * El nombre nunca contiene `:` porque AWS no lo permite en este servicio.
 * Formato: `/pilli/sat/{RFC}`. El valor se cifra con la llave administrada
 * `alias/aws/ssm`; nunca se guarda en DynamoDB ni en el código.
 */
object CredentialStore {
    private const val PREFIX = "/pilli/sat"

    private val client: SsmClient by lazy {
        val region = env(
            "AWS_REGION",
            required = false,
            default = env("DYNAMO_REGION", required = false, default = "us-east-2")
        )
        SsmClient.builder().region(Region.of(region)).build()
    }

    private fun parameterName(rfc: String): String {
        val key = rfc.trim().uppercase()
        require(key.isNotBlank()) { "RFC requerido para la credencial" }
        return "$PREFIX/$key"
    }

    /** Devuelve la CIEC o `null` si el RFC todavía no tiene credencial. */
    fun get(rfc: String): String? {
        val request = GetParameterRequest.builder()
            .name(parameterName(rfc))
            .withDecryption(true)
            .build()
        return try {
            client.getParameter(request).parameter().value()
        } catch (_: ParameterNotFoundException) {
            null
        }
    }

    /** Crea o rota la credencial del RFC. */
    fun put(rfc: String, ciec: String) {
        client.putParameter(
            PutParameterRequest.builder()
                .name(parameterName(rfc))
                .value(ciec)
                .type(ParameterType.SECURE_STRING)
                .overwrite(true)
                .build()
        )
    }

    /** Borra la credencial; devuelve `false` si no existía. */
    fun delete(rfc: String): Boolean {
        return try {
            client.deleteParameter(
                DeleteParameterRequest.builder()
                    .name(parameterName(rfc))
                    .build()
            )
            true
        } catch (_: ParameterNotFoundException) {
            false
        }
    }
}
