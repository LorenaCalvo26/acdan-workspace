import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SiSesionAlResumen, usePortal, marcaPortal, type MarcaPortal } from '../lib/portal'
import { Spinner, Alert, CamposObligatorios } from '../components/ui'

function formatearCodigo(v: string) {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

export default function PortalAcceso() {
  const { rfc } = useParams()
  const [marca, setMarca] = useState<MarcaPortal | null>(null)
  const RFC = (rfc || '').toUpperCase()
  const { entrar, entrarConPassword, crearPassword } = usePortal()
  const nav = useNavigate()

  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  // codigo = entrar con el enlace del contador · password = ya tiene la suya
  // Una sola entrada para las dos cosas: código de acceso o contraseña.
  const claveDispositivo = `pilli-portal-pass-${RFC}`
  // tras entrar con código se le invita a crear su contraseña
  const [creando, setCreando] = useState(false)
  const [recordar, setRecordar] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function acceder(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true); setError(null)
    try {
      const r = await entrar(RFC, codigo, recordar)
      if (!r.ok) { setError(r.error || 'No se pudo entrar.'); return }
      // Primera vez con código: se le pide elegir su contraseña.
      if ('pedirPassword' in r && r.pedirPassword) { setCreando(true); return }
      nav(`/c/${RFC}/resumen`, { replace: true })
    } finally {
      setCargando(false)
    }
  }

  async function guardarPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Usa al menos 8 caracteres.'); return }
    if (password !== confirmar) { setError('Las dos contraseñas no coinciden.'); return }
    setCargando(true); setError(null)
    try {
      const r = await crearPassword(password)
      if (!r.ok) { setError(r.error || 'No se pudo guardar.'); return }
      try { localStorage.setItem(claveDispositivo, '1') } catch { /* nada */ }
      nav(`/c/${RFC}/resumen`, { replace: true })
    } finally {
      setCargando(false)
    }
  }

  const encabezado = (
    <div className="text-center mb-6">
      {marca?.logoUrl
        ? <img src={marca.logoUrl} alt={marca.nombre} className="logo-entrada h-20 max-w-[220px] object-contain mx-auto drop-shadow-lg" />
        : <img src="/pilli-logo.svg" alt="Pilli" className="logo-entrada w-20 h-20 mx-auto drop-shadow-lg" />}
      <div className="font-pilli font-extrabold text-2xl mt-3 leading-none text-marino">
        {marca?.despacho ? marca.nombre : <>Pilli <span className="text-dorado">Contable</span></>}
      </div>
      <div className="text-xs text-marino/50 mt-1">
        {marca?.despacho ? 'Portal del cliente' : 'Portal del cliente · ACDAN Consultores'}
      </div>
      {marca?.despacho && (
        <div className="text-[11px] text-marino/35 mt-1">powered by <span className="font-semibold text-marino/50">Pilli</span></div>
      )}
    </div>
  )

  // Tras entrar con el código se le invita a elegir su contraseña.
  if (creando) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md min-w-0">
          {encabezado}
          <div className="relative isolate">
            <div aria-hidden="true" className="tech-spectrum tech-glow absolute -inset-6 -z-10 rounded-[3rem]" />
            <form onSubmit={guardarPassword} className="card p-6 grid gap-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-marino font-pilli">Elige tu contraseña</h1>
              <p className="text-sm text-marino/55 mt-1">
                Ya entraste con el código. Define tu contraseña para la próxima vez y no tengas que pedir otro.
              </p>
            </div>
            <CamposObligatorios />
            <div>
              <label className="label" htmlFor="campo-pass">Contraseña *</label>
              <input id="campo-pass" className="input" type="password" value={password}
                onChange={e => { setPassword(e.target.value); setError(null) }}
                placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
            </div>
            <div>
              <label className="label" htmlFor="campo-pass2">Repite la contraseña *</label>
              <input id="campo-pass2" className="input" type="password" value={confirmar}
                onChange={e => { setConfirmar(e.target.value); setError(null) }} autoComplete="new-password" />
            </div>
            {error && <Alert variant="danger" titulo="No pudimos guardarla">{error}</Alert>}
              <button className="btn-gold" disabled={cargando || password.length < 8}>
                {cargando ? <><Spinner small /> Guardando…</> : 'Guardar y entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <SiSesionAlResumen />
      <div className="w-full max-w-md min-w-0">
        {encabezado}

        <div className="relative isolate">
          <div aria-hidden="true" className="tech-spectrum tech-glow absolute -inset-6 -z-10 rounded-[3rem]" />
          <form onSubmit={acceder} className="card p-6 grid gap-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-marino font-pilli">Hola de nuevo</h1>
              <p className="text-sm text-marino/55 mt-1">
                Estás entrando como <b className="font-mono">{RFC}</b>. Escribe tu código de acceso o tu contraseña.
              </p>
            </div>

            <CamposObligatorios />

            <div>
              <label className="label" htmlFor="campo-clave">Código de acceso o contraseña *</label>
              <input
                id="campo-clave"
                className="input text-center font-mono"
                value={codigo}
                onChange={e => { setCodigo(e.target.value); setError(null) }}
                placeholder="XXXX-XXXX o tu contraseña"
                autoComplete="current-password"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <p className="text-[11px] text-marino/40 mt-1.5">
                La primera vez es el código que te llegó por correo; después, la contraseña que elegiste.
              </p>
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

            <button className="btn-gold" disabled={cargando || codigo.trim().length < 4}>
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
