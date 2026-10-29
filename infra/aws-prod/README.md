# Pilli en una cuenta AWS nueva

Este directorio es el despliegue limpio para la cuenta nueva. **No usar**
`infra/terraform/` ni `deploy-demo.bat` para producción: esos archivos son de
demo y están amarrados a la cuenta vieja.

El backlog vigente, los bloqueantes y las mejoras de costo están en
[`../../TODO.md`](../../TODO.md). `infra/PROD.md` es histórico de la cuenta
vieja y no debe usarse como lista de pendientes actual.

## Estado actual — 2026-10-28

| Punto | Estado |
|---|---|
| Cuenta / región | `035946121227` / `us-east-2` |
| Portal | https://d22yqgesfr8apq.cloudfront.net |
| Web ACDAN | https://d12e6ylodhs3df.cloudfront.net |
| API directa | https://7dmg6gmr08.execute-api.us-east-2.amazonaws.com |
| `terraform plan` | Sin cambios |
| Health | `GET /health` → 200 |
| Datos | 0 clientes, 0 documentos, 0 jobs |
| Workers / colas | 0 workers, SQS y DLQ en 0 |
| SNS | Suscripción pendiente de confirmar |
| Prueba real | No ejecutada: falta cliente con CIEC/comprobantes |

El health canónico es `/health` en la API directa. `/api/v1/health` no existe y
responde `ROUTE_NOT_FOUND`.

## Qué crea

- VPC mínima con 2 subredes públicas, IGW y security group para Fargate.
- DynamoDB: `ACDAN_CLIENTES`, `ACDAN_JOBS`, `ACDAN_DOCS`, `ACDAN_USERS`.
- SQS `acdan-sat-jobs` + DLQ.
- S3 privado para portal, web y documentos, con versionado y cifrado.
- ECR para API y worker.
- Lambda de la API + API Gateway HTTP API.
- ECS Cluster + task definition Fargate Spot (sin servicio encendido).
- EventBridge Scheduler horario.
- CloudFront para Pilli (`/api/*` y `/pdfs/*`) y para el sitio ACDAN.
- IAM, Secrets Manager, SSM, SNS, alarmas y presupuesto.

No crea ALB, NAT ni worker 24/7.

## Costos esperados

Con poco volumen (1–20 clientes y una corrida mensual), la estimación es:

| Concepto | Estimado |
|---|---:|
| AWS fijo (Secrets Manager + ECR) | ~1–2 USD/mes |
| AWS variable (Fargate Spot, logs, S3) | ~0.50–2 USD/mes |
| OpenAI (`gpt-4o-mini`) | ~0.50–2 USD/mes |
| **Total AWS + OpenAI** | **3–6 USD/mes** |

- El presupuesto `acdan-sat-mensual` de 15 USD es una **alerta**, no un tope.
- Secrets Manager cuesta ~0.80 USD/mes por los dos secretos después del periodo
  de prueba.
- ECR almacena ~1.8 GB. No hay lifecycle: cada despliegue deja una imagen nueva.
- Fargate Spot es el costo variable principal; una corrida de 10–20 minutos
  cuesta del orden de 0.005–0.01 USD.
- OpenAI, SMTP y dominio están fuera del presupuesto de AWS.
- Confirmar free tier en **Billing → Free Tier**; la consulta automatizada puede
  salir vacía en una cuenta nueva.
- Si AWS aplica IVA, el total puede llevar IVA adicional.

Las mejoras de costo concretas están en [`../../TODO.md`](../../TODO.md).

## Requisitos en la cuenta nueva

1. Cuenta AWS con facturación activa y MFA en root.
2. Usuario/rol IAM con permisos de despliegue y un perfil de AWS CLI.
3. Docker Desktop encendido.
4. Terraform >= 1.5.
5. Java 17/21, Node 20 y npm.
6. Una API key de OpenAI.
7. Una contraseña de aplicación SMTP o credenciales de SES.
8. Opcional: certificado ACM en **us-east-1** y dominio.

## Primer despliegue

```powershell
cd infra\aws-prod
Copy-Item terraform.tfvars.example terraform.tfvars
# Edita terraform.tfvars con perfil, correos, SMTP y OpenAI
terraform init
.\deploy.ps1 -Profile NOMBRE_DEL_PERFIL
```

`deploy.ps1` hace:

1. Crea primero los repositorios ECR (target apply).
2. Compila el JAR y construye/pushea las imágenes reales de API y worker.
3. Aplica la infraestructura completa con esas imágenes.
4. Fija las URLs públicas de CloudFront en Lambda/worker.
5. Compila los dos frontends, los sube a S3 e invalida CloudFront.

La Lambda **no** puede usar imágenes de ECR Public: por eso el script crea los
repositorios privados y sube las imágenes antes de crear la función. El primer
apply puede tardar. CloudFront tarda varios minutos en desplegar.

Opciones útiles después del primer despliegue:

- `-SkipImages`: reutiliza las imágenes actuales de Lambda/worker.
- `-SkipFrontends`: solo infraestructura, sin rebuild de frontends.
- `-OnlyFrontends`: no toca Terraform ni imágenes; solo reconstruye y sube
  los dos frontends.

## Crear el admin inicial

Después del deploy:

```powershell
cd infra\aws-prod
.\seed-admin.ps1 -Profile NOMBRE_DEL_PERFIL -Email admin@acdan.mx
```

El script pide la contraseña de forma segura y se rehúsa si ya existe algún
usuario en `ACDAN_USERS`.

## Pruebas

### Smoke test, sin datos reales

```powershell
# Desde infra\aws-prod
$api = terraform output -raw api_url
Invoke-RestMethod "$api/health"

# Confirmar portal y web
Invoke-WebRequest https://d22yqgesfr8apq.cloudfront.net -UseBasicParsing
Invoke-WebRequest https://d12e6ylodhs3df.cloudfront.net -UseBasicParsing
```

También se puede revisar que no haya workers ni mensajes:

```powershell
aws ecs list-tasks --cluster acdan-sat-cluster --desired-status RUNNING
aws sqs get-queue-attributes --queue-url https://sqs.us-east-2.amazonaws.com/035946121227/acdan-sat-jobs --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

### Prueba real, un cliente y un RFC

**No hacer todavía** hasta confirmar SNS y revisar la UI pendiente. La
autenticación de rutas staff y CORS ya están cerrados y verificados. Después:

1. Entra al portal y da de alta **un** cliente con su CIEC.
2. Corre solo Opinión 32-D/Constancia y revisa el job, el PDF, `/pdfs/...`, los
   logs y la salida automática del worker.
3. Si hay CFDI real, sincroniza **un** mes cerrado y verifica XML/PDF, totales y
   que no haya duplicados.
4. Revisa SQS/DLQ y confirma que no quede ningún worker encendido.

No ejecutes corridas masivas ni cargues el resto de clientes hasta que esa
prueba pase.

## Dominio propio

Si vas a usar dominio:

1. Crea el certificado en ACM en **us-east-1**.
2. Debe cubrir `portal_domain` y `web_domain`.
3. Llena `portal_domain`, `web_domain` y `acm_certificate_arn` en
   `terraform.tfvars`.
4. Vuelve a correr `.\deploy.ps1 -SkipImages` (no corras `terraform apply`
   directo: necesita las URLs de las imágenes).
5. Crea los CNAME/ALIAS de Route53 o del proveedor DNS hacia CloudFront.

Sin dominio, todo funciona con las URLs `*.cloudfront.net`.

## Correo y SNS

- Confirma el correo de suscripción de SNS `acdan-sat-alertas` (o el nombre
  que resulte de `project_name`).
- Verifica que SMTP pueda enviar desde el dominio remitente.
- El despliegue actual reutiliza el SMTP `contacto@igly.mx` y la API key de
  OpenAI existente. Reemplazarlos por credenciales del cliente antes del handoff.
- Si usas SES en modo sandbox, solo podrás enviar a correos verificados.

## Checklist antes de abrirlo al público

Ya está:

- [x] Terraform validado y sin cambios.
- [x] Portal, web y `/health` en 200.
- [x] Admin inicial creado.
- [x] PITR, cifrado, versionado y OAC.
- [x] Presupuesto y alarmas creados.
- [x] Logs con retención de 30 días.
- [x] Rutas de staff protegidas con JWT; sin token → `401`.
- [x] CORS restringido a portal y web; origen ajeno sin header.

Falta:

- [ ] Suscripción SNS confirmada.
- [ ] SMTP con SPF/DKIM/DMARC del dominio remitente.
- [ ] Prueba real con un cliente/RFC y CFDI de un mes cerrado.
- [ ] Rediseño de correos aprobado y portado a `EmailNotifier.kt`.
- [ ] State de Terraform en S3 con cifrado y bloqueo.
- [ ] Migración del worker al task role de ECS y retiro de llaves estáticas.
- [ ] Lifecycle de ECR para no acumular imágenes.
- [ ] Rotación de JWT/SMTP/OpenAI/llaves antes del handoff.

El detalle y el orden recomendado están en [`../../TODO.md`](../../TODO.md).

## Notas

- `api_image_uri` y `worker_image_uri` no tienen valor por defecto: las pasa
  `deploy.ps1` después de construir y pushear las imágenes. No corras un
  `terraform apply` completo sin esas variables.
- `-SkipImages` solo funciona si ya existe una Lambda/worker desplegados.
- El bucket de documentos no tiene `force_destroy`: no se borra por accidente.
- Los secretos tienen ventana de recuperación de 7 días.
- `terraform.tfvars` y `terraform.tfstate` contienen secretos, están ignorados
  por git y no deben compartirse fuera del handoff.
- El diseño nuevo de correos sigue en `email-templates/`; si se quiere enviar
  ese diseño, todavía hay que portarlo a `EmailNotifier.kt`.
- Falta validar CFDI con comprobantes reales.
