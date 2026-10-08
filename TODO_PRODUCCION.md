# TODO rumbo a producción (Pilli Contable)

> La plataforma está sólida para piloto/demo. Esto es lo que falta antes de
> producción real. Si tomas un punto, avisa y commitea por feature.

## Seguridad
- [ ] Rate-limit en `POST /api/v1/auth/login` (hoy sin límite: expuesta a fuerza bruta).
- [ ] Cerrar CORS (`*` actual) a los orígenes reales al desplegar.
- [ ] Desactivar o proteger rutas `/api/v1/debug/*` fuera de local.
- [ ] Verificar `AUTH_JWT_SECRET` largo y único en el `.env` real (jamás el default).
- [ ] Revisar que ningún `.env` real esté commiteado (solo `.env.example`).

## Robustez del bot SAT
- [ ] Watchdog: matar navegador colgado y marcar el job `error` con timeout global.
- [ ] Backoff ante 403 del SAT (hoy: cooldown fijo de 3 min).
- [ ] Validar campos extraídos (si `sentido`/`folio` vacíos en 32-D, marcar revisión en vez de guardar silencioso).
- [ ] Tests automatizados del extractor con PDFs de ejemplo (sin pegar al SAT).
- [ ] Pool de bots configurable y cola con prioridad (hoy: 2 hilos fijos).

## Datos y scheduler
- [ ] Índice/consulta por `proximoRun` en vez de `scanItems` completo (escala).
- [ ] `terraform apply` del EventBridge Scheduler con el ARN real de la Lambda.
- [ ] Retención/limpieza de PDFs y jobs viejos.

## Emails
- [ ] Configurar SMTP real (`MAIL_USERNAME`/`MAIL_PASSWORD`) y prueba de envío.
- [ ] Aviso de “vence en 7 días” al cliente (el `EmailNotifier` ya existe).

## Coordinación entre agentes
- Commits por feature, nunca `git add -A` (hay trabajo paralelo sin commitear).
- No resetear passwords de `ACDAN_USERS` ni tocar credenciales de otros.
- El `portal.url` de la web y `VITE_*` dependen del entorno (local vs túnel vs prod).
