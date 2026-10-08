import { PageHeader, Seccion } from '../components/ui'

const GRUPOS = [
  {
    t: 'Lectura del portal',
    items: [
      ['SAT_HEADLESS', 'true', 'false para ver el navegador en pantalla mientras depuras'],
      ['SAT_MAX_LOGINS', '4', 'Intentos de login con captcha antes de dar la corrida por fallida'],
      ['SAT_CAPTCHA_LECTURAS', '14', 'Lecturas de imagen para consenso; pedir imagen NO gasta intentos del SAT'],
      ['SAT_LOGIN_URL', '…/nidp/app/login', 'Solo se usa para Constancia; la 32-D entra por su propia app']
    ]
  },
  {
    t: 'Captcha con IA',
    items: [
      ['LLM_API_URL', 'https://api.openai.com', 'Endpoint del proveedor de visión'],
      ['LLM_MODEL', 'gpt-4o', 'Modelo que lee la imagen del captcha'],
      ['LLM_API_KEY', '••••••••', 'Solo en el servidor, nunca en el navegador']
    ]
  },
  {
    t: 'Datos',
    items: [
      ['DYNAMO_URL', 'http://localhost:8000', 'DynamoDB local en desarrollo'],
      ['ACDAN_CLIENTES', 'ACDAN_CLIENTES', 'Tabla de contribuyentes'],
      ['ACDAN_JOBS', 'ACDAN_JOBS', 'Tabla de corridas, alimenta el progreso en vivo'],
      ['ACDAN_DOCS', 'ACDAN_DOCS', 'Tabla de documentos y dictamen']
    ]
  }
]

export default function Config() {
  return (
    <div className="grid gap-5">
      <PageHeader
        titulo="Configuración"
        desc="Todo se ajusta desde backend/.env. Reinicia el backend para que los cambios apliquen."
      />

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
          <li>La Contraseña SAT se cifra y se guarda en Secrets como <code className="text-[12px] bg-hueso border border-line px-1.5 py-0.5 rounded">sat:&#123;RFC&#125;</code>, nunca en la base de datos ni en el Excel.</li>
          <li>El backend nunca expone la credencial: el frontend solo consulta si existe.</li>
          <li>Los PDFs se guardan en <code className="text-[12px] bg-hueso border border-line px-1.5 py-0.5 rounded">storage/&#123;RFC&#125;/</code> y en producción en S3.</li>
          <li>Borrar un cliente elimina también su credencial y sus documentos.</li>
        </ul>
      </Seccion>
    </div>
  )
}
