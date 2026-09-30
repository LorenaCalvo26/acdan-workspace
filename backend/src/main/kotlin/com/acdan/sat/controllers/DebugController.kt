package com.acdan.sat.controllers

import com.acdan.sat.scripts.CaptchaSolver
import com.acdan.sat.scripts.SatBrowser
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

data class CaptchaDebugRequest(val file: String = "")
data class NavigateRequest(val url: String = "")

object DebugController {

    fun browserTest(): ControllerResponse {
        val pool = Executors.newSingleThreadExecutor()
        return try {
            val f = pool.submit<String> {
                SatBrowser(headless = true).use { b ->
                    val ok = b.navigate("https://example.com")
                    "navigate=$ok url=${b.currentUrl()}"
                }
            }
            val res = f.get(90, TimeUnit.SECONDS)
            ControllerResponse(200, """{"ok":true,"result":${toJson(res)}}""")
        } catch (e: Exception) {
            ControllerResponse(500, """{"error":"${e.javaClass.simpleName}: ${e.message?.replace("\"", "'")?.take(800)}"}""")
        } finally {
            pool.shutdownNow()
        }
    }

    // Explora una URL y devuelve el dump de la app (texto, links, botones, frames)
    // + el localStorage (para ver si la SPA guarda el code_verifier de PKCE).
    fun navigate(req: NavigateRequest): ControllerResponse {
        val pool = Executors.newSingleThreadExecutor()
        return try {
            val f = pool.submit<String> {
                SatBrowser(headless = true).use { b ->
                    b.navigate(req.url)
                    Thread.sleep(6000)
                    "URL=" + b.currentUrl() + "\nLS=" + b.localStorage().take(600) + "\nAPP=" + b.dumpApp()
                }
            }
            val res = f.get(90, TimeUnit.SECONDS)
            ControllerResponse(200, """{"ok":true,"result":${toJson(res)}}""")
        } catch (e: Exception) {
            ControllerResponse(500, """{"error":"${e.javaClass.simpleName}: ${e.message?.replace("\"", "'")?.take(500)}"}""")
        } finally {
            pool.shutdownNow()
        }
    }

    // Resuelve un captcha ya guardado en storage/debug sin pegarle al SAT.
    // Body: {"file":"<jobId>-captcha-1.png"}
    // -> {"code":"...","lecturas":[...],"consensoAlto":true}
    // También escribe la versión preprocesada como <file>-clean.png para que la veas.
    fun solveCaptcha(req: CaptchaDebugRequest): ControllerResponse {
        val name = req.file.trim().replace("/", "").replace("\\", "")
        val f = File("./storage/debug/" + name)
        if (!f.exists()) return ControllerResponse(404, """{"error":"FILE_NOT_FOUND"}""")
        return try {
            val bytes = f.readBytes()
            val clean = CaptchaSolver.preprocess(bytes)
            File("./storage/debug/" + name + "-clean.png").writeBytes(clean)
            val lectura = CaptchaSolver.solve(bytes)
            val lecturas = lectura.lecturas.joinToString(",") { "\"$it\"" }
            ControllerResponse(
                200,
                """{"ok":true,"file":"$name","code":"${lectura.code}",""" +
                    """"lecturas":[$lecturas],"consensoAlto":${lectura.consensoAlto},""" +
                    """"clean":"$name-clean.png"}"""
            )
        } catch (e: Exception) {
            ControllerResponse(500, """{"error":"${e.message?.replace("\"", "'")?.take(300)}"}""")
        }
    }

    private fun toJson(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "").take(3000) + "\""
}
