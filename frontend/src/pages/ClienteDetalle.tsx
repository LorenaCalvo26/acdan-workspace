import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, asItems, type Cliente, type Doc, parseCampos, pdfUrl, fechaCorta, haceRato, TIPO_LABEL } from '../lib/api'
import { useAuth } from '../lib/auth'
import { portalUrl, copiarTexto } from '../lib/portal'
import { Spinner, Vacio, EstadoBadge, Seccion, Alert } from '../components/ui'
import PdfViewer from '../components/PdfViewer'
import SaludSAT from '../components/SaludSAT'
import CfdiPanel from '../components/CfdiPanel'

type Campos = Record<string, string>

const STEP_RUNNING: Record<string, string> = {
  queued: 'En cola',
  login: 'Abriendo el portal SAT',
  captcha: 'Resolviendo captcha',
  descargando: 'Descargando el PDF',
  extrayendo: 'Leyendo el PDF'
}

// La bitácora clasifica el motivo para distinguir "se cayó el SAT" de "falló Pilli".
const FALLO_LABEL: Record<string, string> = {
  CAPTCHA: 'Captcha ilegible', SAT_CAIDO: 'SAT caído', SAT_SATURADO: 'SAT saturado',
  CREDENCIAL: 'Credencial', TIMEOUT_SAT: 'Timeout del SAT', OTRO: 'Otro', DESCONOCIDO: 'Sin clasificar',
}

function Fila({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  if (!v) return null
  return (
    <div className="flex items-baseline gap-3 py-2 border-b border-line/60 last:border-0">
      <span className="text-xs text-marino/50 w-32 shrink-0">{k}</span>
      <span className={`text-sm font-semibold break-words ${mono ? 'font-mono text-[13px]' : ''}`}>{v}</span>
    </div>
  )
}

export default function ClienteDetalle() {
  const { rfc = '' } = useParams()
  const RFC = rfc.toUpperCase()

  const [c, setC] = useState<Cliente | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [hist, setHist] = useState<any[]>([])
  const [editNombre, setEditNombre] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editCiec, setEditCiec] = useState('')
  const [editando, setEditando] = useState(false)
  const [editMsg, setEditMsg] = useState<{ txt: string; bad?: boolean } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [freq, setFreq] = useState(25)
  const [cfdiMensual, setCfdiMensual] = useState(true)
  const [tipos, setTipos] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ txt: string; bad?: boolean } | null>(null)
  const [sel, setSel] = useState<number>(0)
  const [corriendo, setCorriendo] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<'codigo' | 'liga' | null>(null)
  const [portalMsg, setPortalMsg] = useState<{ txt: string; bad?: boolean } | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const { jwt } = useAuth()

  const portalActivo = (c as any)?.portalActivo === 'true'
  const portalUltimo = (c as any)?.portalUltimoAcceso || ''
  const ligaPortal = portalUrl(RFC)

  async function copiar(que: 'codigo' | 'liga', texto: string) {
    const ok = await copiarTexto(texto)
    if (ok) {
      setCopiado(que)
      setTimeout(() => setCopiado(null), 2500)
    } else {
      setPortalMsg({ txt: 'No se pudo copiar. Selecciónalo a mano.', bad: true })
    }
  }

  async function generarCodigo() {
    if (!jwt || portalBusy) return
    setPortalBusy(true); setPortalMsg(null); setCopiado(null)
    try {
      const r: any = await api('/portal/codigo/generar', {
        method: 'POST',
        body: JSON.stringify({ token: jwt, rfc: RFC })
      })
      if (r?.ok && r?.codigo) {
        setCodigo(r.codigo as string)
        await load()
      } else setPortalMsg({ txt: r?.error || 'No se pudo generar el código.', bad: true })
    } finally {
      setPortalBusy(false)
    }
  }

  async function revocarCodigo() {
    if (!jwt || portalBusy) return
    setPortalBusy(true); setPortalMsg(null); setCodigo(null)
    try {
      const r: any = await api('/portal/codigo/revocar', {
        method: 'POST',
        body: JSON.stringify({ token: jwt, rfc: RFC })
      })
      if (r?.ok) {
        setPortalMsg({ txt: 'Acceso del cliente revocado.' })
        await load()
      } else setPortalMsg({ txt: r?.error || 'No se pudo revocar.', bad: true })
    } finally {
      setPortalBusy(false)
    }
  }

  async function copiarCodigo() {
    if (codigo) copiar('codigo', codigo)
  }
  const intervalRef = useRef<any>(null)

  const load = useCallback(async () => {
    const [cl, ds, hs] = await Promise.all([
      api('/clientes'),
      api('/docs/por-rfc', { method: 'POST', body: JSON.stringify({ rfc: RFC }) }),
      api('/sat/historial', { method: 'POST', body: JSON.stringify({ rfc: RFC }) })
    ])
    if (Array.isArray(ds)) setDocs((ds as Doc[]).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
    if (Array.isArray(hs)) setHist(hs as any[])
    const lista = asItems<Cliente>(cl)
    const found = lista.find(x => (x.rfc || '').toUpperCase() === RFC)
    if (found) {
      setC(found)
      setFreq(Number(found.frecuenciaDias) || 25)
      setCfdiMensual(found.cfdiMensual !== 'false')
      setTipos((found.tipos || '').split(',').filter(Boolean))
      setEditNombre(found.nombre || '')
      setEditEmail((found as any).email || '')
      setEditCiec('')
    } else setC(null)
    setCargando(false)
  }, [RFC])

  useEffect(() => { load() }, [load])

  async function guardarDatos() {
    setEditando(true); setEditMsg(null)
    try {
      // Contraseña vacía = se conserva (el backend solo rota con valor).
      const r: any = await api('/clientes', {
        method: 'POST',
        body: JSON.stringify({ rfc: RFC, nombre: editNombre, email: editEmail, ciec: editCiec, tipos, frecuenciaDias: freq, cfdiMensual })
      })
      if (r?.error) setEditMsg({ txt: r.detail || r.error, bad: true })
      else { setEditMsg({ txt: 'Datos actualizados' }); await load() }
    } finally { setEditando(false) }
  }

  async function guardar() {
    setGuardando(true); setMsg(null)
    try {
      const r: any = await api('/clientes/frecuencia', {
        method: 'POST',
        body: JSON.stringify({ rfc: RFC, frecuenciaDias: freq, tipos, activo: true, cfdiMensual })
      })
      if (r?.error) setMsg({ txt: r.detail || r.error, bad: true })
      else { setMsg({ txt: 'Frecuencia actualizada' }); await load() }
    } finally { setGuardando(false) }
  }

  async function correr() {
    setCorriendo(true); setJob({ status: 'queued', intentoCaptcha: 0 })
    // Un solo job con los tipos guardados del cliente: el bot los baja en la misma
    // sesión (SatBot recorre req.tipos) en vez de dos corridas con dos logins.
    const pedir = tipos.filter(t => t === '32d' || t === 'constancia')
    const tiposCorrer = pedir.length ? pedir : ['32d']
    const r: any = await api('/sat/solicitar', { method: 'POST', body: JSON.stringify({ rfc: RFC, tipos: tiposCorrer }) })
    if (!r?.jobId) {
      // Sin jobId nunca habrá polling: hay que mostrar el motivo aquí mismo.
      setJob({ status: 'error', error: r?.error === 'SIN_CONEXION' ? (r.detail || 'Sin conexión con el backend') : (r?.detail || JSON.stringify(r)) })
      setCorriendo(false)
      return
    }
    let fallos = 0
    const iv = setInterval(async () => {
      try {
        const st: any = await api('/sat/status', { method: 'POST', body: JSON.stringify({ jobId: r.jobId }) })
        if (st?.error) { clearInterval(iv); setCorriendo(false); setJob({ status: 'error', error: st.detail || st.error }); return }
        fallos = 0
        setJob(st)
        if (st.status === 'listo' || st.status === 'error') {
          clearInterval(iv); setCorriendo(false); await load()
        }
      } catch (e: any) {
        // Si el sondeo truena 5 veces seguidas, se detiene con mensaje en vez de girar eterno.
        fallos++
        if (fallos >= 5) {
          clearInterval(iv); setCorriendo(false)
          setJob({ status: 'error', error: `Se perdió contacto con el backend (${e?.message || e}). Recarga la página.` })
        }
      }
    }, 4000)
    intervalRef.current = iv
  }

  // Si el usuario se sale de la página, el polling sigue consultando al backend.
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const doc = docs[sel]
  const campos: Campos = doc ? parseCampos(doc) : {}

  if (cargando) return <div className="grid gap-3"><div className="skeleton h-24" /><div className="skeleton h-64" /></div>

  if (!c) {
    return (
      <div className="grid gap-4">
        <Link to="/clientes" className="text-sm text-marino/60 hover:text-marino">← Volver a clientes</Link>
        <div className="card"><Vacio titulo={`No existe el cliente ${RFC}`} hint="Puede que lo hayas borrado." accion={<Link to="/clientes" className="btn btn-sm">Ir a clientes</Link>} /></div>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div>
        <Link to="/clientes" className="text-sm text-marino/55 hover:text-marino transition-colors">← Clientes</Link>
      </div>

      <section className="card p-6 anim-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight font-pilli text-marino leading-tight">{c.rfc}</h1>
            <p className="text-marino/60 mt-0.5 break-words">{c.nombre || 'Sin nombre registrado'}</p>
            {c.email && <p className="text-sm text-marino/45 mt-0.5 break-all">{c.email}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`badge ${c.tieneCiec === 'true' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${c.tieneCiec === 'true' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {c.tieneCiec === 'true' ? 'Contraseña SAT guardada' : 'Falta Contraseña SAT'}
            </span>
            <button className="btn-gold w-full sm:w-auto" onClick={correr} disabled={corriendo}>
              {corriendo ? <><Spinner small /> Corriendo…</> : `Correr ${tipos.filter(t => t === '32d' || t === 'constancia').map(t => t === '32d' ? '32-D' : 'Constancia').join(' + ') || '32-D'} ahora`}
            </button>
          </div>
        </div>

        {/* El panel se queda visible al terminar: si se ocultara al dejar de correr,
            un fallo de captcha parecería que "no pasó nada". */}
        <div className="mt-4">
          <SaludSAT />
        </div>
        {job && (
          <div className="mt-4 anim-in">
            {job.status === 'listo' ? (
              <Alert variant="success" titulo="Listo: documentos descargados y dictamen leído">
                Los PDFs ya aparecen en tu lista de documentos, más abajo.
                {Number(job.intentoCaptcha) > 0 ? ` Captcha resuelto en el intento ${job.intentoCaptcha}/6.` : ''}
              </Alert>
            ) : job.status === 'error' ? (
              <Alert variant="danger" titulo="La corrida falló">
                <div className="break-words">{job.error}</div>
                {/captcha/i.test(job.error || '') && (
                  <div className="mt-1.5 text-rose-700/80">
                    El captcha lo resuelve una IA y no siempre acierta. Vuelve a correrlo: cada intento usa una imagen nueva.
                  </div>
                )}
              </Alert>
            ) : (
              <Alert variant="info" titulo="Procesando…">
                <span className="inline-flex items-center gap-2">
                  <Spinner small />
                  {STEP_RUNNING[job.status as string] || 'Trabajando en el portal SAT'}
                  {Number(job.intentoCaptcha) > 0 ? ` · captcha ${job.intentoCaptcha}/6` : ''}
                </span>
              </Alert>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5 content-start">
          <Seccion titulo="Datos del contribuyente" desc="Nombre, correo y Contraseña SAT (vacía se conserva)">
            <div className="px-6 py-5 grid gap-4">
              <div>
                <label className="label">Nombre o razón social</label>
                <input className="input" value={editNombre} onChange={e => setEditNombre(e.target.value)} placeholder="Nombre del contribuyente" />
              </div>
              <div>
                <label className="label">Correo (avisos y acceso al portal)</label>
                <input className="input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="correo@ejemplo.mx" />
              </div>
              <div>
                <label className="label">Contraseña SAT (solo para cambiarla)</label>
                <input className="input" type="password" value={editCiec} onChange={e => setEditCiec(e.target.value)} placeholder="Vacía = se conserva" autoComplete="new-password" />
              </div>
              <button className="btn" onClick={guardarDatos} disabled={editando}>
                {editando ? <><Spinner small /> Guardando…</> : 'Guardar datos'}
              </button>
              {editMsg && (
                <Alert variant={editMsg.bad ? 'danger' : 'success'} onClose={() => setEditMsg(null)}>
                  {editMsg.txt}
                </Alert>
              )}
            </div>
          </Seccion>

          <Seccion titulo="Frecuencia de monitoreo Pilli" desc="Cada cuánto se actualizan automáticamente sus trámites">
            <div className="px-6 py-5 grid gap-4">
              <div>
                <label className="label">Frecuencia (días)</label>
                <div className="flex gap-2">
                  <input className="input" type="number" min={1} value={freq} onChange={e => setFreq(Number(e.target.value) || 1)} />
                  <div className="flex gap-1.5 shrink-0">
                    {[25, 30, 90].map(d => (
                      <button key={d} className={`btn btn-sm ${freq === d ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setFreq(d)}>{d}</button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-marino/45 mt-1.5">La 32-D vence a los 30 días, por eso 25 días es lo seguro.</p>
              </div>

              <div>
                <label className="label">Documentos</label>
                <div className="flex flex-wrap gap-2">
                  {(['32d', 'constancia'] as const).map(t => {
                    const on = tipos.includes(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipos(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                        className={`chip ${on ? 'bg-marino text-white border-marino' : ''}`}
                      >
                        {TIPO_LABEL[t]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button className="btn" onClick={guardar} disabled={guardando}>
                {guardando ? <><Spinner small /> Guardando…</> : 'Guardar cambios'}
              </button>
              <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={cfdiMensual} onChange={e => setCfdiMensual(e.target.checked)} /><span>CFDI automático al cierre de cada mes: Emitidas y Recibidas con PDF/XML. Independiente de la frecuencia en días.</span></label>
              {msg && (
                <Alert variant={msg.bad ? 'danger' : 'success'} onClose={() => setMsg(null)}>
                  {msg.txt}
                </Alert>
              )}
            </div>
          </Seccion>

          <Seccion titulo="Acceso del cliente" desc="Landing con su reporte: la URL sola no abre nada sin el código">
            <div className="px-6 py-5 grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${portalActivo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-marino/8 text-marino/50 border border-line'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${portalActivo ? 'bg-emerald-500' : 'bg-marino/30'}`} />
                  {portalActivo ? 'Portal activo' : 'Sin acceso'}
                </span>
                {portalUltimo && (
                  <span className="text-xs text-marino/45">último acceso {haceRato(portalUltimo)}</span>
                )}
              </div>

              <div>
                <div className="label">Liga del portal para compartir</div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={ligaPortal}
                    onFocus={e => e.target.select()}
                    className="input !py-2 font-mono !text-xs min-w-0 flex-1"
                    aria-label="Liga del portal del cliente"
                  />
                  <button onClick={() => copiar('liga', ligaPortal)} className="btn-ghost btn-sm shrink-0">
                    {copiado === 'liga' ? '¡Copiada!' : 'Copiar'}
                  </button>
                </div>
              </div>

              {codigo ? (
                <div className="rounded-xl border border-dorado/50 bg-dorado/10 p-4 text-center anim-in">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-marino/50">Código de acceso (se muestra una sola vez)</div>
                  <div className="font-mono font-extrabold text-3xl tracking-[0.15em] text-marino mt-1">{codigo}</div>
                  <button onClick={copiarCodigo} className="btn-ghost btn-sm mt-3">
                    {copiado === 'codigo' ? '¡Copiado!' : 'Copiar código'}
                  </button>
                  <p className="text-xs text-marino/55 mt-2">Manda liga + código por WhatsApp o en persona.</p>
                </div>
              ) : (
                <p className="text-xs text-marino/55 leading-relaxed">
                  Genera un código de 8 caracteres para que el cliente vea su reporte. Regenerar invalida el anterior.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button className="btn-gold btn-sm" onClick={generarCodigo} disabled={portalBusy}>
                  {portalBusy ? <><Spinner small /> Procesando…</> : portalActivo ? 'Regenerar código' : 'Generar código'}
                </button>
                {portalActivo && (
                  <button className="btn-ghost btn-sm" onClick={revocarCodigo} disabled={portalBusy}>
                    Revocar acceso
                  </button>
                )}
              </div>

              {portalMsg && (
                <Alert variant={portalMsg.bad ? 'danger' : 'success'} onClose={() => setPortalMsg(null)}>
                  {portalMsg.txt}
                </Alert>
              )}
            </div>
          </Seccion>

          <Seccion titulo="Documentos" desc={docs.length ? `${docs.length} descargado(s) · agrupados por tipo` : undefined}>
            {docs.length === 0 ? (
              <Vacio titulo="Sin documentos" hint="Correr el bot descarga el PDF y lo deja aquí." />
            ) : (
              <div className="divide-y divide-line max-h-[460px] overflow-y-auto">
                {(['32d', 'constancia'] as const).map(t => {
                  const delTipo = docs
                    .map((d, i) => ({ d, i }))
                    .filter(x => x.d.tipo === t)
                    .sort((a, b) => (b.d.createdAt || '').localeCompare(a.d.createdAt || ''))
                  if (delTipo.length === 0) return null
                  return (
                    <div key={t}>
                      <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-marino/45">
                          {TIPO_LABEL[t] || t}
                        </span>
                        <span className="text-[11px] font-semibold text-marino/35 tabular-nums">
                          {delTipo.length} descarga{delTipo.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {delTipo.map(({ d, i }, idx) => {
                        const dc = parseCampos(d)
                        return (
                          <button
                            key={d.docId}
                            onClick={() => setSel(i)}
                            className={`w-full text-left px-4 py-3 transition-colors ${i === sel ? 'bg-dorado/10 border-l-2 border-dorado' : 'hover:bg-hueso/60 border-l-2 border-transparent'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold flex items-center gap-2 min-w-0">
                                {idx === 0 && (
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0">
                                    Vigente
                                  </span>
                                )}
                                <span className="truncate">{dc.folio ? `Folio ${dc.folio}` : fechaCorta(d.createdAt)}</span>
                              </span>
                              {d.tipo === '32d' ? <EstadoBadge sentido={dc.sentido} estado="vigente" /> : <span className="badge bg-sky-100 text-sky-800 shrink-0">{fechaCorta(dc.fechaEmision || d.createdAt)}</span>}
                            </div>
                            <div className="text-xs text-marino/45 mt-0.5">
                              {haceRato(d.createdAt)}{dc.fechaEmision ? ` · emitida ${fechaCorta(dc.fechaEmision)}` : ''}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </Seccion>

          <Seccion titulo="Bitácora" desc={hist.length ? `${hist.length} corrida(s) · todo fallo se reintenta solo` : undefined}>
            {hist.length === 0 ? (
              <p className="px-6 py-5 text-sm text-marino/45">Sin corridas todavía. Aquí queda cada intento, con su motivo si falla.</p>
            ) : (
              <ol className="divide-y divide-line max-h-[380px] overflow-y-auto">
                {hist.map(j => {
                  const st = j.status || ''
                  const badge = st === 'listo' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : st === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : st === 'parcial' ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-sky-50 text-sky-800 border border-sky-200'
                  const tiposTxt = String(j.tipos || '').split(',').filter(Boolean).map(t => TIPO_LABEL[t] || t).join(' + ') || '—'
                  return (
                    <li key={j.jobId} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`badge ${badge}`}>{st || '—'}</span>
                        <span className="text-[11px] text-marino/45">{haceRato(j.updatedAt)}</span>
                      </div>
                      <div className="text-xs font-semibold text-marino mt-1">{tiposTxt}{j.periodo ? ` · ${j.periodo}` : ''}</div>
                      {j.failureTipo ? <div className="text-[11px] font-bold text-marino/60 mt-0.5">Motivo: {FALLO_LABEL[j.failureTipo] || j.failureTipo}</div> : null}
                      {j.error ? <div className="text-xs text-rose-700/90 break-words mt-0.5">{j.error}</div> : null}
                      {(Number(j.captchaLogins) > 0 || Number(j.intentoCaptcha) > 0) && <div className="text-[11px] text-marino/45 mt-0.5">captcha: {j.captchaLogins || j.intentoCaptcha} envío(s){Number(j.captchaLecturas) > 0 ? ` · ${j.captchaLecturas} imágenes leídas` : ''}</div>}
                    </li>
                  )
                })}
              </ol>
            )}
          </Seccion>
        </div>

        <Seccion titulo={doc ? TIPO_LABEL[doc.tipo] || doc.tipo : 'Vista previa'} desc={doc ? `Descargado ${haceRato(doc.createdAt)}` : 'Selecciona un documento'}>
          {!doc ? (
            <Vacio titulo="Nada que mostrar" hint="Aquí verás el PDF y los datos extraídos." />
          ) : (
            <div className="grid gap-4">
              {doc.tipo === '32d' && (
                <div className="px-6 pt-5">
                  <EstadoBadge sentido={campos.sentido} estado="vigente" />
                </div>
              )}

              <div className="px-6">
                <div className="text-xs font-bold uppercase tracking-wider text-marino/45 mb-1">Datos extraídos</div>
                {doc.tipo === '32d' ? (
                  <>
                    <Fila k="Nombre" v={campos.nombre} />
                    <Fila k="RFC" v={campos.rfc} mono />
                    <Fila k="Folio" v={campos.folio} mono />
                    <Fila k="Fecha de emisión" v={campos.fechaEmision} />
                    {campos.detalle && (
                      <div className="mt-3 rounded-lg bg-hueso/70 border border-line p-3">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-marino/45 mb-1">Resultado</div>
                        <p className="text-[13px] leading-relaxed text-marino/75">{campos.detalle}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Fila k="Nombre" v={campos.nombre} />
                    <Fila k="RFC" v={campos.rfc} mono />
                    <Fila k="CURP" v={campos.curp} mono />
                    <Fila k="Régimen" v={campos.regimen} />
                    <Fila k="C.P." v={campos.cp} mono />
                    <Fila k="Fecha de emisión" v={campos.fechaEmision} />
                  </>
                )}
              </div>

              <div className="px-6 pb-6">
                <div className="text-xs font-bold uppercase tracking-wider text-marino/45 mb-2">PDF original</div>
                <PdfViewer url={pdfUrl(doc.rfc, doc.docId)} nombre={doc.docId} />
              </div>
            </div>
          )}
        </Seccion>
      </div>
      {jwt && <CfdiPanel rfc={RFC} token={jwt} />}
    </div>
  )
}
