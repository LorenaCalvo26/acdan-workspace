package com.acdan.sat.scripts

import com.koupper.os.env
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import software.amazon.awssdk.services.ssm.SsmClient
import software.amazon.awssdk.services.ssm.model.GetParameterRequest
import software.amazon.awssdk.services.ssm.model.ParameterType
import software.amazon.awssdk.services.ssm.model.PutParameterRequest
import java.time.Duration

/**
 * Logos de marca: el despacho sube el suyo y el admin puede cambiar el de Pilli.
 *
 * El navegador sube el archivo DIRECTO a S3 con una URL presignada (15 min) y
 * aquí solo se guarda la URL pública final, que es estable. Las imágenes viven
 * en el bucket del portal, que ya se sirve por CloudFront.
 */
object BrandingStore {
    data class Firma(val uploadUrl: String, val publicUrl: String, val clave: String)

    private const val PARAM_LOGO_PILLI = "/acdan/config/logo-pilli"

    private val ssm: SsmClient? by lazy {
        runCatching {
            SsmClient.builder()
                .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
                .build()
        }.getOrNull()
    }

    private fun bucket() = env("PORTAL_BUCKET", required = false, default = "")

    /** true si hay bucket y credenciales para firmar. */
    fun configurado(): Boolean = bucket().isNotBlank()

    /** URL del logo de Pilli (la cambia el admin). */
    fun logoPilli(): String = runCatching {
        ssm?.getParameter(GetParameterRequest.builder().name(PARAM_LOGO_PILLI).build())?.parameter()?.value()
    }.getOrNull().orEmpty()

    fun guardarLogoPilli(url: String): Boolean = runCatching {
        ssm?.putParameter(
            PutParameterRequest.builder()
                .name(PARAM_LOGO_PILLI)
                .value(url.trim())
                .type(ParameterType.STRING)
                .overwrite(true)
                .build()
        )
        true
    }.getOrDefault(false)

    private fun basePublica(): String {
        val base = env("PORTAL_BASE_URL", required = false, default = "").trimEnd('/')
        return if (base.isBlank()) "" else base
    }

    private val presigner: S3Presigner? by lazy {
        runCatching {
            S3Presigner.builder()
                .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
                .build()
        }.getOrNull()
    }

    private fun extension(tipo: String): String? = when (tipo.trim().lowercase()) {
        "image/png" -> "png"
        "image/jpeg", "image/jpg" -> "jpg"
        "image/webp" -> "webp"
        else -> null
    }

    /**
     * Firma una subida para [prefijo] (por ejemplo `despachos/DCD950101AB1` o `pilli`).
     * Devuelve la URL de subida y la URL pública final, o null si no hay bucket.
     */
    fun firmar(prefijo: String, tipo: String): Firma? {
        val b = bucket()
        if (b.isBlank()) return null
        val ext = extension(tipo) ?: return null
        val limpio = prefijo.trim().trim('/').replace(Regex("[^A-Za-z0-9/_-]"), "")
        if (limpio.isBlank()) return null
        val clave = "branding/$limpio/${System.currentTimeMillis()}.$ext"
        val put = PutObjectRequest.builder()
            .bucket(b)
            .key(clave)
            .contentType(tipo)
            .build()
        val firmado = runCatching {
            presigner?.presignPutObject(
                PutObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofMinutes(15))
                    .putObjectRequest(put)
                    .build()
            )?.url()?.toString()
        }.getOrNull() ?: return null
        val base = basePublica()
        val publica = if (base.isBlank()) "" else "$base/$clave"
        return Firma(firmado, publica, clave)
    }
}
