import { Link } from 'react-router-dom'
import { Alert, PageHeader, Seccion } from '../components/ui'

const FLUJOS = [
  {
    titulo: 'Opinión de cumplimiento 32-D',
    cuando: 'En la fecha mensual del cliente',
    descripcion: 'Se ejecuta en la próxima fecha programada del cliente, si 32-D está seleccionado. Después se repite el mismo día de cada mes.',
    resultado: 'PDF original, dictamen y datos extraídos.',
    manual: 'Detalle del cliente → Correr 32-D ahora.'
  },
  {
    titulo: 'Constancia de situación fiscal',
    cuando: 'En la fecha mensual del cliente',
    descripcion: 'Comparte la fecha programada con la Opinión 32-D, pero entra a su propia aplicación del SAT. Debe estar seleccionada entre los documentos del cliente.',
    resultado: 'PDF original y datos fiscales extraídos.',
    manual: 'Clientes → Correr ahora → seleccionar Constancia.'
  },
  {
    titulo: 'CFDI: Emitidas y Recibidas',
    cuando: 'Al cierre de cada mes',
    descripcion: 'Después de terminar el último día, consulta el mes completo: del día 1 a las 00:00:00 al último día a las 23:59:59. Usa la zona America/Mexico_City.',
    resultado: 'Tablas por mes, clasificación fiscal, Excel con dos hojas y XML/PDF por folio cuando el SAT los ofrece.',
    manual: 'Detalle del cliente → CFDI mensuales → elegir mes cerrado → Sincronizar mes.'
  }
]

const CORREOS = [
  {
    tipo: '32-D',
    tono: 'bg-sky-50 text-sky-700 border border-sky-100',
    nombre: 'Cliente · Opinión positiva',
    para: 'Cliente',
    cuando: 'Termina una corrida 32-D con dictamen POSITIVO y el cliente tiene email válido.',
    frecuencia: '1 por corrida 32-D positiva.',
    nota: 'Mensual ≈ 1 vez al mes; cliente viejo, cada N días. Una corrida manual también genera otro correo.'
  },
  {
    tipo: '32-D',
    tono: 'bg-sky-50 text-sky-700 border border-sky-100',
    nombre: 'Admin · Dictamen',
    para: 'Admins',
    cuando: 'Termina una corrida 32-D, sea positivo, negativo o sin resultado.',
    frecuencia: '1 por corrida 32-D que llegue a guardar el PDF.',
    nota: 'Si el job falla antes, no sale este correo: sale “Admin · Fallo”.'
  },
  {
    tipo: 'Fallo',
    tono: 'bg-rose-50 text-rose-700 border border-rose-100',
    nombre: 'Admin · Fallo',
    para: 'Admins',
    cuando: 'Falla un job de 32-D, constancia o CFDI.',
    frecuencia: '1 por fallo. Puede repetirse en reintentos.',
    nota: 'Si falta CIEC, se marca tieneCiec=false y ya no se reintenta hasta recapturarla.'
  },
  {
    tipo: 'Evento',
    tono: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    nombre: 'Cliente · Bienvenida',
    para: 'Cliente',
    cuando: 'Se genera o regenera su código de acceso al portal: alta con email, alta masiva o botón Generar código.',
    frecuencia: '1 por generación de código.',
    nota: 'No se manda al re-guardar un cliente que ya tenía email y portal activo. Sin email, no sale.'
  },
  {
    tipo: '32-D',
    tono: 'bg-sky-50 text-sky-700 border border-sky-100',
    nombre: 'Cliente · Vencimiento',
    para: 'Cliente',
    cuando: 'Dentro de una corrida 32-D, la opinión consultada vence en 0 a 7 días.',
    frecuencia: '1 por corrida 32-D que caiga en esa ventana.',
    nota: 'No es un cron aparte. Puede repetirse mientras siga por vencer; se detiene cuando se renueva.'
  },
  {
    tipo: 'Una vez',
    tono: 'bg-amber-50 text-amber-700 border border-amber-100',
    nombre: 'Staff · Bienvenida',
    para: 'Nuevo usuario',
    cuando: 'Se crea un usuario ADMIN u OPERADOR desde el panel.',
    frecuencia: '1 por alta de usuario.',
    nota: 'No se reenvía al editar el usuario ni al cambiar contraseña. No incluye contraseña.'
  },
  {
    tipo: 'Cada envío',
    tono: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
    nombre: 'Prospecto · Acuse de contacto',
    para: 'Prospecto',
    cuando: 'Se envía el formulario de contacto del sitio web.',
    frecuencia: '1 por envío, si el email es válido.',
    nota: 'Es inmediato. Si el prospecto manda dos veces, llegan dos acuses.'
  },
  {
    tipo: 'Cada envío',
    tono: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
    nombre: 'Admin · Nuevo lead',
    para: 'Admins',
    cuando: 'Se envía el formulario de contacto del sitio web.',
    frecuencia: '1 por envío, a cada admin.',
    nota: 'Se manda junto con el acuse al prospecto. Si el prospecto no tiene email válido, solo llega a admins.'
  }
]

const GRUPOS = [
  {
    t: 'Portal SAT (automatización del bot)',
    items: [
      ['SAT_HEADLESS', 'true', 'false para ver el navegador en pantalla mientras depuras'],
      ['SAT_MAX_LOGINS', '4', 'Intentos de login con captcha antes de dar la corrida por fallida'],
      ['SAT_CAPTCHA_LECTURAS', '14', 'Lecturas de imagen para consenso; pedir imagen NO gasta intentos del SAT'],
      ['SAT_LOGIN_URL', 'https://loginda.siat.sat.gob.mx/nidp/app/login', 'Entrada genérica. Cada trámite usa la entrada de su propia aplicación y resuelve su login si no hereda sesión.'],
      ['32-D: entrada de la aplicación', 'https://ptsc32d.clouda.sat.gob.mx/', 'Actualmente está fija en el código; no hay una variable SAT_32D_URL. La aplicación genera su redirección de login.'],
      ['SAT_CONSTANCIA_URL', 'https://wwwmat.sat.gob.mx/app/seg/cont/accesoC', 'Entrada a la aplicación de acuses. El valor completo, con sus parámetros, está en backend/.env.example y como valor predeterminado del bot.'],
      ['SAT_CFDI_URL', 'https://portalcfdi.facturaelectronica.sat.gob.mx/', 'Home del portal CFDI: redirige a su propio login y después permite consultar Emitidas y Recibidas.']
    ]
  },
  {
    t: 'Programador y cierre mensual',
    items: [
      ['ACDAN_SCHEDULER_ENABLED', 'true por defecto', 'Habilita el tick automático del servidor local: comienza un minuto después de arrancar y luego se repite cada hora. En AWS el tick se invoca mediante EventBridge.'],
      ['proximoRun / programación mensual', 'Por cliente', 'La fecha elegida es la próxima corrida de la Opinión 32-D y la Constancia; después se repite el mismo día de cada mes. Los clientes antiguos conservan frecuenciaDias.'],
      ['ordenCfdi', 'Por cliente', 'Orden de ejecución de los CFDI pendientes. Se cambia arrastrando las filas en Contribuyentes; no adelanta fechas.'],
      ['cfdiMensual', 'Habilitado por defecto', 'Se activa o desactiva por cliente en Programación mensual de Pilli. Su calendario es independiente de la fecha mensual.'],
      ['cfdiDesde', 'Mes de alta para clientes nuevos', 'El primer barrido automático corresponde al mes en que se registra el cliente, una vez cerrado.'],
      ['Zona horaria del cierre', 'America/Mexico_City', 'Un mes se considera cerrado después de medianoche del primer día del siguiente mes; el tick horario lo encola cuando detecta que está pendiente.']
    ]
  },
  {
    t: 'Portal del cliente (Pilli)',
    items: [
      ['PORTAL_JWT_DIAS', '30', 'Vigencia de la sesión del cliente con “recordar”'],
      ['Código de acceso', '8 caracteres', 'Hash SHA-256+salt; se muestra una sola vez al generarlo'],
      ['Límite de intentos', '8 / 10 min', 'Por RFC; después responde BLOQUEADO_TEMPORAL'],
      ['Rutas /api/v1/portal/*', 'entrar, sesion, resumen, docs, pdf', 'La sesión del portal identifica al cliente por su RFC.'],
      ['Consultas y archivos CFDI', '/api/v1/cfdi/listar y /api/v1/cfdi/archivo', 'El cliente puede consultar y descargar solo lo de su RFC. La sincronización manual está reservada al personal.']
    ]
  },
  {
    t: 'Captcha con IA',
    items: [
      ['LLM_API_URL', 'https://api.openai.com', 'Endpoint del proveedor de visión'],
      ['LLM_MODEL', 'Según configuración del servidor', 'Modelo de visión que lee la imagen del captcha'],
      ['LLM_API_KEY', 'Solo en el servidor', 'La clave se configura en el backend; esta vista no consulta ni muestra su valor.']
    ]
  },
  {
    t: 'Datos',
    items: [
      ['DYNAMO_URL', 'http://localhost:8000', 'DynamoDB local en desarrollo'],
      ['ACDAN_CLIENTES', 'ACDAN_CLIENTES', 'Tabla de contribuyentes'],
      ['ACDAN_JOBS', 'ACDAN_JOBS', 'Tabla de corridas, alimenta el progreso en vivo'],
      ['ACDAN_DOCS', 'ACDAN_DOCS', 'Documentos, dictámenes, registros CFDI y resúmenes de cierre mensual'],
      ['Archivos de Opinión / Constancia', 'storage/{RFC}/', 'Ubicación local de los PDFs descargados.'],
      ['Archivos CFDI', 'cfdi-storage/{RFC}/{mes}/{vista}/', 'XML, PDF y acuses; se descargan mediante la API con sesión y validación del RFC.']
    ]
  }
]

export default function Config() {
  return (
    <div className="grid gap-5">
      <PageHeader
        titulo="Configuración"
        desc="Programación por cliente, funcionamiento de cada trámite y referencia de la configuración del servidor."
        accion={<Link to="/clientes" className="btn-gold btn-sm">Configurar clientes</Link>}
      />

      <Alert variant="info" titulo="El alta programa la primera corrida; no descarga inmediatamente">
        Al guardar el contribuyente se resguarda su credencial y se fija la fecha de la próxima ejecución.
        Si el alta trae fecha, la primera corrida es esa fecha y hora; el tick horario puede ejecutarla hasta ~1 hora después. Luego se repite el mismo día de cada mes.
        Si no trae fecha (compatibilidad con Excel viejo), la primera corrida se programa con un jitter de 0 a 120 minutos; el tick horario la toma en la siguiente pasada y después sigue la frecuencia en días (25 por defecto).
        El formulario de alta manual activa por defecto 32-D y Constancia; puedes ajustarlos antes de guardar.
        Para obtener documentos hoy, usa las acciones de ejecución manual.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-3">
        {FLUJOS.map(f => (
          <Seccion key={f.titulo} titulo={f.titulo} desc={f.cuando}>
            <div className="px-6 py-5 grid gap-4 text-sm text-marino/70">
              <p>{f.descripcion}</p>
              <div><div className="text-xs font-bold text-marino mb-1">Qué aparece al terminar</div><p>{f.resultado}</p></div>
              <div className="rounded-xl border border-line bg-hueso/60 p-3"><div className="text-xs font-bold text-marino mb-1">Ejecutar ahora</div><p className="text-xs leading-relaxed">{f.manual}</p></div>
            </div>
          </Seccion>
        ))}
      </div>

      <Seccion titulo="Correos automáticos" desc="Qué correo sale, a quién y cada cuándo">
        <div className="px-4 sm:px-6 py-5 grid gap-4">
          <Alert variant="info" titulo="La frecuencia depende de la corrida, no de un cron de correo">
            Los correos de 32-D salen cuando el bot corre el RFC: mensual o cada <code className="text-[12px] bg-white/70 border border-sky-200 px-1 py-0.5 rounded">frecuenciaDias</code>.
            Los demás son eventos puntuales. El scheduler revisa cada hora, pero no manda correos por sí mismo.
          </Alert>

          <div className="overflow-x-auto rounded-xl border border-line/70">
            <table className="table min-w-[820px]">
              <thead>
                <tr>
                  <th style={{ width: '27%' }}>Correo</th>
                  <th style={{ width: '11%' }}>Para</th>
                  <th style={{ width: '30%' }}>Se envía cuando</th>
                  <th style={{ width: '32%' }}>Frecuencia real</th>
                </tr>
              </thead>
              <tbody>
                {CORREOS.map(c => (
                  <tr key={c.nombre}>
                    <td className="align-top">
                      <span className={`badge ${c.tono}`}>{c.tipo}</span>
                      <div className="mt-1.5 font-bold text-marino">{c.nombre}</div>
                    </td>
                    <td className="align-top text-marino/70">{c.para}</td>
                    <td className="align-top text-marino/70">{c.cuando}</td>
                    <td className="align-top">
                      <div className="font-semibold text-marino">{c.frecuencia}</div>
                      <div className="text-[11px] leading-snug text-marino/50 mt-1">{c.nota}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-marino/50">
            Los correos al cliente solo salen si su dirección tiene un formato válido. El orden CFDI no cambia las fechas de 32-D.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-hueso/40 p-3">
              <div className="text-xs font-bold text-marino mb-1">Interruptor general</div>
              <p className="text-[11px] leading-relaxed text-marino/55">Si <code className="text-[11px]">NOTIFICAR_EMAILS=false</code>, no se envía ninguno: ni al cliente ni a los admins.</p>
            </div>
            <div className="rounded-xl border border-line bg-hueso/40 p-3">
              <div className="text-xs font-bold text-marino mb-1">Destinatarios admin</div>
              <p className="text-[11px] leading-relaxed text-marino/55">Cada usuario ADMIN activo de <code className="text-[11px]">ACDAN_USERS</code>, más el buzón <code className="text-[11px]">CONTACT_ADMIN_EMAIL</code>. Sin duplicados.</p>
            </div>
            <div className="rounded-xl border border-line bg-hueso/40 p-3">
              <div className="text-xs font-bold text-marino mb-1">Sin deduplicación</div>
              <p className="text-[11px] leading-relaxed text-marino/55">En correos de jobs o formularios, correr dos veces o reenviar el formulario puede duplicar el correo. La bienvenida solo sale al generar un código nuevo.</p>
            </div>
            <div className="rounded-xl border border-line bg-hueso/40 p-3">
              <div className="text-xs font-bold text-marino mb-1">CFDI y constancia</div>
              <p className="text-[11px] leading-relaxed text-marino/55">Un CFDI exitoso no manda correo; solo puede generar “Admin · Fallo” si falla. Una constancia exitosa tampoco notifica.</p>
            </div>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Cómo interpretar los resultados" desc="Estados de ejecución, disponibilidad de archivos y clasificación">
        <dl className="px-6 py-5 grid gap-5 sm:grid-cols-2 text-sm text-marino/70">
          <div><dt className="font-bold text-marino mb-1">Una corrida solo ejecuta lo que se solicita</dt><dd>Sincronizar CFDI no genera la Opinión ni la Constancia. En Clientes → Correr ahora puedes seleccionar ambos documentos para descargarlos en la misma corrida.</dd></div>
          <div><dt className="font-bold text-marino mb-1">Completo, parcial y error</dt><dd>Completo indica que se procesaron los registros y se guardaron los archivos ofrecidos. Parcial conserva los datos y señala archivos pendientes. Error informa que no se pudo terminar. Los reintentos reutilizan archivos válidos.</dd></div>
          <div><dt className="font-bold text-marino mb-1">Primer mes y reintentos</dt><dd>Un cliente nuevo espera el cierre de su mes de alta. Por ejemplo, un alta de octubre se barre en noviembre para consultar todo octubre. El programador omite meses completos y reintenta los incompletos antes de avanzar.</dd></div>
          <div><dt className="font-bold text-marino mb-1">Archivos que ofrece el SAT</dt><dd>La tabla puede incluir cancelados. Algunos solo ofrecen acuse y carecen de acciones para recuperar el XML o la representación impresa; su disponibilidad se muestra por registro.</dd></div>
          <div><dt className="font-bold text-marino mb-1">Clasificación desde el XML</dt><dd>Ingreso: factura; Egreso: nota de crédito; Pago: complemento de pago; Nómina: ordinaria o extraordinaria; Traslado. También se conserva la versión del complemento de nómina o pagos.</dd></div>
          <div><dt className="font-bold text-marino mb-1">Pago y factura liquidada</dt><dd>Un complemento de pago puede cubrir una parcialidad. Para determinar si una factura quedó liquidada hay que relacionar su UUID y revisar los saldos reportados; esa conciliación todavía no se muestra como estado de pago.</dd></div>
        </dl>
      </Seccion>

      <div>
        <h2 className="font-bold text-lg text-marino">Referencia técnica del servidor</h2>
        <p className="text-sm text-marino/55 mt-1">Los valores de abajo son referencias y valores predeterminados, no una lectura en vivo del backend. Las variables se ajustan en backend/.env y requieren reiniciar el backend. La programación mensual, los documentos y CFDI mensual se guardan desde el detalle del cliente.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 items-start">
        {GRUPOS.map(g => (
          <Seccion key={g.t} titulo={g.t}>
            <div className="divide-y divide-line/60">
              {g.items.map(([k, v, d]) => (
                <div key={k} className="px-6 py-3.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-[12px] font-semibold bg-hueso border border-line px-1.5 py-0.5 rounded break-all">{k}</code>
                    <code className="text-[12px] text-marino/60 break-all">{v}</code>
                  </div>
                  <p className="text-xs text-marino/50 mt-1">{d}</p>
                </div>
              ))}
            </div>
          </Seccion>
        ))}
      </div>

      <Seccion titulo="Seguridad" desc="Cómo protegemos las credenciales y los documentos">
        <ul className="px-6 py-5 text-sm text-marino/70 grid gap-2.5 list-disc pl-9">
          <li>La Contraseña SAT se cifra y se guarda en el almacén de credenciales de AWS (SSM SecureString), nunca en la base de datos ni en el Excel.</li>
          <li>El backend nunca expone la credencial: el frontend solo consulta si existe.</li>
          <li>Los PDFs de Opinión y Constancia se guardan localmente en <code className="text-[12px] bg-hueso border border-line px-1.5 py-0.5 rounded">storage/&#123;RFC&#125;/</code>.</li>
          <li>Los archivos CFDI se guardan en <code className="text-[12px] bg-hueso border border-line px-1.5 py-0.5 rounded">cfdi-storage/</code>, fuera del directorio público de PDFs. La API valida la sesión y el RFC al descargarlos.</li>
          <li>Borrar un cliente elimina también su credencial y sus documentos.</li>
        </ul>
      </Seccion>
    </div>
  )
}
