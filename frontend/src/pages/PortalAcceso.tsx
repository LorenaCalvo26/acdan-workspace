import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SiSesionAlResumen, usePortal } from '../lib/portal'
import { Spinner, Alert } from '../components/ui'

function formatearCodigo(v: string) {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

export default function PortalAcceso() {
  const { rfc } = useParams()
  const RFC = (rfc || '').toUpperCase()
  const { entrar } = usePortal()
  const nav = useNavigate()

  const [codigo, setCodigo] = useState('')
  const [recordar, setRecordar] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function acceder(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true); setError(null)
    try {
      const r = await entrar(RFC, codigo, recordar)
      if (!r.ok) { setError(r.error || 'No se pudo entrar.'); return }
      nav(`/c/${RFC}/resumen`, { replace: true })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <SiSesionAlResumen />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/pilli-logo.svg" alt="Pilli" className="w-20 h-20 mx-auto drop-shadow-lg" />
          <div className="font-pilli font-extrabold text-2xl mt-3 leading-none text-marino">
            Pilli <span className="text-dorado">Contable</span>
          </div>
          <div className="text-xs text-marino/50 mt-1">Portal del cliente · ACDAN Consultores</div>
        </div>

        <div className="relative isolate">
          <div aria-hidden="true" className="tech-spectrum tech-glow absolute -inset-6 -z-10 rounded-[3rem]" />
          <form onSubmit={acceder} className="card p-6 grid gap-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-marino font-pilli">Hola de nuevo</h1>
              <p className="text-sm text-marino/55 mt-1">
                Estás entrando como <b className="font-mono">{RFC}</b>. Escribe el código de acceso que te dio tu contador.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="campo-codigo">Código de acceso</label>
              <input
                id="campo-codigo"
                className="input text-center text-lg font-bold tracking-[0.2em] uppercase font-mono"
                value={codigo}
                onChange={e => { setCodigo(formatearCodigo(e.target.value)); setError(null) }}
                placeholder="XXXX-XXXX"
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={9}
              />
            </div>

            <label className="flex items-center gap-2.5 text-sm text-marino/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={recordar}
                onChange={e => setRecordar(e.target.checked)}
                className="h-4 w-4 rounded accent-[#C9A86A]"
              />
              Recordar en este navegador (30 días)
            </label>

            {error && <Alert variant="danger" titulo="No pudimos darte acceso">{error}</Alert>}

            <button className="btn-gold" disabled={cargando || codigo.replace(/[^A-Z0-9]/g, '').length < 8}>
              {cargando ? <><Spinner small /> Verificando…</> : 'Ver mi reporte'}
            </button>

            <p className="text-[11px] text-marino/40 text-center">
              ¿No tienes tu código? Pídelo a tu contador. <Link to="/" className="underline hover:text-marino">Ir al inicio</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
