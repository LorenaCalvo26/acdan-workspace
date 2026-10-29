# Pilli — pendientes y mejoras

Actualizado: **2026-10-29**  
Cuenta nueva: `035946121227` · Región: `us-east-2` · Perfil: `acdan-prod`

Este es el backlog vigente. `infra/PROD.md` describe la cuenta vieja y se conserva
como referencia histórica; no usar sus pendientes como lista actual.

## Estado verificado hoy

- [x] `terraform validate` correcto y `terraform plan` sin cambios.
- [x] API directa `GET /health` → `200 {"status":"ok"}`.
- [x] Portal y sitio web → `200`.
- [x] `stats` responde: `clientes=0`, `docs=0`, `jobsHoy=0`.
- [x] Sin workers ECS corriendo.
- [x] SQS y DLQ en `0` mensajes.
- [x] Presupuesto `acdan-sat-mensual`: límite 15 USD, gasto actual 0 USD.
- [x] PITR, cifrado, versionado, OAC y retención de logs de 30 días configurados.
- [x] Backend: 14 pruebas unitarias, 0 fallos. Builds de portal y web correctos.
- [x] Rutas de staff protegidas con JWT: `/stats` y `/clientes/todos` → `401`
      sin token; login y `/stats` con Bearer → `200`. Verificado también por
      CloudFront. Commit `b24e338`.
- [x] CORS restringido a portal y web; un origen ajeno no recibe
      `Access-Control-Allow-Origin`. Commit `700fe60`.
- [ ] Suscripción SNS de alertas: `PendingConfirmation`.
- [ ] Prueba real con un cliente/RFC: no ejecutada.
- [ ] Rediseño de correos: no aprobado ni portado a `EmailNotifier.kt`.

## P0 — antes de abrir al público

- [x] **Cerrar las rutas de staff con autenticación.** Validación central en
      `ApiGatewayEntryPoint`; sin token → `401`, rol `CLIENTE` → `403`.
- [x] Restringir CORS a portal y web; la API de producción ya no usa `*`.
- [ ] Confirmar la suscripción SNS en `jacob.gacosta@gmail.com` y probar que
      llega una alerta.
- [ ] Cambiar la contraseña del admin inicial y eliminar/rotar cualquier secreto
      temporal usado para el seed.
- [ ] Verificar SMTP real: remitente, SPF, DKIM y DMARC. No enviar correos a
      clientes hasta que el dominio remitente esté autenticado.
- [ ] Aprobar el rediseño de correos antes de portarlo. Hoy los envíos reales
      siguen usando el diseño anterior de `EmailNotifier.kt`.
- [ ] Hacer `commit`/`push` del resto de `infra/aws-prod`, cambios de frontend,
      `backend/.dockerignore`, `email-templates/` y documentación. Auth y CORS
      ya están en commits locales (`b24e338`, `700fe60`). No incluir
      `terraform.tfstate`, `terraform.tfvars` ni secretos.

## 1. Primera prueba real, controlada

Objetivo: **un solo cliente y un solo RFC**, sin corridas masivas.

- [ ] Contar con un cliente real que tenga RFC y CIEC vigente.
- [ ] Para CFDI, contar con al menos un comprobante real de un mes cerrado.
- [ ] Dar de alta el cliente desde el portal y verificar `tieneCiec`.
- [ ] Ejecutar primero solo Opinión 32-D/Constancia y revisar:
      job, PDF en S3, `/pdfs/...`, salida del worker y logs.
- [ ] Si hay CFDI, sincronizar **un** mes cerrado y verificar XML/PDF, totales y
      que no se dupliquen registros.
- [ ] Revisar SQS/DLQ y confirmar que no quede ningún worker encendido.
- [ ] Revisar el gasto del día y que el presupuesto siga en 0/valor esperado.
- [ ] Solo después de esa prueba, cargar el resto de clientes y validar el tick
      horario.

Nota: el health canónico es `GET /health` en la API directa.
`/api/v1/health` no existe y responde `ROUTE_NOT_FOUND`.

## 2. Costos y capacidad

Estimación actual para bajo volumen: **3–6 USD/mes** entre AWS y OpenAI,
reutilizando correo/dominio. El presupuesto de 15 USD es una **alerta**, no un
tope.

- [ ] Agregar lifecycle de ECR para conservar solo las últimas 2–3 imágenes.
      Hoy no hay política; cada despliegue deja ~1.8 GB adicionales.
- [ ] Evaluar combinar los dos secretos de Secrets Manager en uno, o mover las
      llaves del worker a SSM SecureString, para bajar el fijo de ~0.80 USD/mes.
- [ ] Configurar un límite mensual de gasto en la cuenta de OpenAI. El budget de
      AWS no cubre OpenAI.
- [ ] Medir duración y costo real de una corrida de 32-D y una de CFDI.
- [ ] Si la medición lo permite, bajar `WORKER_IDLE_EXIT_SECONDS` de 300 a
      120–180 segundos.
- [ ] Revisar si conviene una alerta temprana de presupuesto en 8–10 USD, además
      de la de 15 USD.
- [ ] Confirmar en **Billing → Free Tier** qué servicios están cubiertos; la
      consulta `freetier` salió vacía y no confirma elegibilidad.
- [ ] Confirmar si AWS aplica IVA y si el presupuesto lo incluye.
- [ ] Decidir si dominio y buzón nuevos los paga el cliente o se reutilizan los
      actuales.

## 3. Seguridad y operación

- [ ] Migrar el worker al task role de ECS y eliminar el usuario IAM con llaves
      estáticas (`acdan-sat-task`), cuando Koupper lo permita.
- [ ] Mover el state de Terraform a S3 con cifrado y bloqueo (DynamoDB), y
      documentar el procedimiento de recuperación.
- [ ] Rotar JWT, SMTP, OpenAI y las llaves del worker antes del handoff.
- [ ] Verificar una restauración real de DynamoDB PITR, no solo que esté activo.
- [ ] Revisar que los logs de 30 días no guarden datos personales innecesarios.
- [ ] Evaluar WAF/rate limiting en API Gateway después de cerrar la autenticación.
- [ ] Evaluar `GET /api/v1/health` como alias o documentar definitivamente
      `/health`.
- [ ] Confirmar que el bucket de documentos no sea público y que OAC siga
      funcionando después de cambios de CloudFront.
- [ ] Decidir qué hacer con la cuenta vieja: mantenerla como rollback hasta la
      aceptación y después apagar/borrar ALB, servicio 24/7 e imágenes viejas.

## 4. Producto y aprobaciones

- [ ] Revisar en el navegador los cambios de prioridad CFDI, fecha de próxima
      corrida, estilos de inputs y documentación de cadencia.
- [ ] Probar el selector de fecha: fecha elegida = próxima corrida, hora 08:00 y
      recurrencia mensual en el mismo día.
- [ ] Decidir la migración de clientes legacy con `frecuenciaDias`; hasta entonces
      siguen con programación por intervalo.
- [ ] Aprobar y portar el rediseño de correos a `EmailNotifier.kt`.
- [ ] Definir si se usan dominios propios o se quedan las URLs de CloudFront.
- [ ] Verificar enlaces del portal en el sitio web y en correos antes del handoff.

## 5. Decisiones pendientes

- [ ] Titularidad de la cuenta AWS, facturación, MFA root y accesos IAM.
- [ ] Titularidad y límite de la cuenta OpenAI.
- [ ] Reemplazar el SMTP actual (`contacto@igly.mx`) y la API key actual de
      OpenAI por credenciales del cliente antes del handoff.
- [ ] Definir si las alertas de SNS siguen en `jacob.gacosta@gmail.com` o pasan
      al correo del cliente.
- [ ] Proveedor de correo, buzón y DNS.
- [ ] Dominio(s) y certificados.
- [ ] Responsable de monitoreo, alertas y soporte mensual.
- [ ] RPO/RTO de respaldos y procedimiento de restauración.
- [ ] Monto final del presupuesto y correo que recibe las alertas.
- [ ] Si se conserva la infraestructura demo/legacy o se elimina.

## Reglas para no romper producción

- No correr jobs masivos ni pruebas con varios clientes a la vez.
- No desplegar el rediseño de correos sin aprobación.
- No hacer `commit` de `terraform.tfstate`, `terraform.tfvars`, `.env` ni secretos.
- No agregar ALB, NAT ni worker 24/7 para “simplificar”: rompen el modelo de costo.
- No cargar el resto de clientes reales hasta completar la prueba controlada
  con un cliente/RFC y revisar la UI pendiente.
