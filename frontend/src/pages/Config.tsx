const GRUPOS = [
  {
    t: 'Lectura del portal',
    items: [
      ['SAT_HEADLESS', 'true', 'false para ver el navegador en pantalla mientras depuras'],
      ['SAT_MAX_CAPTCHA_RETRIES', '3', 'Intentos de captcha antes de dar la corrida por fallida'],
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
      <section className="card p-5 anim-in">
        <h1 className="text-xl font-bold">Configuración</h1>
        <p className="text-sm text-marino/55 mt-1">
          Todo se ajusta desde <code className="text-[12px] bg-hueso px-1.5 py-0.5 rounded">backend/.env</code>.
          Reinicia el backend para que los cambios apliquen.
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {GRUPOS.map(g => (
          <section key={g.t} className="card overflow-hidden anim-in">
            <header className="px-5 py-3.5 border-b border-line">
              <h2 className="font-bold text-sm">{g.t}</h2>
            </header>
            <div className="divide-y divide-line/70">
              {g.items.map(([k, v, d]) => (
                <div key={k} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-[12px] font-semibold bg-hueso px-1.5 py-0.5 rounded">{k}</code>
                    <code className="text-[12px] text-marino/60">{v}</code>
                  </div>
                  <p className="text-xs text-marino/45 mt-1">{d}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="card p-5 anim-in">
        <h2 className="font-bold text-sm mb-2">Seguridad</h2>
        <ul className="text-sm text-marino/70 grid gap-2 list-disc pl-5">
          <li>La Contraseña SAT se cifra y se guarda en Secrets como <code className="text-[12px] bg-hueso px-1.5 py-0.5 rounded">sat:&#123;RFC&#125;</code>, nunca en la base de datos ni en el Excel.</li>
          <li>El backend nunca expone la credencial: el frontend solo consulta si existe.</li>
          <li>Los PDFs se guardan en <code className="text-[12px] bg-hueso px-1.5 py-0.5 rounded">storage/&#123;RFC&#125;/</code> y en producción en S3.</li>
          <li>Borrar un cliente elimina también su credencial y sus documentos.</li>
        </ul>
      </section>
    </div>
  )
}
