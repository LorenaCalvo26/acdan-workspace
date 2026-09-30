import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Stats, type Resumen, estadoDe } from '../lib/api'
import { Stat, Vacio, EstadoBadge, Spinner } from '../components/ui'

const PASOS = [
  { t: 'Credencial', d: 'Contraseña SAT cifrada en Secrets, nunca en Dynamo ni en el Excel.' },
  { t: 'Login', d: 'Playwright abre la app 32-D; el SAT genera su propio OAuth con PKCE.' },
  { t: 'Captcha', d: 'Vision IA limpia el ruido de color y teclea el código. Reintenta 3 veces.' },
  { t: 'Descarga', d: 'Se posiciona en la ruta del reporte y captura el PDF del visor.' },
  { t: 'Lectura', d: 'PDFBox extrae sentido, folio, fecha y vigencia a 30 días.' }
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
    <div className="grid gap-5">
      {err && (
        <div className="card-p border border-red-200 bg-red-50 text-red-800 text-sm">
          <b>Sin conexión al backend.</b> {err}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
        <Stat
          label="Clientes" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/></svg>}
          value={s?.clientes ?? 0} sub={`${s?.conCredencial ?? 0} con credencial guardada`}
        />
        <Stat
          label="32-D por vencer" tone={(s?.porVencer ?? 0) > 0 ? 'warn' : 'default'} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>}
          value={s?.porVencer ?? 0} sub="Vencen en 7 días o menos"
        />
        <Stat
          label="Dictámenes" tone="ok" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>}
          value={s?.docs32d ?? 0} sub={`${s?.positivos ?? 0} positivo(s) · ${s?.negativos ?? 0} negativo(s)`}
        />
        <Stat
          label="Corridas hoy" tone={(s?.jobsError ?? 0) > 0 ? 'bad' : 'default'} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h8l-1 8 10-12h-8z"/></svg>}
          value={s?.jobsHoy ?? 0} sub={`${s?.jobsOk ?? 0} ok · ${s?.jobsError ?? 0} con error`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2 anim-in">
          <header className="flex items-center justify-between px-5 py-4 border-b border-line">
            <div>
              <h2 className="font-bold text-[15px]">Estado de los contribuyentes</h2>
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
            <div className="divide-y divide-line">
              {[...res].sort((a, b) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999)).map(r => {
                const e = estadoDe(r)
                return (
                  <Link key={r.rfc} to={`/clientes/${r.rfc}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-hueso/60 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{r.rfc}</div>
                      <div className="text-xs text-marino/50 mt-0.5">
                        {r.folio ? <>Folio {r.folio}</> : 'Sin folio registrado'}
                      </div>
                    </div>
                    <div className="hidden sm:block text-xs text-marino/50 tabular-nums">
                      {r.diasRestantes != null
                        ? <>Vence en <b className={r.diasRestantes <= 7 ? 'text-amber-600' : 'text-marino'}>{r.diasRestantes} d</b></>
                        : '—'}
                    </div>
                    <EstadoBadge sentido={r.sentido} estado={r.estado} dias={r.diasRestantes} />
                    <svg width="16" height="16" className="text-marino/25 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <div className="grid gap-5 content-start">
          {atencion.length > 0 && (
            <section className="card overflow-hidden anim-in">
              <header className="px-5 py-4 border-b border-line bg-amber-50">
                <h2 className="font-bold text-[15px] text-amber-900">Requieren atención</h2>
                <p className="text-xs text-amber-700/80 mt-0.5">Vencen pronto o ya vencieron</p>
              </header>
              <div className="divide-y divide-line">
                {atencion.map(r => (
                  <Link key={r.rfc} to={`/clientes/${r.rfc}`} className="block px-5 py-3 hover:bg-hueso/60 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{r.rfc}</span>
                      <span className={`text-xs font-bold tabular-nums ${r.diasRestantes! < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {r.diasRestantes! < 0 ? `venció hace ${Math.abs(r.diasRestantes!)} d` : `${r.diasRestantes} d`}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="card overflow-hidden anim-in">
            <header className="px-5 py-4 border-b border-line">
              <h2 className="font-bold text-[15px]">Cómo opera el bot</h2>
              <p className="text-xs text-marino/50 mt-0.5">De la credencial al dictamen, sin intervención</p>
            </header>
            <ol className="p-5 grid gap-4">
              {PASOS.map((p, i) => (
                <li key={p.t} className="flex gap-3.5">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-marino text-white grid place-items-center text-[11px] font-bold">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{p.t}</div>
                    <div className="text-xs text-marino/55 leading-relaxed mt-0.5">{p.d}</div>
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
