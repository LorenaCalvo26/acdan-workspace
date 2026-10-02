import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePortal } from '../lib/portal'
import { api, parseCampos, parseFechaES, fechaCorta, TIPO_LABEL, type Doc } from '../lib/api'
import { Spinner, Alert, EstadoBadge } from '../components/ui'

type ResumenCliente = {
  rfc: string
  nombre: string
  sentido: string
  estado: 'sin-correr' | 'vigente' | 'por-vencer' | 'vencido' | 'sin-fecha'
  folio: string
  fecha32d: string
  diasRestantes: number | null
  docId: string
}

function pillDoc(sentido: string, estado: string) {
  if (estado === 'sin-correr') return { txt: 'En proceso', cls: 'bg-slate-100 text-slate-600' }
  if (estado === 'vencido') return { txt: 'Vencida', cls: 'bg-red-50 text-red-700' }
  if (estado === 'por-vencer') return { txt: 'Por vencer', cls: 'bg-amber-50 text-amber-700' }
  if (sentido === 'negativo') return { txt: 'Negativa', cls: 'bg-red-50 text-red-700' }
  if (sentido === 'positivo') return { txt: 'Al día', cls: 'bg-emerald-50 text-emerald-700' }
  return { txt: 'Descargada', cls: 'bg-emerald-50 text-emerald-700' }
}

export default function PortalResumen() {
  const { sesion, salir } = usePortal()
  const [res, setRes] = useState<ResumenCliente | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [load, setLoad] = useState(true)
  const [err, setErr] = useState('')
  const [pdfMsg, setPdfMsg] = useState<string | null>(null)
  const [bajando, setBajando] = useState('')

  const cargar = useCallback(async () => {
    if (!sesion) return
    setLoad(true); setErr('')
    try {
      const [r, d]: any[] = await Promise.all([
        api('/portal/resumen', { method: 'POST', body: JSON.stringify({ token: sesion.jwt }) }),
        api('/portal/docs', { method: 'POST', body: JSON.stringify({ token: sesion.jwt }) }),
      ])
      if (r?.error) { setErr(r.detail || r.error); return }
      setRes(r as ResumenCliente)
      setDocs(Array.isArray(d) ? d as Doc[] : [])
    } finally {
      setLoad(false)
    }
  }, [sesion])

  useEffect(() => { cargar() }, [cargar])

  async function descargar(doc: Doc) {
    if (!sesion || bajando) return
    setBajando(doc.docId); setPdfMsg(null)
    try {
      const r: any = await api('/portal/pdf', {
        method: 'POST',
        body: JSON.stringify({ token: sesion.jwt, docId: doc.docId })
      })
      if (!r?.ok || !r?.pdfBase64) throw new Error(r?.error || 'No se pudo obtener el PDF')
      const bin = atob(r.pdfBase64 as string)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
      window.open(url, '_blank', 'noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e: any) {
      setPdfMsg(e?.message || 'No se pudo descargar el PDF')
    } finally {
      setBajando('')
    }
  }

  const dias = res?.diasRestantes ?? null
  // Fechas reales de la vigencia: emisión (del PDF) y vencimiento (emisión + 30 días).
  const fechaEmision = res?.fecha32d ? parseFechaES(res.fecha32d) : null
  const fechaVence = fechaEmision
    ? new Date(fechaEmision.getFullYear(), fechaEmision.getMonth(), fechaEmision.getDate() + 30)
    : null
  const fmtCorta = (d: Date | null) =>
    d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  // % de vigencia consumida: dónde va "hoy" entre emisión y vencimiento.
  const pctConsumido = dias == null ? 0 : Math.min(100, Math.max(0, ((30 - dias) / 30) * 100))
  const etiquetaVigencia =
    res == null ? '—'
    : res.estado === 'sin-correr' ? 'Tu contador está trabajando en tu reporte'
    : dias == null ? 'Sin fecha de emisión'
    : dias < 0 ? `Venció hace ${Math.abs(dias)} días`
    : dias === 0 ? 'Vence hoy'
    : `Vence en ${dias} días`

  return (
    <div className="min-h-screen">
      <header className="w-full py-4">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-3">
          <img src="/pilli-logo.svg" alt="Pilli" className="w-10 h-10 rounded-xl drop-shadow-sm" />
          <div className="leading-tight min-w-0">
            <div className="font-pilli font-extrabold text-base text-marino truncate">
              Hola, {res?.nombre || sesion?.rfc}
            </div>
            <div className="text-[11px] font-medium text-marino/45 font-mono">{sesion?.rfc}</div>
          </div>
          <button onClick={salir} className="btn-ghost btn-sm ml-auto shrink-0">Salir</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 grid gap-5">
        {load ? (
          <div className="grid gap-4"><div className="skeleton h-28" /><div className="skeleton h-64" /></div>
        ) : err ? (
          <Alert variant="danger" titulo="No pudimos cargar tu reporte">{err}</Alert>
        ) : (
          <>
            {/* Héroe de estado */}
            <section className="card overflow-hidden anim-in">
              <div className="p-6 sm:p-8 text-center">
                <div className="flex justify-center">
                  <EstadoBadge sentido={res?.sentido} estado={res?.estado} dias={dias} />
                </div>
                <h1 className="font-pilli font-extrabold text-3xl sm:text-4xl text-marino mt-3 leading-tight">
                  {res?.estado === 'sin-correr' ? 'Tu reporte está en camino'
                    : res?.sentido === 'negativo' ? 'Tu opinión salió negativa'
                    : res?.estado === 'vencido' ? 'Tu opinión venció'
                    : 'Vas al corriente'}
                </h1>
                <p className="text-sm text-marino/55 mt-2">
                  Opinión del cumplimiento 32-D · {etiquetaVigencia}
                </p>
                {(res?.folio || res?.fecha32d) && (
                  <div className="mt-3 inline-flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-marino/55">
                    {res?.fecha32d && <span>Emitida <b className="text-marino">{fmtCorta(fechaEmision)}</b></span>}
                    {fechaVence && <span>Vence <b className={dias != null && dias <= 7 ? 'text-amber-600' : 'text-marino'}>{fmtCorta(fechaVence)}</b></span>}
                    {res?.folio && <span>Folio <span className="font-mono font-semibold text-marino/70">{res.folio}</span></span>}
                  </div>
                )}
              </div>
            </section>

            {/* Panel estilo mockup: reporte + grafiquita de vigencia */}
            <section className="relative mx-auto w-full anim-in">
              <div className="relative rounded-2xl border border-line bg-white p-5 shadow-xl shadow-marino/10">
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-dorado" />
                    <span className="h-3 w-3 rounded-full bg-amber-400" />
                    <span className="h-3 w-3 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-marino/40">
                    Pilli · Mi reporte
                  </span>
                </div>

                <div className="space-y-3 pt-4">
                  {docs.length === 0 ? (
                    <p className="text-sm text-marino/50 text-center py-4">
                      Aún no hay documentos. Tu contador los publicará aquí.
                    </p>
                  ) : docs.map(d => {
                    const c = parseCampos(d)
                    const pill = d.tipo === '32d'
                      ? pillDoc(c.sentido || res?.sentido || '', res?.estado || '')
                      : { txt: fechaCorta(c.fechaEmision || d.createdAt), cls: 'bg-sky-50 text-sky-800' }
                    return (
                      <div
                        key={d.docId}
                        className="flex items-center justify-between gap-3 rounded-xl bg-hueso/70 px-4 py-3"
                      >
                        <span className="flex items-center gap-2.5 text-sm font-medium text-marino min-w-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-dorado shadow-sm">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{TIPO_LABEL[d.tipo] || d.tipo}</span>
                            <span className="block truncate text-xs font-normal text-marino/45">
                              {[c.folio ? `Folio ${c.folio}` : '',
                                (c.fechaEmision || d.createdAt) ? fechaCorta(c.fechaEmision || d.createdAt) : '']
                                .filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pill.cls}`}>
                            {pill.txt}
                          </span>
                          <button
                            onClick={() => descargar(d)}
                            disabled={bajando === d.docId}
                            title="Descargar PDF"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-marino/60 hover:text-marino hover:border-dorado transition-colors disabled:opacity-50"
                          >
                            {bajando === d.docId ? <Spinner small /> : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            )}
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 rounded-xl bg-gradient-to-r from-marino to-[#1d3f5f] p-4 text-white">
                  <p className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
                    Vigencia de tu opinión
                    <span className={dias != null && dias <= 7 ? 'text-amber-300' : 'text-emerald-300'}>
                      {etiquetaVigencia}
                    </span>
                  </p>
                  {fechaEmision && fechaVence ? (
                    <div className="mt-4">
                      <div className="flex justify-between text-[11px] font-semibold">
                        <span className="text-white/70">Emitida<br /><span className="text-white text-xs">{fmtCorta(fechaEmision)}</span></span>
                        <span className="text-right text-white/70">Vence<br /><span className="text-white text-xs">{fmtCorta(fechaVence)}</span></span>
                      </div>
                      <div className="relative mt-2 h-2.5 rounded-full bg-white/20" role="img" aria-label={etiquetaVigencia}>
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full ${dias != null && dias < 0 ? 'bg-red-400' : 'bg-dorado'}`}
                          style={{ width: `${pctConsumido}%` }}
                        />
                        <span
                          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-marino bg-white shadow"
                          style={{ left: `${pctConsumido}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-white/60">
                        {dias != null && dias >= 0
                          ? `Día ${30 - dias} de 30 · tu contador la renueva automáticamente`
                          : 'Pide tu renovación para volver a estar al corriente.'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-white/60">
                      Aquí verás la línea de tiempo en cuanto se emita tu primera opinión.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {pdfMsg && <Alert variant="danger">{pdfMsg}</Alert>}

            <section className="card-p text-center anim-in">
              <p className="text-sm font-semibold text-marino">¿Dudas con tu situación fiscal?</p>
              <p className="text-xs text-marino/50 mt-1">Escríbenos y tu contador te contacta.</p>
              <a href="mailto:contacto@acdanconsultores.mx?subject=Duda%20sobre%20mi%20reporte%20fiscal" className="btn-gold btn-sm mt-3">
                Contactar a mi contador
              </a>
            </section>

            <p className="text-center text-[11px] text-marino/35">
              ACDAN Consultores · Reporte informativo, no sustituye asesoría contable
            </p>
          </>
        )}
      </main>
    </div>
  )
}
