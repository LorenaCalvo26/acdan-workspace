// Inspector local SAT — corre TÚ en tu PC, no comparte tu CIEC.
// Uso: $env:SAT_RFC="XXX"; $env:SAT_CIEC="***"; koupper run backend/inspect-sat.kts
// Solo imprime: URL post-login, iframes, PDF URLs, selectores. Redacta el password antes de pegar el log.
import com.koupper.container.app
import com.koupper.octopus.createDefaultConfiguration
import com.koupper.providers.browser.InteractiveBrowserProvider
import com.koupper.shared.annotations.Export

@Export
val inspect: (Map<String, String>) -> Map<String, Any?> = { _ ->
    createDefaultConfiguration()
    val browser = app.getInstance(InteractiveBrowserProvider::class)
    val session = browser.newSession(headless = false) // visible para que veas el captcha + iframe
    val loginUrl = System.getenv("SAT_LOGIN_URL")
        ?: "https://loginda.siat.sat.gob.mx/nidp/app/login?id=ciec&sid=0&option=credential&sid=0"
    println("[inspect] navegando $loginUrl")
    session.navigate(loginUrl)
    // NO llenamos nada automático aquí: llena RFC/CIEC/captcha TÚ a mano en la ventana.
    println("[inspect] Llena el form a mano. Esperando 90s a que aparezca un iframe PDF...")
    var found: List<Map<String, String>> = emptyList()
    repeat(90) {
        Thread.sleep(1000)
        val iframes = session.extractElements("iframe")
        val embeds = session.extractElements("embed")
        val all = (iframes + embeds).map {
            mapOf("text" to it.text.take(120), "src" to (it.src ?: ""), "href" to (it.href ?: ""))
        }.filter { it["src"]!!.isNotBlank() }
        if (all.isNotEmpty()) { found = all; return@repeat }
    }
    println("[inspect] url final=" + session.currentUrl())
    println("[inspect] iframes/embed encontrados=" + found.size)
    found.forEach { println("[inspect] src=" + it["src"]) }
    mapOf("url" to session.currentUrl(), "frames" to found)
}
