package com.acdan.sat.scripts

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.koupper.octopus.createDefaultConfiguration
import org.junit.jupiter.api.Tag
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Prueba opt-in contra la API local y los datos de la corrida real, sin crear clientes ni cambiar claves. */
@Tag("integration")
class CfdiIntegrationTest {
    @Test fun `registros persistidos se consultan y los archivos originales se sirven con sesion`() {
        createDefaultConfiguration()
        val mapper = jacksonObjectMapper()
        val rfc = requireNotNull(System.getenv("CFDI_TEST_RFC"))
        val periodo = requireNotNull(System.getenv("CFDI_TEST_PERIODO"))
        val staff = AuthStore.dynamo().scanItems(AuthStore.tabla()).first { it["rol"]?.toString() in setOf("ADMIN", "OPERADOR") && it["status"]?.toString() == "active" }
        val token = AuthStore.emitirJwt(staff["userId"].toString(), staff["email"].toString(), staff["rol"].toString())
        val http = HttpClient.newHttpClient()
        fun post(path: String, body: Map<String, String>): HttpResponse<String> = http.send(
            HttpRequest.newBuilder(URI("http://localhost:8090/api/v1$path")).timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(),
            HttpResponse.BodyHandlers.ofString())
        assertEquals(401, post("/cfdi/listar", mapOf("rfc" to rfc, "periodo" to periodo)).statusCode())
        val response = post("/cfdi/listar", mapOf("token" to token, "rfc" to rfc, "periodo" to periodo))
        assertEquals(200, response.statusCode())
        val result = mapper.readTree(response.body())
        val rows = result.path("items")
        assertEquals(System.getenv("CFDI_TEST_EMITIDAS").toInt(), rows.count { it.path("vista").asText() == "emitidas" })
        assertEquals(System.getenv("CFDI_TEST_RECIBIDAS").toInt(), rows.count { it.path("vista").asText() == "recibidas" })
        assertEquals(rows.size(), rows.map { it.path("docId").asText() }.distinct().size)
        for (vista in listOf("emitidas", "recibidas")) {
            val row = rows.first { it.path("vista").asText() == vista && it.path("xmlGuardado").asText() == "true" && it.path("pdfGuardado").asText() == "true" }
            for (formato in listOf("xml", "pdf")) {
                val file = post("/cfdi/archivo", mapOf("token" to token, "rfc" to rfc, "docId" to row.path("docId").asText(), "formato" to formato))
                assertEquals(200, file.statusCode())
                val bytes = Base64.getDecoder().decode(mapper.readTree(file.body()).path("base64").asText())
                CfdiStore.validar(bytes, formato, CfdiPendiente(row.path("docId").asText(), rfc, java.time.YearMonth.parse(periodo), vista, row.path("folio").asText(), emptyMap()))
                assertTrue(bytes.isNotEmpty())
            }
        }
        val portal = AuthStore.emitirJwtPortal("AAA010101AAA", "Prueba de aislamiento")
        assertEquals(401, post("/cfdi/listar", mapOf("token" to portal, "rfc" to rfc, "periodo" to periodo)).statusCode())
        assertEquals(401, post("/cfdi/sincronizar", mapOf("token" to portal, "rfc" to rfc, "periodo" to periodo)).statusCode())
        println("API CFDI: ${rows.size()} registros únicos, PDF/XML de ambas vistas válidos y aislamiento de RFC verificado")
    }
}
