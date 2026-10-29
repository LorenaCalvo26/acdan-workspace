# Pilli + ACDAN — Documento de entrega

**Entrega prevista:** 30 de octubre de 2026  
**Cuenta AWS de producción:** `035946121227` · Región `us-east-2`  
**Repositorio:** <https://github.com/LorenaCalvo26/acdan-workspace>

## 1. Resumen

Pilli es la plataforma de monitoreo fiscal de ACDAN Consultores. Descarga, custodia
y vigila la vigencia de los documentos fiscales de cada cliente, y permite revisar
la comparativa SAT vs Pilli mes a mes.

La entrega incluye:

- Código fuente completo, infraestructura como código y documentación.
- Portal de clientes y sitio institucional de ACDAN.
- API, base de datos, almacenamiento de documentos y colas de trabajo.
- Autenticación de staff, portal de clientes y CORS restringido.
- Respaldos, cifrado, versionado, logs y presupuesto de AWS.
- Puesta en producción, capacitación y 30 días de acompañamiento.

## 2. URLs de producción

| Servicio | URL |
|---|---|
| Portal Pilli | <https://d22yqgesfr8apq.cloudfront.net> |
| Sitio ACDAN | <https://d12e6ylodhs3df.cloudfront.net> |
| API | <https://7dmg6gmr08.execute-api.us-east-2.amazonaws.com> |
| Health canónico | `GET /health` |
| Propuesta comercial | <https://d22yqgesfr8apq.cloudfront.net/propuesta> |
| Factura imprimible | <https://d22yqgesfr8apq.cloudfront.net/factura.html> |

El portal y el sitio web están publicados. Los cambios de interfaz de la última
iteración están en el repositorio y se publican cuando se aprueben.

## 3. Estado técnico verificado

- `terraform validate` correcto y `terraform plan` sin cambios.
- API directa `GET /health` → `200`.
- Portal y sitio web → `200`.
- `stats`: `clientes=0`, `docs=0`, `jobsHoy=0`.
- Sin trabajos en curso; SQS y DLQ en `0` mensajes.
- Rutas de staff protegidas con JWT: sin token → `401`; rol de cliente → `403`.
- CORS limitado a los orígenes del portal y del sitio web.
- Respaldos PITR, cifrado, versionado, OAC y retención de logs de 30 días.
- Presupuesto mensual de AWS configurado como alerta.
- Backend: 14 pruebas unitarias, 0 fallos. Builds de portal y web correctos.
- Rediseño de correos: en revisión; no se ha portado ni publicado.

## 4. Prueba controlada recomendada

La primera prueba se hace con **un solo cliente y un solo RFC**, sin corridas
masivas.

1. Contar con un cliente real con RFC y CIEC vigente.
2. Para CFDI, contar con al menos un comprobante real de un mes cerrado.
3. Dar de alta el cliente desde el portal y verificar `tieneCiec`.
4. Ejecutar primero solo Opinión 32-D/Constancia y revisar:
   job, PDF en S3, ruta `/pdfs/...`, salida del worker y logs.
5. Si hay CFDI, sincronizar **un** mes cerrado y verificar XML/PDF, totales y
   que no se dupliquen registros.
6. Revisar SQS/DLQ y confirmar que no quede ningún worker encendido.
7. Revisar el gasto del día y que el presupuesto siga en el valor esperado.
8. Solo después de esa prueba, cargar el resto de clientes y validar el tick
   horario.

## 5. Pendientes antes de operar con clientes reales

- [ ] Confirmar la suscripción de alertas SNS y definir el correo que las recibe.
- [ ] Cambiar la contraseña del admin inicial y rotar secretos temporales.
- [ ] Verificar SMTP real: remitente, SPF, DKIM y DMARC.
- [ ] Migrar el SMTP y la llave de OpenAI a credenciales del cliente.
- [ ] Aprobar y publicar los cambios de interfaz.
- [ ] Aprobar el rediseño de correos antes de portarlo a `EmailNotifier.kt`.
- [ ] Completar la prueba controlada con un cliente/RFC.
- [ ] Definir responsable de monitoreo, alertas y soporte mensual.
- [ ] Definir dominio(s), certificados y buzón definitivos.
- [ ] Documentar RPO/RTO y probar una restauración real de DynamoDB.

## 6. Costos y titularidad

- La cuenta de AWS queda a nombre del cliente.
- AWS y los dominios los paga el cliente directamente; el costo depende del
  consumo y de la región. El modelo de IA lo cobra el emisor a $200 + IVA al mes.
- El cliente conserva la titularidad de sus datos, dominios y credenciales.
- Al terminar, se entregan accesos y credenciales; no se conservan copias ni
  accesos del cliente.
- El presupuesto de AWS es una **alerta**, no un tope de gasto.

## 7. Condiciones comerciales

| Concepto | Importe |
|---|---|
| Venta del código completo | **$25,000 MXN + IVA** |
| Opción de pago diferido | **2 pagos de $12,500 MXN + IVA** |
| Puesta en producción | **$3,500 MXN + IVA** por el primer mes |
| Soporte opcional | **$3,500 MXN + IVA** por mes activo |
| Modelo de IA | **$200 MXN + IVA** por mes |

La venta incluye repositorio, esquema de base de datos, documentación e
instalación base en la cuenta de AWS del cliente. No hay renta ni licencia
mensual.

La puesta en producción incluye configuración final, dominio, migración de
credenciales y datos, pruebas con un RFC real, capacitación, corte y 30 días de
acompañamiento.

El soporte es opcional y solo se paga los meses activos. Incluye análisis y
propuesta de una mejora o feature al mes sobre Pilli. Si el alcance cabe en el
mes, se implementa dentro de la misma iguala; si no, se avisa antes de empezar
para decidir si se agenda para el siguiente mes.

## 8. Facturación

- Facturación como **persona física**, con **CFDI** e **IVA (16%)**.
- La clienta comparte su constancia de situación fiscal para emitir la factura.
- Si el pago de la venta se difiere, se puede emitir un CFDI por cada exhibición.
- Los datos bancarios se entregan por un canal privado, no en este documento.
- El concepto fiscal de cada factura se confirma con el contador del emisor.

## 9. Checklist de entrega

- [ ] Constancia de situación fiscal recibida.
- [ ] Datos bancarios compartidos por canal privado.
- [ ] Factura(s) emitida(s) conforme al pago acordado.
- [ ] Accesos de AWS, OpenAI, SMTP y dominio entregados.
- [ ] Contraseña de admin cambiada.
- [ ] Alertas SNS confirmadas.
- [ ] SMTP/SPF/DKIM/DMARC verificados.
- [ ] Prueba controlada con un cliente/RFC completada.
- [ ] Interfaz y correos aprobados.
- [ ] Acta de aceptación y entrega firmada.
