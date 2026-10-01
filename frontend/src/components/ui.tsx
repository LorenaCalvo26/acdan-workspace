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

export function Stat({ label, value, sub, tone = 'default' }: {
  label: string; value: ReactNode; sub?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'bad'; icon?: ReactNode
}) {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    ok: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-rose-600'
  }
  const accents: Record<string, string> = {
    default: 'bg-slate-200',
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-rose-500'
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04)] hover:border-slate-300 hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.06)] transition-all duration-200">
      <div className={`absolute top-0 left-0 right-0 h-1 ${accents[tone]}`} />
      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{label}</div>
      <div className={`text-3xl font-extrabold tracking-tight mt-2 ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs font-medium text-slate-500 mt-1.5 leading-relaxed">{sub}</div>}
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
