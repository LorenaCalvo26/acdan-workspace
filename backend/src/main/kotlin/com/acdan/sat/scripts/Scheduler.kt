package com.acdan.sat.scripts

import com.acdan.sat.controllers.ControllerResponse
import com.acdan.sat.schemas.SatSolicitarRequest
import com.acdan.sat.controllers.SatController
import com.koupper.container.app
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.shared.annotations.Export
import java.time.Instant

// Corre cada hora (jobs.json driver file + @Scheduled) y encola los vencidos.
// Frecuencia por defecto: 32-D cada 25 días (vigencia 30d), constancia cada 90 días.
// El contador la cambia por cliente desde el dash (PUT /clientes/{rfc}/frecuencia).
@Export
val schedulerTick: (Map<String, String>) -> ControllerResponse = {
    val dynamo = app.getInstance(DynamoClient::class)
    val table = env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")
    val all = dynamo.scanItems(table)
    var encolados = 0
    val now = Instant.now()
    all.forEach { item ->
        val activo = item["activo"] != "false"
        val proximo = runCatching { Instant.parse(item["proximoRun"].toString()) }.getOrNull()
        if (activo && (proximo == null || !proximo.isAfter(now))) {
            val rfc = item["rfc"].toString()
            val tipos = item["tipos"]?.toString()?.split(",")?.filter { it.isNotBlank() } ?: listOf("constancia", "32d")
            SatController.solicitar(SatSolicitarRequest(rfc, tipos))
            encolados++
        }
    }
    ControllerResponse(200, """{"ok":true,"encolados":$encolados}""")
}
