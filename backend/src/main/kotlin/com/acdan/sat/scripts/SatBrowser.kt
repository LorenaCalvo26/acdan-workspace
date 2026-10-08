package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.providers.browser.InteractiveBrowserProvider
import com.microsoft.playwright.Browser
import com.microsoft.playwright.BrowserType
import com.microsoft.playwright.Page
import com.microsoft.playwright.Playwright
import com.microsoft.playwright.options.LoadState
import java.util.Base64

private val SAT_STEALTH = """
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-MX', 'es', 'en-US', 'en'] });
""".trimIndent()

private const val SAT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

/**
 * Cliente de automatización de navegador de alta fidelidad para el portal del SAT.
 * Integra las capacidades de evasión y navegación sigilosa de Koupper [InteractiveBrowserProvider]
 * con mecanismos especializados de decodificación de Captcha en formato Data URI y extracción de bytes PDF.
 *
 * @param headless `true` para ejecutar el navegador sin interfaz gráfica en servidores produccion.
 */
class SatBrowser(headless: Boolean) : AutoCloseable {
    private val browserProvider: InteractiveBrowserProvider? = runCatching {
        app.getInstance(InteractiveBrowserProvider::class)
    }.getOrNull()
    private val pw: Playwright = Playwright.create()
    private val page: Page
    private val browser: Browser

    init {
        browser = pw.chromium().launch(
            BrowserType.LaunchOptions()
                .setHeadless(headless)
                .setArgs(listOf("--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"))
        )
        val ctx = browser.newContext(
            Browser.NewContextOptions()
                .setViewportSize(1366, 768)
                .setUserAgent(SAT_UA)
                .setAcceptDownloads(true)
        )
        ctx.addInitScript(SAT_STEALTH)
        page = ctx.newPage()
    }

    /**
     * Navega a la URL especificada esperando la carga del DOM.
     *
     * @param url Dirección web de destino.
     * @return `true` si la navegación concluyó exitosamente.
     */
    fun navigate(url: String): Boolean = runCatching {
        page.navigate(url, Page.NavigateOptions().setTimeout(30_000.0))
        page.waitForLoadState(LoadState.DOMCONTENTLOADED)
        true
    }.getOrDefault(false)

    /**
     * Espera a que aparezca un elemento coincidente con el selector en la página.
     *
     * @param selector Selector CSS.
     * @param timeoutMs Tiempo máximo de espera en milisegundos.
     */
    fun waitFor(selector: String, timeoutMs: Double = 15_000.0): Boolean = runCatching {
        page.waitForSelector(selector, Page.WaitForSelectorOptions().setTimeout(timeoutMs))
        true
    }.getOrDefault(false)

    /**
     * Rellena un campo de entrada de texto.
     */
    fun fill(selector: String, value: String): Boolean = runCatching {
        val el = page.locator(selector).first()
        el.fill(value, com.microsoft.playwright.Locator.FillOptions().setTimeout(10_000.0))
        true
    }.getOrDefault(false)

    /**
     * Escribe la secuencia del Captcha utilizando eventos de teclado reales con retardo humano aleatorio.
     * Evita ser detectado o ignorado por formularios JS heredados del SAT.
     */
    fun typeCaptcha(selector: String, value: String): Boolean = runCatching {
        val el = page.locator(selector).first()
        el.click()
        el.fill("")
        el.pressSequentially(value, com.microsoft.playwright.Locator.PressSequentiallyOptions().setDelay(80.0))
        true
    }.getOrDefault(false)

    /**
     * Lee el valor actual escrito en un input.
     */
    fun readValue(selector: String): String = runCatching {
        page.locator(selector).first().inputValue()
    }.getOrDefault("")

    /**
     * Genera una captura de pantalla en bytes PNG del elemento especificado.
     */
    fun screenshotCaptcha(selector: String): ByteArray? = runCatching {
        page.querySelectorAll(selector).firstOrNull()?.screenshot()
    }.getOrNull()

    /**
     * Extrae y decodifica la imagen Base64 del captcha emitido en data-uri por el SAT.
     *
     * @return Array de bytes de la imagen del captcha o `null` si no fue localizado.
     */
    fun captchaDataUriBytes(): ByteArray? {
        val src = runCatching {
            page.evaluate("document.querySelector(\"img[src^='data:image']\")?.src || ''")?.toString()
        }.getOrNull() ?: ""
        if (!src.contains("base64,")) return null
        return runCatching { Base64.getDecoder().decode(src.substringAfter("base64,")) }.getOrNull()
    }

    /**
     * Verifica la existencia de un elemento selector en el DOM actual.
     */
    fun exists(selector: String): Boolean = runCatching {
        page.querySelectorAll(selector).isNotEmpty()
    }.getOrDefault(false)

    /**
     * Genera una captura de pantalla completa del estado actual de la página.
     */
    fun screenshot(): ByteArray? = runCatching {
        page.screenshot(Page.ScreenshotOptions().setTimeout(8_000.0))
    }.getOrNull()

    /**
     * Realiza un clic humano simulado sobre el elemento (hover -> micro-pausa -> click).
     */
    fun click(selector: String): Boolean = runCatching {
        val el = page.locator(selector).first()
        el.hover()
        Thread.sleep(300)
        el.click()
        Thread.sleep(1000)
        true
    }.getOrDefault(false)

    /**
     * Retorna la URL actual del contexto de navegación.
     */
    fun currentUrl(): String = runCatching { page.url() }.getOrDefault("")

    /**
     * Evalúa una expresión de JavaScript arbitraria en la ventana del navegador.
     */
    fun eval(script: String): String = runCatching {
        page.evaluate(script)?.toString() ?: ""
    }.getOrDefault("")

    /**
     * Hace clic en el primer botón/enlace visible cuyo texto contenga alguno de los
     * textos dados (insensible a mayúsculas). Para apps del SAT sin selectores estables.
     *
     * @return `true` si encontró y clickeó un candidato.
     */
    fun clickTexto(vararg textos: String): Boolean = runCatching {
        val lista = textos.joinToString(",") { "\"$it\"" }
        val r = page.evaluate(
            """(function(){
              const buscan = [$lista].map(s=>s.toLowerCase());
              const els = Array.from(document.querySelectorAll('button,a,input[type=button],input[type=submit],[role=button]'));
              for (const el of els) {
                const t = ((el.innerText||el.value||el.getAttribute('value')||'')+'').toLowerCase();
                const vis = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                if (!vis) continue;
                if (buscan.some(s=>t.indexOf(s)>=0)) {
                  el.scrollIntoView({block:'center'});
                  el.click();
                  return 'CLICK:'+t.substring(0,60);
                }
              }
              return 'NADA';
            })()"""
        )?.toString() ?: "NADA"
        println("[browser] clickTexto -> $r")
        r.startsWith("CLICK:")
    }.getOrDefault(false)

    /**
     * Vuelca inputs de texto y botones submit con id/nombre (para forms WebForms).
     */
    fun dumpInputs(): String = runCatching {
        page.evaluate(
            """Array.from(document.querySelectorAll('input')).map(i=>{
              const t = i.type||'text';
              return t+'|'+(i.id||i.name||'(sin id)');
            }).join('\n---\n')"""
        )?.toString()?.take(2000) ?: ""
    }.getOrDefault("DUMP_INPUTS_FAIL")

    /**
     * Vuelca todos los selects con sus opciones (para forms WebForms con dropdowns).
     */
    fun dumpSelects(): String = runCatching {
        page.evaluate(
            """Array.from(document.querySelectorAll('select')).map(s=>{
              const id = s.id||s.name||'(sin id)';
              const opts = Array.from(s.options).slice(0,65).map(o=>(o.value+'='+o.text.trim().substring(0,18))).join(',');
              return id+'['+opts+']';
            }).join('\n---\n')"""
        )?.toString()?.take(4000) ?: ""
    }.getOrDefault("DUMP_SELECTS_FAIL")
    fun dumpFrames(): String = runCatching {
        page.frames().map { f ->
            runCatching {
                val url = f.url()
                val txt = f.evaluate("document.body ? (document.body.innerText||'').replace(/\\s+/g,' ').trim().substring(0,500) : ''")?.toString() ?: ""
                val btns = f.evaluate("Array.from(document.querySelectorAll('button,a,input[type=button],input[type=submit],[role=button]')).map(b=>((b.innerText||b.value||'').trim().substring(0,30))).filter(Boolean).slice(0,20)")?.toString() ?: ""
                "FRAME url=" + url.take(160) + " || text=" + txt.take(500) + " || buttons=" + btns.take(600)
            }.getOrDefault("FRAME err")
        }.joinToString("\n---\n").take(3000)
    }.getOrDefault("DUMP_FRAMES_FAIL")

    /**
     * Como [clickTexto] pero buscando en todos los frames (principal + iframes).
     */
    fun clickTextoEnFrames(vararg textos: String): Boolean = runCatching {
        val lista = textos.joinToString(",") { "\"$it\"" }
        val js = """(function(){
          const buscan = [$lista].map(s=>s.toLowerCase());
          const els = Array.from(document.querySelectorAll('button,a,input[type=button],input[type=submit],[role=button]'));
          for (const el of els) {
            const t = ((el.innerText||el.value||el.getAttribute('value')||'')+'').toLowerCase();
            const vis = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            if (!vis) continue;
            if (buscan.some(s=>t.indexOf(s)>=0)) {
              el.scrollIntoView({block:'center'});
              el.click();
              return 'CLICK:'+t.substring(0,60);
            }
          }
          return 'NADA';
        })()"""
        for (f in page.frames()) {
            val r = runCatching { f.evaluate(js)?.toString() ?: "NADA" }.getOrDefault("NADA")
            if (r.startsWith("CLICK:")) {
                println("[browser] clickTextoEnFrames -> $r")
                Thread.sleep(1000)
                return@runCatching true
            }
        }
        println("[browser] clickTextoEnFrames -> NADA")
        false
    }.getOrDefault(false)

    /**
     * URLs de todos los frames (para navegar directo al contenido anidado).
     */
    fun urlsFrames(): List<String> = runCatching {
        page.frames().map { it.url() }.filter { it.isNotBlank() }
    }.getOrDefault(emptyList())

    /**
     * Ejecuta la acción (normalmente un clic) esperando el evento de descarga
     * del navegador. Para apps que descargan el PDF en vez de mostrarlo en iframe.
     *
     * @return Bytes del archivo descargado o `null` si no hubo descarga.
     */
    fun descargarPorEvento(timeoutMs: Double, accion: () -> Boolean): ByteArray? = runCatching {
        val dl = page.waitForDownload(
            Page.WaitForDownloadOptions().setTimeout(timeoutMs),
            Runnable { accion() }
        )
        val ruta = dl.path() ?: return@runCatching null
        println("[browser] descarga por evento: $ruta")
        java.nio.file.Files.readAllBytes(ruta)
    }.getOrNull()

    /**
     * Lista las pestañas del contexto (la app a veces abre el PDF en un popup).
     */
    fun dumpPestanas(): String = runCatching {
        page.context().pages().mapIndexed { i, p -> "TAB$i url=" + p.url().take(160) }
            .joinToString(" | ").take(800)
    }.getOrDefault("TABS_FAIL")

    /**
     * Busca bytes de PDF en los iframes de TODAS las pestañas del contexto.
     */
    fun pdfEnPestanas(): ByteArray? = runCatching {
        for (p in page.context().pages()) {
            val raw = p.evaluate(
                "(async () => {" +
                "const urls = [];" +
                "document.querySelectorAll('iframe').forEach(f => { if (f.src) urls.push(f.src); });" +
                "document.querySelectorAll('embed').forEach(e => { if (e.src) urls.push(e.src); });" +
                "const out = [];" +
                "for (const u of urls) {" +
                "try {" +
                "const resp = await fetch(u, {credentials:'include'});" +
                "const buf = await resp.arrayBuffer();" +
                "const bytes = new Uint8Array(buf);" +
                "let head = '';" +
                "for (let i = 0; i < Math.min(5, bytes.length); i++) head += String.fromCharCode(bytes[i]);" +
                "if (head.indexOf('%PDF') === 0) {" +
                "let binary = '';" +
                "for (let i = 0; i < bytes.length; i += 8192) {" +
                "binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));" +
                "};" +
                "out.push('B64:' + btoa(binary));" +
                "}" +
                "} catch (e) {}" +
                "};" +
                "return out.join('|');" +
                "})()"
            )?.toString() ?: continue
            val first = raw.split("|").firstOrNull { it.startsWith("B64:") } ?: continue
            val bytes = runCatching { Base64.getDecoder().decode(first.removePrefix("B64:")) }.getOrNull()
            if (bytes != null) {
                println("[browser] PDF encontrado en popup: ${p.url().take(120)} (${bytes.size} bytes)")
                return@runCatching bytes
            }
        }
        null
    }.getOrNull()

    /**
     * Extrae el contenido serializado en JSON del localStorage.
     */
    fun localStorage(): String = eval("JSON.stringify(localStorage)")

    /**
     * Retorna el texto visible del cuerpo de la página web.
     */
    fun pageText(): String = runCatching {
        val t = page.evaluate("document.body.innerText || ''")?.toString() ?: ""
        t.replace(Regex("\\s+"), " ").trim().take(600)
    }.getOrDefault("")

    /**
     * Inspección ligera de elementos input e img en el DOM para depuración.
     */
    fun dumpDom(): String = runCatching {
        val imgs = page.querySelectorAll("img").map {
            (it.getAttribute("src") ?: "").take(40)
        }
        val inputs = page.querySelectorAll("input").map {
            (it.getAttribute("type") ?: "") + "|" + (it.getAttribute("name") ?: "") + "|" + (it.getAttribute("id") ?: "")
        }
        "imgs=" + imgs.toString().take(400) + " inputs=" + inputs.toString().take(500)
    }.getOrDefault("DUMP_FAIL")

    /**
     * Inspecciona elementos clave de la aplicación web (iframes, botones, modals).
     */
    fun dumpApp(): String = runCatching {

        (page.evaluate(
            """JSON.stringify({
              url: location.href,
              text: (document.body.innerText||'').replace(/\s+/g,' ').trim().substring(0,1200),
              modal: (document.querySelector('#modal-root')||{}).innerText||'',
              links: Array.from(document.querySelectorAll('a[href]')).map(a=>a.innerText.trim().substring(0,40)+'->'+(a.getAttribute('href')||'').substring(0,80)).slice(0,30),
              buttons: Array.from(document.querySelectorAll('button,input[type=button],input[type=submit],.btn,[role=button]')).map(b=>(b.innerText||b.value||'').trim().substring(0,40)).filter(Boolean).slice(0,30),
              frames: Array.from(document.querySelectorAll('iframe,embed,object')).map(f=>(f.tagName)+':'+(f.getAttribute('src')||f.getAttribute('data')||'').substring(0,80)).slice(0,10)
            })"""
        )?.toString() ?: "{}").take(2500)
    }.getOrDefault("DUMP_FAIL")

    /**
     * Determina si la página contiene un iframe o visor embebido con un archivo PDF.
     */
    fun hasPdfFrame(): Boolean = runCatching {
        page.querySelectorAll("iframe, embed").any { !(it.getAttribute("src").isNullOrBlank()) }
    }.getOrDefault(false)

    /**
     * Extrae y descarga de forma directa los bytes binarios de un PDF servido dentro de un iframe o visor HTML.
     * Valida la firma mágica del encabezado (`%PDF`).
     *
     * @return Array de bytes binarios del PDF o `null` si falla.
     */
    fun downloadPdfBytes(): ByteArray? {
        val raw = runCatching {
            page.evaluate(
                "(async () => {" +
                "const urls = [];" +
                "document.querySelectorAll('iframe').forEach(f => { if (f.src) urls.push(f.src); });" +
                "document.querySelectorAll('embed').forEach(e => { if (e.src) urls.push(e.src); });" +
                "const obj = document.querySelector('object[data]');" +
                "if (obj) urls.push(obj.getAttribute('data'));" +
                "const out = [];" +
                "for (const u of urls) {" +
                "try {" +
                "const resp = await fetch(u, {credentials:'include'});" +
                "const buf = await resp.arrayBuffer();" +
                "const bytes = new Uint8Array(buf);" +
                "let head = '';" +
                "for (let i = 0; i < Math.min(5, bytes.length); i++) head += String.fromCharCode(bytes[i]);" +
                "if (head.indexOf('%PDF') === 0) {" +
                "let binary = '';" +
                "for (let i = 0; i < bytes.length; i += 8192) {" +
                "binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));" +
                "};" +
                "out.push('B64:' + btoa(binary));" +
                "}" +
                "} catch (e) {}" +
                "};" +
                "return out.join('|');" +
                "})()"
            )?.toString()
        }.getOrNull() ?: return null
        val first = raw.split("|").firstOrNull { it.startsWith("B64:") } ?: return null
        return runCatching { Base64.getDecoder().decode(first.removePrefix("B64:")) }.getOrNull()
    }

    override fun close() {
        runCatching { browser.close() }
        runCatching { pw.close() }
    }
}

