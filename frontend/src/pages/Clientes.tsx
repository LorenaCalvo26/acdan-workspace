import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, asItems, type Cliente, type Resumen, type Doc, parseCampos, TIPO_LABEL, fechaCorta, fechaHoraCorta, mensajeError, pdfUrl } from '../lib/api'
import { portalUrl, copiarTexto } from '../lib/portal'
import UploadExcel from '../components/UploadExcel'
import ClienteForm from '../components/ClienteForm'
import SaludSAT from '../components/SaludSAT'
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
const STEP_SHORT: Record<string, string> = {
  queued: 'En cola',
  login: 'Portal',
  captcha: 'Captcha',
  descargando: 'PDF',
  extrayendo: 'Lectura',
  listo: 'Listo',
}

function ordenDe(c: Cliente): number {
  const n = Number(c.ordenCfdi)
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER
}

function frecuenciaDe(c: Cliente): string {
  if (c.programacion === 'mensual') {
    return `Mensual · día ${c.diaProgramacion || '—'} · ${c.horaProgramacion || '08:00'}`
  }
  return `Cada ${c.frecuenciaDias || 25} días`
}

function Progress({ job }: { job: any }) {
  const idx = job.status === 'error' ? -1 : STEP_ORDER.indexOf(job.status)
  const activo = job.status !== 'listo' && job.status !== 'error'
  return (
    <div className="rounded-xl border border-line bg-hueso/60 p-4">
      <div className="flex items-center gap-2.5 mb-3">
        {activo && <Spinner small />}
        <span className="text-sm font-bold">
          {STEP_LABEL[job.status] || job.status}
          {job.status === 'captcha' && job.intentoCaptcha ? ` · intento ${job.intentoCaptcha}/4` : ''}
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
            {STEP_SHORT[s] || s}
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
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null)
  const [dragRfc, setDragRfc] = useState<string | null>(null)
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const timer = useRef<any>(null)

  const avisar = (txt: string, bad = false) => {
    setToast({ txt, bad })
    setTimeout(() => setToast(null), 4000)
  }

  async function copiarLiga(rfc: string) {
    const ok = await copiarTexto(portalUrl(rfc))
    if (ok) {
      setLinkCopiado(rfc)
      setTimeout(() => setLinkCopiado(null), 2500)
    } else {
      avisar('No se pudo copiar la liga', true)
    }
  }

  function BotonLiga({ rfc, className = '' }: { rfc: string; className?: string }) {
    return (
      <button
        type="button"
        title="Copiar liga del portal del cliente"
        onClick={() => copiarLiga(rfc)}
        className={`inline-flex items-center justify-center rounded-lg border border-line bg-white text-marino/55 hover:text-marino hover:border-dorado transition-colors ${className}`}
      >
        {linkCopiado === rfc ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m8.5 12.5 2.5 2.5 4.5-5" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
        )}
      </button>
    )
  }

  async function load() {
    setLoadingList(true)
    try {
      const [cl, rs] = await Promise.all([api('/clientes/todos'), api('/clientes/resumen')])
      const lista = asItems<Cliente>(cl)
      // El orden guardado es el de prioridad CFDI. Los clientes viejos sin
      // `ordenCfdi` conservan el orden en que los devuelve Dynamo.
      lista.sort((a, b) => ordenDe(a) - ordenDe(b))
      setItems(lista)
      if (Array.isArray(rs)) setResumen(Object.fromEntries((rs as Resumen[]).map(r => [r.rfc, r])))
    } finally { setLoadingList(false) }
  }

  useEffect(() => { load(); return () => clearInterval(timer.current) }, [])

  async function guardarOrden(nueva: Cliente[]) {
    if (guardandoOrden) return
    setItems(nueva)
    setGuardandoOrden(true)
    try {
      const r: any = await api('/clientes/orden-cfdi', {
        method: 'POST',
        body: JSON.stringify({ rfcs: nueva.map(c => c.rfc) })
      })
      if (!r?.ok) {
        avisar(mensajeError(r), true)
        await load()
      }
    } finally {
      setGuardandoOrden(false)
    }
  }

  function moverSobre(rfcArrastrado: string | null, rfcDestino: string) {
    if (!rfcArrastrado || rfcArrastrado === rfcDestino || qNorm) return
    const desde = items.findIndex(c => c.rfc === rfcArrastrado)
    const hasta = items.findIndex(c => c.rfc === rfcDestino)
    if (desde < 0 || hasta < 0) return

    const arrastrado = items[desde]
    const nueva = items.filter(c => c.rfc !== rfcArrastrado)
    const destino = nueva.findIndex(c => c.rfc === rfcDestino)
    if (destino < 0) return

    // Si baja, se coloca después del destino; si sube, antes. Así se puede
    // soltar tanto arriba como abajo y llegar hasta el final de la lista.
    nueva.splice(desde < hasta ? destino + 1 : destino, 0, arrastrado)
    void guardarOrden(nueva)
  }

  function moverAlInicio(rfc: string) {
    if (qNorm) return
    const cliente = items.find(c => c.rfc === rfc)
    if (!cliente) return
    const nueva = [cliente, ...items.filter(c => c.rfc !== rfc)]
    void guardarOrden(nueva)
  }

  async function correrProgramados() {
    const r: any = await api('/scheduler/tick', { method: 'POST', body: '{}' })
    if (!r?.ok) { avisar(r?.detail || r?.error || 'No se pudo correr el programador', true); return }
    avisar(`Programados: ${r?.encolados ?? 0} encolado(s)`)
    await load()
  }

  async function correrBot() {    if (!rfcRun.trim() || running) return
    const rfc = rfcRun.trim().toUpperCase()
    setRunning(true)
    setDocs([])
    setJob({ status: 'queued', intentoCaptcha: 0, rfc })
    try {
      const res: any = await api('/sat/solicitar', { method: 'POST', body: JSON.stringify({ rfc, tipos: tiposRun }) })
      const jobId = res?.jobId
      if (!jobId) { setJob({ status: 'error', rfc, error: res?.detail || JSON.stringify(res) }); setRunning(false); return }
      clearInterval(timer.current)
      let fallos = 0
      timer.current = setInterval(async () => {
        try {
          const st: any = await api('/sat/status', { method: 'POST', body: JSON.stringify({ jobId }) })
          if (st?.error) { clearInterval(timer.current); setRunning(false); setJob({ status: 'error', rfc, error: st.detail || st.error }); return }
          fallos = 0
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
        } catch (e: any) {
          // Si el sondeo truena 5 veces seguidas, se detiene con mensaje en vez de girar eterno.
          fallos++
          if (fallos >= 5) {
            clearInterval(timer.current)
            setRunning(false)
            setJob({ status: 'error', rfc, error: `Se perdió contacto con el backend (${e?.message || e}). Recarga la página.` })
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
  const puedeOrdenar = !qNorm && !guardandoOrden
  const posicion = (rfc: string) => items.findIndex(x => x.rfc === rfc) + 1
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
        desc="Descarga el PDF desde el portal SAT y extrae el dictamen. El programador automático pasa cada hora; Adelantar mete al cliente en la siguiente pasada."
        accion={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {running && <span className="badge bg-dorado/20 text-marino"><Spinner small /> Corriendo</span>}
            <button className="btn-ghost btn-sm shrink-0" onClick={correrProgramados} title="Encola a los clientes con fecha programada vencida">
              Correr programados
            </button>
          </div>
        }
      >
        <div className="p-5 grid gap-4">
          <SaludSAT />
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
              return (
                <button
                  key={t}
                  type="button"
                  disabled={running}
                  onClick={() => setTiposRun(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                  className={`chip transition-colors ${on ? 'bg-marino text-white border-marino' : ''}`}
                >
                  {on && <span className="w-1.5 h-1.5 rounded-full bg-dorado" />}
                  {TIPO_LABEL[t]}
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
              'La programación mensual y su lugar en el orden CFDI.'
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
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {guardandoOrden && <span className="text-xs text-marino/45 whitespace-nowrap">Guardando orden…</span>}
            <input className="input btn-sm !py-1.5 flex-1 min-w-0 sm:!w-48 sm:flex-none" placeholder="Buscar RFC o nombre…" value={q} onChange={e => setQ(e.target.value)} />
            <button className="btn-ghost btn-sm shrink-0" onClick={load} disabled={loadingList} title="Recargar">↻</button>
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
          <>
            {/* Tarjetas en móvil */}
            <div className="grid gap-3 p-4 md:hidden">
              {filtered.map(c => {
                const r = resumen[c.rfc]
                const dias = r?.diasRestantes
                return (
                  <div key={c.rfc} className="rounded-2xl border border-line/80 bg-white p-4 grid gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/clientes/${c.rfc}`} className="font-bold text-[15px] font-pilli tracking-wide hover:text-dorado transition-colors truncate">{c.rfc}</Link>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {r ? <EstadoBadge sentido={r.sentido} estado={r.estado} dias={dias} /> : <span className="badge bg-marino/8 text-marino/50">Sin correr</span>}
                        <BotonLiga rfc={c.rfc} className="h-7 w-7" />
                      </span>
                    </div>
                    {(c.nombre || c.email) && (
                      <div className="min-w-0 text-[13px]">
                        {c.nombre && <div className="font-semibold text-marino truncate">{c.nombre}</div>}
                        {c.email && <div className="text-marino/45 truncate">{c.email}</div>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-marino/55">
                      {r && dias != null && (
                        <span className={`tabular-nums font-semibold ${dias <= 7 ? 'text-amber-600' : ''}`}>
                          {dias < 0 ? `venció hace ${Math.abs(dias)} d` : `vence en ${dias} d`}
                        </span>
                      )}
                      <span className="tabular-nums">{frecuenciaDe(c)}</span>
                      <span className="tabular-nums text-marino/35">CFDI #{posicion(c.rfc)}</span>
                      {(c.tipos || '').split(',').filter(Boolean).map(t => (
                        <span key={t} className="chip !py-0.5">{TIPO_LABEL[t] || t}</span>
                      ))}
                    </div>
                    {c.proximoRun && (
                      <div className="text-[11px] text-marino/40 tabular-nums">Próxima: {fechaHoraCorta(c.proximoRun)}</div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Link to={`/clientes/${c.rfc}`} className="btn-ghost btn-sm flex-1">Detalle</Link>
                      <button
                        className="btn-ghost btn-sm px-2.5"
                        disabled={!puedeOrdenar || posicion(c.rfc) === 1}
                        onClick={() => moverAlInicio(c.rfc)}
                        title="Mover al inicio del orden CFDI"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-sm flex-1 bg-rose-50 text-rose-700 border border-rose-200/70 hover:bg-rose-100 disabled:opacity-50"
                        disabled={deleting === c.rfc}
                        onClick={() => setPorBorrar(c.rfc)}
                      >
                        {deleting === c.rfc ? 'Borrando…' : 'Borrar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Tabla en escritorio */}
            <div className="hidden md:block">
              <div className="px-5 py-2.5 text-[11px] leading-relaxed text-marino/45 border-b border-line/60">
                {qNorm
                  ? 'Limpia la búsqueda para arrastrar y reordenar.'
                  : 'Arrastra una fila para definir el orden entre los CFDI pendientes. No adelanta fechas ni cambia la programación de 32-D o Constancia.'}
              </div>
              <div className="overflow-x-auto">
            <table className="table min-w-[840px]">
              <thead>
                <tr>
                  <th className="w-[94px]" title="Orden de ejecución para CFDI">Orden CFDI</th>
                  <th>RFC</th>
                  <th>Nombre</th>
                  <th>32-D</th>
                  <th>Documentos</th>
                  <th>Programación</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const r = resumen[c.rfc]
                  const dias = r?.diasRestantes
                  return (
                    <tr
                      key={c.rfc}
                      draggable={puedeOrdenar}
                      onDragStart={() => setDragRfc(c.rfc)}
                      onDragOver={e => { if (puedeOrdenar) e.preventDefault() }}
                      onDrop={e => { e.preventDefault(); moverSobre(dragRfc, c.rfc); setDragRfc(null) }}
                      onDragEnd={() => setDragRfc(null)}
                      className={dragRfc === c.rfc ? 'opacity-40' : ''}
                    >
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`select-none rounded border border-line/70 px-1.5 py-0.5 text-marino/30 ${puedeOrdenar ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-40'}`}
                            title={qNorm ? 'Limpia la búsqueda para ordenar' : 'Arrastra para cambiar el orden CFDI'}
                          >
                            ⋮⋮
                          </span>
                          <span className="text-[11px] font-semibold text-marino/45 tabular-nums">{posicion(c.rfc)}</span>
                        </div>
                      </td>
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
                        <div className="font-semibold">{frecuenciaDe(c)}</div>
                        {c.proximoRun && <div className="text-[11px] text-marino/40">Próx. {fechaHoraCorta(c.proximoRun)}</div>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="btn-ghost btn-sm px-2"
                            disabled={!puedeOrdenar || posicion(c.rfc) === 1}
                            onClick={() => moverAlInicio(c.rfc)}
                            title="Mover al inicio del orden CFDI"
                          >
                            ↑
                          </button>
                          <BotonLiga rfc={c.rfc} className="h-7 w-7" />
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
            </div>
          </>
        )}
      </Seccion>
    </div>
  )
}
