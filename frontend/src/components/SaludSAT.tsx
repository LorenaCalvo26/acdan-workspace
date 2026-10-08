import { useCallback, useEffect, useState } from 'react'
import { api, haceRato } from '../lib/api'
import { Spinner } from './ui'

type Host = { nombre: string; alcanzable: boolean; codigo: number; ms: number; nota: string }
type Salud = { ok?: boolean; estado?: 'vivo' | 'degradado' | 'caido'; medidoEn?: string; hosts?: Host[]; error?: string }

/**
 * Heartbeat del SAT: sonda ligera (sin captcha ni login, no gasta intentos).
 * Se consulta al montar y con el botón; nunca en automático para no
 * martillar al SAT.
 */
export default function SaludSAT() {
  const [s, setS] = useState<Salud | null>(null)
  const [cargando, setCargando] = useState(false)
  const [medidoHace, setMedidoHace] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r: any = await api('/sat/salud')
      setS(r)
      setMedidoHace(new Date().toISOString())
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const estado = s?.estado
  const tono = estado === 'vivo'
    ? 'bg-emerald-500'
    : estado === 'degradado'
      ? 'bg-amber-500 animate-pulse'
      : estado === 'caido'
        ? 'bg-red-500 animate-pulse'
        : 'bg-marino/30'
  const etiqueta = estado === 'vivo' ? 'SAT responde'
    : estado === 'degradado' ? 'SAT con filtros o lento'
    : estado === 'caido' ? 'SAT no responde'
    : s?.error ? 'Sin medición' : 'Midiendo…'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-white px-3.5 py-2.5">
      <span className="inline-flex items-center gap-2 text-xs font-bold text-marino">
        <span className={`w-2 h-2 rounded-full ${tono}`} />
        {cargando ? <span className="inline-flex items-center gap-1.5"><Spinner small /> Sondeando…</span> : etiqueta}
      </span>
      {s?.hosts?.map(h => (
        <span key={h.nombre} title={`${h.nombre}: HTTP ${h.codigo} · ${h.nota}`} className="inline-flex items-center gap-1 text-[11px] text-marino/55 tabular-nums">
          <span className={`w-1.5 h-1.5 rounded-full ${h.nota === 'ok' ? 'bg-emerald-500' : h.alcanzable ? 'bg-amber-500' : 'bg-red-400'}`} />
          {h.nombre} {(h.ms / 1000).toFixed(1)}s
        </span>
      ))}
      {medidoHace && !cargando && (
        <span className="text-[11px] text-marino/40">hace {haceRato(medidoHace).replace('hace ', '')}</span>
      )}
      <button
        type="button"
        onClick={cargar}
        disabled={cargando}
        title="Volver a sondear"
        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-marino/55 hover:text-marino hover:border-dorado transition-colors disabled:opacity-50"
      >
        ↻
      </button>
    </div>
  )
}
