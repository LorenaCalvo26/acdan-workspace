import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Cliente, type Resumen, type Doc, parseCampos, TIPO_LABEL, fechaCorta, haceRato, pdfUrl } from '../lib/api'
import UploadExcel from '../components/UploadExcel'
import ClienteForm from '../components/ClienteForm'
import { Spinner, Vacio, EstadoBadge, Seccion, Alert, ConfirmDialog } from '../components/ui'

const STEP_LABEL: Record<string, string> = {
  queued: 'En cola',
  login: 'Abriendo portal SAT',
  captcha: 'Resolviendo captcha',
  descargando: 'Descargando PDF',
  extrayendo: 'Leyendo el PDF',
  listo: 'Terminado',
  error: 'Falló'
}
const STEP_ORDER = ['queued', 'login', 'captcha', 'descargando', 'extrayendo', 'listo']

function Progress({ job }: { job: any }) {
  const idx = job.status === 'error' ? -1 : STEP_ORDER.indexOf(job.status)
  const activo = job.status !== 'listo' && job.status !== 'error'
  return (
    <div className="rounded-xl border border-line bg-hueso/60 p-4">
      <div className="flex items-center gap-2.5 mb-3">
        {activo && <Spinner small />}
        <span className="text-sm font-bold">
          {STEP_LABEL[job.status] || job.status}
          {job.status === 'captcha' && job.intentoCaptcha ? ` · intento ${job.intentoCaptcha}/3` : ''}
        </span>
        {activo && <span className="text-xs text-marino/45">{job.rfc}</span>}
      </div>

      <div className="flex items-center gap-1">
        {STEP_ORDER.map((s, i) => {
          const done = idx > i
          const cur = job.status === s
          return (
            <div key={s} className="flex-1 flex items-center gap-1 min-w-0">
              <div className="h-1.5 rounded-full flex-1 transition-colors duration-300"
                style={{ background: done ? '#10B981' : cur ? '#C9A86A' : 'rgba(15,42,68,0.12)' }} />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        {STEP_ORDER.map(s => (
          <span key={s} className={`text-[10px] font-semibold ${job.status === s ? 'text-dorado' : 'text-marino/35'}`}>
            {STEP_LABEL[s].split(' ')[0]}
          </span>
        ))}
      </div>

      {job.error && (
        <Alert variant="danger" titulo="La corrida no pudo completarse" className="mt-3">
          <div className="break-words">{job.error}</div>
        </Alert>
      )}
    </div>
  )
}

export default function Clientes() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Cliente[]>([])
  const [resumen, setResumen] = useState<Record<string, Resumen>>({})
  const [loadingList, setLoadingList] = useState(true)
  const [rfcRun, setRfcRun] = useState('')
  const [tiposRun, setTiposRun] = useState<string[]>(['32d'])
  const [running, setRunning] = useState(false)
  const [deleting, setDeleting] = useState('')
  const [porBorrar, setPorBorrar] = useState<string | null>(null)
  const [job, setJob] = useState<any>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [toast, setToast] = useState<{ txt: string; bad?: boolean } | null>(null)
  const timer = useRef<any>(null)

  const avisar = (txt: string, bad = false) => {
    setToast({ txt, bad })
    setTimeout(() => setToast(null), 4000)
  }

  async function load() {
    setLoadingList(true)
    try {
      const [cl, rs] = await Promise.all([api('/clientes'), api('/clientes/resumen')])
      if (Array.isArray(cl)) setItems(cl)
      if (Array.isArray(rs)) setResumen(Object.fromEntries((rs as Resumen[]).map(r => [r.rfc, r])))
    } finally { setLoadingList(false) }
  }

  useEffect(() => { load(); return () => clearInterval(timer.current) }, [])

  async function correrBot() {
    if (!rfcRun.trim() || running) return
    const rfc = rfcRun.trim().toUpperCase()
    setRunning(true)
    setDocs([])
    setJob({ status: 'queued', intentoCaptcha: 0, rfc })
    try {
      const res: any = await api('/sat/solicitar', { method: 'POST', body: JSON.stringify({ rfc, tipos: tiposRun }) })
      const jobId = res?.jobId
      if (!jobId) { setJob({ status: 'error', rfc, error: res?.detail || JSON.stringify(res) }); setRunning(false); return }
      clearInterval(timer.current)
      timer.current = setInterval(async () => {
        const st: any = await api('/sat/status', { method: 'POST', body: JSON.stringify({ jobId }) })
        setJob({ ...st, rfc })
        if (st.status === 'listo' || st.status === 'error') {
          clearInterval(timer.current)
          setRunning(false)
          if (st.status === 'listo') {
            const d: any = await api('/docs/por-rfc', { method: 'POST', body: JSON.stringify({ rfc }) })
            if (Array.isArray(d)) setDocs(d)
            await load()
            avisar('Listo: PDF descargado y dictamen leído')
          } else {
            avisar(st.error || 'La corrida falló', true)
          }
        }
      }, 4000)
    } catch (e: any) {
      setJob({ status: 'error', rfc, error: String(e?.message || e) })
      setRunning(false)
    }
  }

  async function eliminar(rfc: string) {
    setPorBorrar(null)
    setDeleting(rfc)
    try {
      const r: any = await api('/clientes/eliminar', { method: 'POST', body: JSON.stringify({ rfc }) })
      await load()
      avisar(r?.error ? (r.detail || r.error) : `${rfc} eliminado`, !!r?.error)
    } finally { setDeleting('') }
  }

  const qNorm = q.trim().toUpperCase()
  const filtered = items.filter(i =>
    !qNorm || (i.rfc || '').includes(qNorm) || (i.nombre || '').toUpperCase().includes(qNorm))
  const hayCli = items.length > 0

  return (
    <div className="grid gap-5">
      {toast && (
        <div className="fixed top-20 right-6 z-50 w-[min(24rem,calc(100vw-3rem))]">
          <Alert variant={toast.bad ? 'danger' : 'success'} onClose={() => setToast(null)} className="shadow-pop">
            {toast.txt}
          </Alert>
        </div>
      )}

      <Seccion titulo="Agregar contribuyente" desc="Alta manual o carga masiva desde Excel">
        <div className="p-5 grid gap-5 lg:grid-cols-2">
          <ClienteForm onDone={async () => { await load(); avisar('Cliente guardado') }} />
          <UploadExcel onDone={async () => { await load(); avisar('Carga masiva aplicada') }} />
        </div>
      </Seccion>

      <Seccion
        titulo="Correr ahora"
        desc="Descarga el PDF desde el portal SAT y extrae el dictamen"
        accion={running ? <span className="badge bg-dorado/20 text-marino"><Spinner small /> Corriendo</span> : undefined}
      >
        <div className="p-5 grid gap-4">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              className="input flex-1"
              placeholder="RFC del contribuyente (GUAJ880224I62)"
              value={rfcRun}
              onChange={e => setRfcRun(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') correrBot() }}
            />
            <button className="btn btn-gold" disabled={running || !rfcRun.trim()} onClick={correrBot}>
              {running ? <><Spinner small /> Corriendo…</> : 'Correr bot'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-marino/50">Documentos:</span>
            {(['32d', 'constancia'] as const).map(t => {
              const on = tiposRun.includes(t)
              const blocked = t === 'constancia'
              return (
                <button
                  key={t}
                  type="button"
                  disabled={running || blocked}
                  title={blocked ? 'Pronto: falta la ruta de la Constancia en el portal SAT' : undefined}
                  onClick={() => setTiposRun(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                  className={`chip transition-colors ${on ? 'bg-marino text-white border-marino' : ''} ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {on && !blocked && <span className="w-1.5 h-1.5 rounded-full bg-dorado" />}
                  {TIPO_LABEL[t]}
                  {blocked && <span className="text-[10px] opacity-70">· pronto</span>}
                </button>
              )
            })}
            {tiposRun.length === 0 && <span className="text-xs text-amber-600">Elige al menos un documento</span>}
          </div>

          {job && <Progress job={job} />}

          {docs.length > 0 && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {docs.map(d => {
                const c = parseCampos(d)
                return (
                  <a
                    key={d.docId}
                    href={pdfUrl(d.rfc, d.docId)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 hover:border-dorado hover:bg-hueso/40 transition-colors"
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-dorado/15 text-marino grid place-items-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{TIPO_LABEL[d.tipo] || d.tipo}</div>
                      <div className="text-xs text-marino/50 truncate">
                        {c.folio ? `Folio ${c.folio}` : fechaCorta(c.fechaEmision || d.createdAt)}
                      </div>
                    </div>
                    {d.tipo === '32d' ? <EstadoBadge sentido={c.sentido} estado="vigente" /> : <span className="badge bg-sky-100 text-sky-800">{fechaCorta(c.fechaEmision)}</span>}
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </Seccion>

      <ConfirmDialog
        abierto={!!porBorrar}
        onClose={() => setPorBorrar(null)}
        onConfirm={() => porBorrar && eliminar(porBorrar)}
        cargando={!!deleting}
        cargandoTexto="Borrando…"
        tone="danger"
        titulo={<>¿Borrar a <span className="text-dorado">{porBorrar}</span>?</>}
        desc="Esta acción no se puede deshacer."
        confirmar="Sí, borrar cliente"
        cancelar="Mejor no"
      >
        <div className="rounded-xl border border-line bg-hueso/60 p-4">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-marino/50 mb-2">También se eliminará</div>
          <ul className="grid gap-1.5 text-[13px] text-marino/75">
            {[
              'La Contraseña SAT guardada de forma cifrada.',
              'Los PDFs descargados de sus documentos.',
              'El dictamen vigente y su historial en el resumen.',
              'La frecuencia de monitoreo programada.'
            ].map(t => (
              <li key={t} className="flex items-start gap-2">
                <svg width="14" height="14" className="mt-0.5 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                {t}
              </li>
            ))}
          </ul>
        </div>
        {deleting && (
          <Alert variant="info" className="mt-3">
            Borrando a <b>{deleting}</b>…
          </Alert>
        )}
      </ConfirmDialog>

      <Seccion
        titulo="Contribuyentes"
        desc={`${filtered.length} de ${items.length} cliente(s)`}
        accion={
          <div className="flex items-center gap-2">
            <input className="input btn-sm !w-48 !py-1.5" placeholder="Buscar RFC o nombre…" value={q} onChange={e => setQ(e.target.value)} />
            <button className="btn-ghost btn-sm" onClick={load} disabled={loadingList} title="Recargar">↻</button>
          </div>
        }
      >
        {loadingList && items.length === 0 ? (
          <div className="p-5 grid gap-2.5">
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-12" />)}
          </div>
        ) : !hayCli ? (
          <Vacio
            titulo="Sin clientes todavía"
            hint="Usa el alta manual de arriba o sube tu Excel con RFC y Contraseña."
            icono={<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>}
          />
        ) : filtered.length === 0 ? (
          <Vacio titulo={`Nada coincide con "${q}"`} hint="Prueba con otro RFC o nombre." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>RFC</th>
                  <th>Nombre</th>
                  <th>32-D</th>
                  <th>Documentos</th>
                  <th>Frecuencia</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const r = resumen[c.rfc]
                  const dias = r?.diasRestantes
                  return (
                    <tr key={c.rfc}>
                      <td>
                        <Link to={`/clientes/${c.rfc}`} className="font-bold hover:text-dorado transition-colors">{c.rfc}</Link>
                      </td>
                      <td className="max-w-[220px]">
                        <div className="truncate">{c.nombre || '—'}</div>
                        {c.email && <div className="text-xs text-marino/40 truncate">{c.email}</div>}
                      </td>
                      <td>
                        {r ? <EstadoBadge sentido={r.sentido} estado={r.estado} dias={dias} /> : <span className="badge bg-marino/8 text-marino/50">Sin correr</span>}
                        {r && dias != null && (
                          <div className={`text-[11px] mt-1 tabular-nums ${dias <= 7 ? 'text-amber-600 font-semibold' : 'text-marino/40'}`}>
                            {dias < 0 ? `venció hace ${Math.abs(dias)} d` : `vence en ${dias} d`}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(c.tipos || '').split(',').filter(Boolean).map(t => (
                            <span key={t} className="chip !py-0.5">{TIPO_LABEL[t] || t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="tabular-nums">
                        <div>{c.frecuenciaDias} d</div>
                        {c.proximoRun && <div className="text-[11px] text-marino/40">próximo {haceRato(c.proximoRun).replace('hace ', '')}</div>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/clientes/${c.rfc}`} className="btn-ghost btn-sm">Detalle</Link>
                          <button
                            className="btn btn-sm bg-rose-50 text-rose-700 border border-rose-200/70 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50"
                            disabled={deleting === c.rfc}
                            onClick={() => setPorBorrar(c.rfc)}
                          >
                            {deleting === c.rfc ? 'Borrando…' : 'Borrar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  )
}
