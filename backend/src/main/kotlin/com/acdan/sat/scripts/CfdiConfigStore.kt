package com.acdan.sat.scripts

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.koupper.os.env
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ssm.SsmClient
import software.amazon.awssdk.services.ssm.model.GetParameterRequest
import software.amazon.awssdk.services.ssm.model.ParameterType
import software.amazon.awssdk.services.ssm.model.PutParameterRequest

/**
 * Configuración de la corrida mensual de CFDI.
 *
 * Se guarda en SSM Parameter Store (String, sin cifrar: no son secretos) para
 * que la API la edite y el worker la lea sin cambios de infraestructura.
 *
 * - `dia`: a partir de qué día del mes se permite la corrida automática. La
 *   contadora lo pide en 4 o 5 porque del 1 al 3 el SAT sigue recibiendo
 *   declaraciones y esos días hay más carga.
 * - `reintentos`: cuántas veces el scheduler reintenta un mes que falló antes
 *   de darse por vencido. El reintento manual no cuenta contra este límite.
 */
object CfdiConfigStore {
    private const val PARAM = "/acdan/config/cfdi"

    data class Config(val dia: Int = 4, val reintentos: Int = 3)

    private val mapper = jacksonObjectMapper()

    private val client: SsmClient by lazy {
        val region = env(
            "AWS_REGION",
            required = false,
            default = env("DYNAMO_REGION", required = false, default = "us-east-2")
        )
        SsmClient.builder().region(Region.of(region)).build()
    }

    fun leer(): Config = runCatching {
        val respuesta = client.getParameter(GetParameterRequest.builder().name(PARAM).build())
        val nodo = mapper.readTree(respuesta.parameter().value())
        Config(
            dia = nodo.path("dia").asInt(4).coerceIn(1, 28),
            reintentos = nodo.path("reintentos").asInt(3).coerceIn(0, 5)
        )
    }.getOrDefault(Config())

    fun guardar(dia: Int, reintentos: Int): Config {
        val d = dia.coerceIn(1, 28)
        val r = reintentos.coerceIn(0, 5)
        client.putParameter(
            PutParameterRequest.builder()
                .name(PARAM)
                .value("""{"dia":$d,"reintentos":$r}""")
                .type(ParameterType.STRING)
                .overwrite(true)
                .build()
        )
        return Config(d, r)
    }
}
