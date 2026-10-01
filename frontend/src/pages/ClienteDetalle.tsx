import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Cliente, type Doc, parseCampos, pdfUrl, fechaCorta, haceRato, TIPO_LABEL } from '../lib/api'
import { Spinner, Vacio, EstadoBadge, Seccion, Alert } from '../components/ui'
import PdfViewer from '../components/PdfViewer'

type Campos = Record<string, string>

const STEP_RUNNING: Record<string, string> = {
  queued: 'En cola',
  login: 'Abriendo el portal SAT',
  captcha: 'Resolviendo captcha',
  descargando: 'Descargando el PDF',
  extrayendo: 'Leyendo el PDF'
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
  const [cargando, setCargando] = useState(true)
  const [freq, setFreq] = useState(25)
  const [tipos, setTipos] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ txt: string; bad?: boolean } | null>(null)
  const [sel, setSel] = useState<number>(0)
  const [corriendo, setCorriendo] = useState(false)
  const [job, setJob] = useState<any>(null)
  const intervalRef = useRef<any>(null)

  const load = useCallback(async () => {
    const [cl, ds] = await Promise.all([
      api('/clientes'),
      api('/docs/por-rfc', { method: 'POST', body: JSON.stringify({ rfc: RFC }) })
    ])
    if (Array.isArray(cl)) {
      const found = (cl as Cliente[]).find(x => (x.rfc || '').toUpperCase() === RFC)
      if (found) {
        setC(found)
        setFreq(Number(found.frecuenciaDias) || 25)
        setTipos((found.tipos || '').split(',').filter(Boolean))
      } else setC(null)
    }
    if (Array.isArray(ds)) setDocs((ds as Doc[]).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')))
    setCargando(false)
  }, [RFC])

  useEffect(() => { load() }, [load])

  async function guardar() {
    setGuardando(true); setMsg(null)
    try {
      const r: any = await api('/clientes/frecuencia', {
        method: 'POST',
        body: JSON.stringify({ rfc: RFC, frecuenciaDias: freq, tipos, activo: true })
      })
      if (r?.error) setMsg({ txt: r.detail || r.error, bad: true })
      else { setMsg({ txt: 'Frecuencia actualizada' }); await load() }
    } finally { setGuardando(false) }
  }

  async function correr() {
    setCorriendo(true); setJob({ status: 'queued', intentoCaptcha: 0 })
    const r: any = await api('/sat/solicitar', { method: 'POST', body: JSON.stringify({ rfc: RFC, tipos: ['32d'] }) })
    if (!r?.jobId) {
      // Sin jobId nunca habrá polling: hay que mostrar el motivo aquí mismo.
      setJob({ status: 'error', error: r?.error === 'SIN_CONEXION' ? (r.detail || 'Sin conexión con el backend') : (r?.detail || JSON.stringify(r)) })
      setCorriendo(false)
      return
    }
    const iv = setInterval(async () => {
      const st: any = await api('/sat/status', { method: 'POST', body: JSON.stringify({ jobId: r.jobId }) })
      if (st?.error) { clearInterval(iv); setCorriendo(false); setJob({ status: 'error', error: st.detail || st.error }); return }
      setJob(st)
      if (st.status === 'listo' || st.status === 'error') {
        clearInterval(iv); setCorriendo(false); await load()
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
            <p className="text-marino/60 mt-0.5">{c.nombre || 'Sin nombre registrado'}</p>
            {c.email && <p className="text-sm text-marino/45 mt-0.5">{c.email}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`badge ${c.tieneCiec === 'true' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${c.tieneCiec === 'true' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {c.tieneCiec === 'true' ? 'Contraseña SAT guardada' : 'Falta Contraseña SAT'}
            </span>
            <button className="btn-gold" onClick={correr} disabled={corriendo}>
              {corriendo ? <><Spinner small /> Corriendo…</> : 'Correr 32-D ahora'}
            </button>
          </div>
        </div>

        {/* El panel se queda visible al terminar: si se ocultara al dejar de correr,
            un fallo de captcha parecería que "no pasó nada". */}
        {job && (
          <div className="mt-4 anim-in">
            {job.status === 'listo' ? (
              <Alert variant="success" titulo="Listo: PDF descargado y dictamen leído">
                El PDF ya aparece en tu lista de documentos, más abajo.
                {job.intentoCaptcha ? ` Captcha resuelto en el intento ${job.intentoCaptcha}/4.` : ''}
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
                  {job.intentoCaptcha ? ` · captcha ${job.intentoCaptcha}/4` : ''}
                </span>
              </Alert>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5 content-start">
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
                    const blocked = t === 'constancia'
                    const on = tipos.includes(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={blocked}
                        title={blocked ? 'Pronto: falta la ruta de la Constancia en el portal SAT' : undefined}
                        onClick={() => setTipos(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                        className={`chip ${on ? 'bg-marino text-white border-marino' : ''} ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {TIPO_LABEL[t]}{blocked && ' · pronto'}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button className="btn" onClick={guardar} disabled={guardando}>
                {guardando ? <><Spinner small /> Guardando…</> : 'Guardar cambios'}
              </button>
              {msg && (
                <Alert variant={msg.bad ? 'danger' : 'success'} onClose={() => setMsg(null)}>
                  {msg.txt}
                </Alert>
              )}
            </div>
          </Seccion>

          <Seccion titulo="Documentos" desc={docs.length ? `${docs.length} descargado(s)` : undefined}>
            {docs.length === 0 ? (
              <Vacio titulo="Sin documentos" hint="Correr el bot descarga el PDF y lo deja aquí." />
            ) : (
              <div className="divide-y divide-line max-h-[420px] overflow-y-auto">
                {docs.map((d, i) => {
                  const dc = parseCampos(d)
                  return (
                    <button
                      key={d.docId}
                      onClick={() => setSel(i)}
                      className={`w-full text-left px-4 py-3 transition-colors ${i === sel ? 'bg-dorado/10 border-l-2 border-dorado' : 'hover:bg-hueso/60 border-l-2 border-transparent'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{TIPO_LABEL[d.tipo] || d.tipo}</span>
                        {d.tipo === '32d' ? <EstadoBadge sentido={dc.sentido} estado="vigente" /> : <span className="badge bg-sky-100 text-sky-800">{fechaCorta(dc.fechaEmision)}</span>}
                      </div>
                      <div className="text-xs text-marino/45 mt-0.5">
                        {dc.folio ? `Folio ${dc.folio}` : '—'} · {haceRato(d.createdAt)}
                      </div>
                    </button>
                  )
                })}
              </div>
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
    </div>
  )
}
