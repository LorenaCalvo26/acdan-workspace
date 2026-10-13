import com.koupper.container.app
import com.koupper.octopus.createDefaultConfiguration
import com.koupper.os.env
import com.koupper.providers.aws.dynamo.DynamoClient
import com.koupper.shared.annotations.Export

@Export
val run: (Map<String, String>) -> Map<String, Any?> = { _ ->
    createDefaultConfiguration()
    val dc = app.getInstance(DynamoClient::class)
    fun n(t: String) = runCatching { dc.scanItems(t).size }.getOrElse { -1 }
    mapOf(
        "ACDAN_USERS" to n(env("ACDAN_USERS", required = false, default = "ACDAN_USERS")),
        "ACDAN_CLIENTES" to n(env("ACDAN_CLIENTES", required = false, default = "ACDAN_CLIENTES")),
        "ACDAN_DOCS" to n(env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")),
        "ACDAN_JOBS" to n(env("ACDAN_JOBS", required = false, default = "ACDAN_JOBS"))
    )
}
