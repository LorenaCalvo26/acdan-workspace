import { type ReactNode } from 'react'
import { estadoDe } from '../lib/api'

export function Spinner({ small }: { small?: boolean }) {
  return (
    <svg className={`animate-spin ${small ? 'w-3.5 h-3.5' : 'w-5 h-5'} inline-block shrink-0`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function EstadoBadge({ sentido, estado, dias }: { sentido?: string; estado?: string; dias?: number | null }) {
  const e = estadoDe({ sentido, estado, diasRestantes: dias })
  return (
    <span className={`badge ${e.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`} />
      {e.label}
    </span>
  )
}

export function Vacio({ titulo, hint, icono, accion }: { titulo: string; hint?: string; icono?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icono && <div className="mb-3 text-marino/25">{icono}</div>}
      <div className="font-semibold text-marino/70">{titulo}</div>
      {hint && <div className="text-sm text-marino/45 mt-1 max-w-sm">{hint}</div>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, tone = 'default', icon }: {
  label: string; value: ReactNode; sub?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'bad'; icon?: ReactNode
}) {
  const tones: Record<string, string> = {
    default: 'text-marino',
    ok: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600'
  }
  return (
    <div className="card-p flex items-start gap-3.5">
      {icon && <div className="shrink-0 w-10 h-10 rounded-xl bg-hueso grid place-items-center text-marino/60">{icon}</div>}
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-bold text-marino/45">{label}</div>
        <div className={`text-2xl font-bold leading-tight mt-0.5 ${tones[tone]}`}>{value}</div>
        {sub && <div className="text-xs text-marino/50 mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  )
}

export function Seccion({ titulo, desc, accion, children }: {
  titulo: string; desc?: string; accion?: ReactNode; children: ReactNode
}) {
  return (
    <section className="card overflow-hidden anim-in">
      <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line">
        <div>
          <h2 className="font-bold text-[15px]">{titulo}</h2>
          {desc && <p className="text-xs text-marino/50 mt-0.5">{desc}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  )
}
