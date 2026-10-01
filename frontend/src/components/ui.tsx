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
  const tones: Record<string, { text: string; bg: string; border: string; glow: string }> = {
    default: {
      text: 'text-marino',
      bg: 'bg-marino/5 text-marino',
      border: 'border-marino/10',
      glow: 'from-marino/10 to-transparent'
    },
    ok: {
      text: 'text-emerald-700',
      bg: 'bg-emerald-500/10 text-emerald-600',
      border: 'border-emerald-500/20',
      glow: 'from-emerald-500/15 to-transparent'
    },
    warn: {
      text: 'text-amber-700',
      bg: 'bg-amber-500/10 text-amber-600',
      border: 'border-amber-500/20',
      glow: 'from-amber-500/15 to-transparent'
    },
    bad: {
      text: 'text-rose-700',
      bg: 'bg-rose-500/10 text-rose-600',
      border: 'border-rose-500/20',
      glow: 'from-rose-500/15 to-transparent'
    }
  }

  const t = tones[tone] || tones.default

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-line/70 p-5 shadow-[0_4px_20px_-4px_rgba(15,42,68,0.05)] hover:shadow-[0_12px_32px_-6px_rgba(15,42,68,0.1)] hover:-translate-y-0.5 hover:border-marino/30 transition-all duration-300 group">
      <div className={`absolute -top-6 -right-6 w-28 h-28 bg-gradient-to-bl ${t.glow} rounded-full blur-xl pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-300`} />
      
      <div className="flex items-center justify-between gap-2 relative z-10">
        <span className="text-[11px] uppercase tracking-wider font-extrabold text-marino/50">{label}</span>
        {icon && (
          <div className={`w-8 h-8 rounded-xl grid place-items-center ${t.bg} border ${t.border} shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105`}>
            {icon}
          </div>
        )}
      </div>

      <div className={`text-3xl font-extrabold tracking-tight mt-2.5 font-pilli relative z-10 ${t.text}`}>
        {value}
      </div>

      {sub && (
        <div className="text-xs font-medium text-marino/60 mt-2 relative z-10">
          {sub}
        </div>
      )}
    </div>
  )
}

export function Seccion({ titulo, desc, accion, children }: {
  titulo: string; desc?: string; accion?: ReactNode; children: ReactNode
}) {
  return (
    <section className="card overflow-hidden anim-in">
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line/80 bg-white/50">
        <div>
          <h2 className="font-bold text-[15px] text-marino">{titulo}</h2>
          {desc && <p className="text-xs text-marino/50 mt-0.5">{desc}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  )
}

export function PageHeader({ titulo, desc, accion }: {
  titulo: string; desc?: string; accion?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 anim-in">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-marino font-pilli leading-tight">{titulo}</h1>
        {desc && <p className="text-sm text-marino/50 mt-0.5">{desc}</p>}
      </div>
      {accion}
    </div>
  )
}

type AlertVariant = 'danger' | 'success' | 'warning' | 'info'

const ALERTS: Record<AlertVariant, { box: string; badge: string; head: string; path: ReactNode }> = {
  danger: {
    box: 'bg-rose-50 border-rose-200 text-rose-900',
    badge: 'bg-rose-100 text-rose-600 border-rose-200',
    head: 'text-rose-900',
    path: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4.5" /><path d="M12 16h.01" /></>
  },
  success: {
    box: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    badge: 'bg-emerald-100 text-emerald-600 border-emerald-200',
    head: 'text-emerald-900',
    path: <><circle cx="12" cy="12" r="10" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-900',
    badge: 'bg-amber-100 text-amber-600 border-amber-200',
    head: 'text-amber-900',
    path: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>
  },
  info: {
    box: 'bg-sky-50 border-sky-200 text-sky-900',
    badge: 'bg-sky-100 text-sky-600 border-sky-200',
    head: 'text-sky-900',
    path: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4.5" /><path d="M12 8h.01" /></>
  }
}

/**
 * Alert genérico (equivalente a `.alert` de Bootstrap) con la paleta de Pilli.
 * Soporta título, contenido, lista de detalles y cierre (`.alert-dismissible`).
 */
export function Alert({ variant = 'info', titulo, children, onClose, className = '' }: {
  variant?: AlertVariant
  titulo?: string
  children?: ReactNode
  onClose?: () => void
  className?: string
}) {
  const v = ALERTS[variant] || ALERTS.info
  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3 rounded-xl border px-4 py-3 anim-in ${v.box} ${className}`}
    >
      <span className={`shrink-0 w-7 h-7 rounded-lg grid place-items-center border ${v.badge}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {v.path}
        </svg>
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {titulo && <div className={`font-bold mb-0.5 ${v.head}`}>{titulo}</div>}
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="shrink-0 -mt-0.5 -mr-1 w-6 h-6 rounded-lg grid place-items-center opacity-45 hover:opacity-90 hover:bg-black/5 transition-all"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  )
}
