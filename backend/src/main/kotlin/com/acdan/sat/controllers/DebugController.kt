package com.acdan.sat.controllers

import com.acdan.sat.scripts.CaptchaSolver
import com.acdan.sat.scripts.SatBrowser
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

data class CaptchaDebugRequest(val file: String = "")
data class NavigateRequest(val url: String = "")
data class ReextractRequest(val docId: String = "", val tipo: String = "constancia")
data class ReguardarRequest(val docId: String = "")

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

    // Re-extrae los campos de un PDF ya descargado (storage/{RFC}/{docId}.pdf)
    // sin pegarle al SAT. Body: {"docId":"...","tipo":"constancia"}
    fun reextract(req: ReextractRequest): ControllerResponse {
        val id = req.docId.trim().replace("/", "").replace("\\", "")
        if (id.isBlank()) return ControllerResponse(400, """{"error":"DOC_REQUIRED"}""")
        val dir = File("./storage")
        val f = dir.walkTopDown().firstOrNull { it.isFile && it.name == "$id.pdf" }
            ?: return ControllerResponse(404, """{"error":"PDF_NOT_FOUND"}""")
        return try {
            val campos = com.acdan.sat.scripts.PdfExtractor.extract(f.absolutePath, req.tipo.ifBlank { "constancia" })
            val json = campos.entries.joinToString(",", "{", "}") { (k, v) -> "\"$k\":${toJson(v.take(500))}" }
            val vista = com.acdan.sat.scripts.PdfExtractor.vistaConstancia(f.absolutePath).take(2500)
            val vfull = com.acdan.sat.scripts.PdfExtractor.vistaConstancia(f.absolutePath)
            val idxReg = vfull.indexOf("Regimenes:")
            val idxCp = vfull.indexOf("Codigo Postal")
            val raros = vfull.filter { it.code > 127 }.map { it.code.toString(16) }.distinct().sorted().joinToString(",")
            ControllerResponse(200, """{"ok":true,"docId":"$id","campos":$json,"vista":${toJson(vista)},"idxRegimenes":$idxReg,"idxCp":$idxCp,"raros":"$raros"}""")
        } catch (e: Exception) {
            ControllerResponse(500, """{"error":"${e.message?.replace("\"", "'")?.take(300)}"}""")
        }
    }

    // Re-extrae y RE-GUARDA los campos de un doc ya descargado (misma
    // serialización que el bot). Para corregir docs guardados con regex viejos.
    fun reguardar(req: ReguardarRequest): ControllerResponse {
        val id = req.docId.trim().replace("/", "").replace("\\", "")
        if (id.isBlank()) return ControllerResponse(400, """{"error":"DOC_REQUIRED"}""")
        val dynamo = com.koupper.container.app.getInstance(com.koupper.providers.aws.dynamo.DynamoClient::class)
        val docsTable = com.koupper.os.env("ACDAN_DOCS", required = false, default = "ACDAN_DOCS")
        val item = dynamo.getItem(docsTable, "pk", id)
            ?: return ControllerResponse(404, """{"error":"DOC_NOT_FOUND"}""")
        val tipo = item["tipo"]?.toString() ?: "constancia"
        val ruta = item["s3Key"]?.toString().orEmpty()
        if (ruta.isBlank() || !File(ruta).exists()) return ControllerResponse(404, """{"error":"PDF_NOT_FOUND"}""")
        return try {
            val campos = com.acdan.sat.scripts.PdfExtractor.extract(ruta, tipo)
            val merged = item.toMutableMap()
            merged["campos"] = com.acdan.sat.controllers.Json.obj(campos, sinTruncar = setOf("raw"), max = 1000)
            dynamo.insertItem(docsTable, merged.mapValues { it.value.toString() })
            ControllerResponse(200, """{"ok":true,"docId":"$id"}""")
        } catch (e: Exception) {
            ControllerResponse(500, """{"error":"${e.message?.replace("\"", "'")?.take(300)}"}""")
        }
    }

    private fun toJson(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "").take(3000) + "\""
}
