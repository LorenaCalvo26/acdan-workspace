import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Spinner, Alert } from '../components/ui'

// El gif dura ~4.5s: se muestra una vez con fundido de salida para tapar
// el loop, y queda el logo fijo. Sin bucles; respeta movimiento reducido.
function LogoAnimado() {
  const [fase, setFase] = useState<'gif' | 'saliendo' | 'fijo'>(() =>
    typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'gif' : 'fijo'
  )
  useEffect(() => {
    if (fase !== 'gif') return
    const sale = setTimeout(() => setFase('saliendo'), 4000)
    const fija = setTimeout(() => setFase('fijo'), 4500)
    return () => { clearTimeout(sale); clearTimeout(fija) }
  }, [fase])
  if (fase === 'fijo') {
    return <img src="/pilli-logo.svg" alt="Pilli" className="logo-entrada w-20 h-20 mx-auto drop-shadow-lg" />
  }
  return (
    <img
      src="/pilli-animated.gif"
      alt="Pilli"
      className={`w-20 h-20 mx-auto drop-shadow-lg rounded-2xl object-cover transition-opacity duration-500 ${fase === 'saliendo' ? 'opacity-0' : 'opacity-100'}`}
    />
  )
}

export default function Login() {
  const { user, listo, login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as any
  const from = loc.state?.from || '/resumen'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  if (listo && user) return <Navigate to={from} replace />

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true); setError(null)
    try {
      const r = await login(email, password)
      if (!r.ok) { setError(r.error || 'No se pudo iniciar sesión.'); return }
      nav(from, { replace: true })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-block text-xs font-semibold text-marino/55 hover:text-marino transition-colors mb-5">
          ← Volver
        </Link>
        <div className="text-center mb-6">
          <LogoAnimado />
          <div className="font-pilli font-extrabold text-2xl mt-3 leading-none text-marino">
            Pilli <span className="text-dorado">Contable</span>
          </div>
          <div className="text-xs text-marino/50 mt-1">ACDAN Consultores</div>
        </div>

        <div className="relative isolate">
          <div aria-hidden="true" className="tech-spectrum tech-glow absolute -inset-6 -z-10 rounded-[3rem]" />
          <form onSubmit={entrar} className="card p-6 grid gap-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-marino font-pilli">Iniciar sesión</h1>
            <p className="text-sm text-marino/55 mt-1">Al entrar irás directo al resumen fiscal principal.</p>
          </div>

          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" placeholder="tu@correo.mx" />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Tu contraseña" />
          </div>

          {error && <Alert variant="danger" titulo="No pudimos iniciar sesión">{error}</Alert>}

          <button className="btn-gold" disabled={cargando}>
            {cargando ? <><Spinner small /> Entrando…</> : 'Entrar al dashboard'}
          </button>

          <p className="text-[11px] text-marino/40">
            Tu cuenta la crea el administrador de la plataforma.
          </p>
        </form>
        </div>
      </div>
    </div>
  )
}
