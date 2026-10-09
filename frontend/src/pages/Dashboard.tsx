import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Stats, type Resumen, estadoDe } from '../lib/api'
import { Stat, Vacio, EstadoBadge, Spinner } from '../components/ui'

const PASOS = [
  { t: 'Credencial', d: 'Clave CIEC resguardada de forma segura.' },
  { t: 'Acceso al SAT', d: 'Consulta automática del trámite 32-D sin intervención manual.' },
  { t: 'Descarga', d: 'Obtención del reporte de Opinión de Cumplimiento.' },
  { t: 'Dictamen', d: 'Lectura del resultado (Positivo/Negativo) y su vigencia.' }
]

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null)
  const [res, setRes] = useState<Resumen[]>([])
  const [load, setLoad] = useState(true)
  const [err, setErr] = useState('')

  async function load_() {
    try {
      const [st, rs] = await Promise.all([api('/stats'), api('/clientes/resumen')])
      if (st?.error) setErr(st.detail || st.error)
      else { setS(st as Stats); setErr('') }
      if (Array.isArray(rs)) setRes(rs as Resumen[])
    } finally { setLoad(false) }
  }

  useEffect(() => { load_() }, [])

  const atencion = res
    .filter(r => r.estado === 'por-vencer' || r.estado === 'vencido')
    .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0))

  if (load) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="card p-5"><div className="skeleton h-4 w-20" /><div className="skeleton h-8 w-12 mt-3" /></div>)}
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {err && (
        <div className="card-p border border-red-200 bg-red-50 text-red-800 text-sm">
          <b>Sin conexión al backend.</b> {err}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Clientes"
          value={s?.clientes ?? 0}
          sub={
            <span className="inline-flex items-center gap-1.5 text-marino/70">
              <span className="w-1.5 h-1.5 rounded-full bg-marino/40" />
              <b>{s?.conCredencial ?? 0}</b> con credencial
            </span>
          }
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <Stat
          label="32-D por vencer"
          tone={(s?.porVencer ?? 0) > 0 ? 'warn' : 'default'}
          value={s?.porVencer ?? 0}
          sub={
            <span className="inline-flex items-center gap-1.5 text-marino/70">
              <span className={`w-1.5 h-1.5 rounded-full ${(s?.porVencer ?? 0) > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              Vencen en 7 días o menos
            </span>
          }
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 16 14" />
            </svg>
          }
        />
        <Stat
          label="Dictámenes activos"
          tone="ok"
          value={(s?.positivos ?? 0) + (s?.negativos ?? 0)}
          sub={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-md text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {s?.positivos ?? 0} positivo
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200/60 px-2 py-0.5 rounded-md text-[11px] font-medium">
                {s?.negativos ?? 0} negativo
              </span>
            </div>
          }
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          }
        />
        <Stat
          label="Corridas hoy"
          tone={(s?.jobsError ?? 0) > 0 ? 'bad' : 'default'}
          value={s?.jobsHoy ?? 0}
          sub={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-md text-[11px] font-bold">
                {s?.jobsOk ?? 0} exitosas
              </span>
              {(s?.jobsError ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200/60 px-2 py-0.5 rounded-md text-[11px] font-bold">
                  {s?.jobsError ?? 0} error
                </span>
              )}
            </div>
          }
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2 anim-in">
          <header className="flex items-center justify-between px-6 py-4 border-b border-line/80 bg-white/50">
            <div>
              <h2 className="font-bold text-[15px] text-marino">Estado de los contribuyentes</h2>
              <p className="text-xs text-marino/50 mt-0.5">Último 32-D de cada cliente y días de vigencia restantes</p>
            </div>
            <Link to="/clientes" className="btn-ghost btn-sm">Ver todos</Link>
          </header>

          {res.length === 0 ? (
            <Vacio
              titulo="Todavía no hay clientes"
              hint="Da de alta el primer contribuyente con su RFC y Contraseña SAT para empezar a Opinionar."
              accion={<Link to="/clientes" className="btn-gold btn-sm">Ir a Clientes</Link>}
            />
          ) : (
            <div className="divide-y divide-line/60">
              {[...res].sort((a, b) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999)).map(r => {
                return (
                  <Link key={r.rfc} to={`/clientes/${r.rfc}`} className="flex items-center gap-4 px-6 py-4 hover:bg-hueso/70 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-marino group-hover:text-dorado transition-colors font-pilli tracking-wide">{r.rfc}</div>
                      <div className="text-xs text-marino/50 mt-0.5">
                        {r.folio ? <>Folio <span className="font-mono text-marino/70">{r.folio}</span></> : 'Sin folio registrado'}
                      </div>
                    </div>
                    <div className="hidden sm:block text-xs text-marino/60 tabular-nums font-medium">
                      {r.diasRestantes != null
                        ? <>Vence en <b className={r.diasRestantes <= 7 ? 'text-amber-600 font-bold' : 'text-marino font-bold'}>{r.diasRestantes} d</b></>
                        : '—'}
                    </div>
                    <EstadoBadge sentido={r.sentido} estado={r.estado} dias={r.diasRestantes} />
                    <svg width="16" height="16" className="text-marino/25 shrink-0 group-hover:translate-x-0.5 group-hover:text-marino/60 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <div className="grid gap-6 content-start">
          {atencion.length > 0 && (
            <section className="card overflow-hidden anim-in border-amber-200/80">
              <header className="px-6 py-4 border-b border-amber-200/60 bg-amber-50/80">
                <h2 className="font-bold text-[15px] text-amber-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Requieren atención
                </h2>
                <p className="text-xs text-amber-700/80 mt-0.5">Vencen pronto o ya vencieron</p>
              </header>
              <div className="divide-y divide-amber-100">
                {atencion.map(r => (
                  <Link key={r.rfc} to={`/clientes/${r.rfc}`} className="block px-6 py-3.5 hover:bg-amber-50/40 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm font-pilli text-marino">{r.rfc}</span>
                      <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${r.diasRestantes! < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                        {r.diasRestantes! < 0 ? `venció hace ${Math.abs(r.diasRestantes!)} d` : `${r.diasRestantes} d`}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="card overflow-hidden anim-in">
            <header className="px-6 py-4 border-b border-line/80 bg-white/50">
              <h2 className="font-bold text-[15px] text-marino">Cómo opera Pilli</h2>
              <p className="text-xs text-marino/50 mt-0.5">Monitoreo contable automático, de la clave CIEC al dictamen</p>
            </header>
            <ol className="p-6 grid gap-4">
              {PASOS.map((p, i) => (
                <li key={p.t} className="flex gap-4 items-start relative group">
                  <div className="shrink-0 w-7 h-7 rounded-xl bg-marino text-dorado font-extrabold grid place-items-center text-xs shadow-sm border border-dorado/30 group-hover:bg-dorado group-hover:text-marino transition-colors">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="text-sm font-bold text-marino">{p.t}</div>
                    <div className="text-xs text-marino/60 leading-relaxed mt-0.5">{p.d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
