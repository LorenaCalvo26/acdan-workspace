import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { api } from './api'

export type SesionCliente = { jwt: string; rfc: string; nombre: string }

const SESSION_KEY = 'pilli-cliente-session'

export function leerSesionCliente(): SesionCliente | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SesionCliente
    if (!s?.jwt || !s?.rfc) return null
    return s
  } catch {
    return null
  }
}

function guardarSesionCliente(s: SesionCliente, recordar: boolean) {
  // Sin "recordar", la sesión vive solo en memoria (se pierde al cerrar la pestaña).
  if (recordar) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  else localStorage.removeItem(SESSION_KEY)
}

export function cerrarSesionCliente() {
  localStorage.removeItem(SESSION_KEY)
}

type Resultado = { ok: boolean; error?: string }

type PortalCtx = {
  sesion: SesionCliente | null
  listo: boolean
  entrar: (rfc: string, codigo: string, recordar: boolean) => Promise<Resultado>
  salir: () => void
}

const Ctx = createContext<PortalCtx | null>(null)

const ERRORES: Record<string, string> = {
  CODIGO_INVALIDO: 'Código incorrecto. Revísalo e intenta de nuevo.',
  BLOQUEADO_TEMPORAL: 'Demasiados intentos. Espera 10 minutos e intenta de nuevo.',
  DATOS_INCOMPLETOS: 'Escribe tu RFC y el código de acceso.',
  SESION_VENCIDA: 'Tu sesión venció. Entra de nuevo con tu código.',
  CLIENTE_NO_ENCONTRADO: 'No encontramos ese RFC.',
  SIN_CONEXION: 'No llegamos al servidor. Revisa tu conexión.',
}

function mensajeError(r: any, defecto: string): string {
  if (!r) return defecto
  if (r.error === 'SIN_CONEXION') return r.detail || defecto
  if (typeof r.error === 'string') return ERRORES[r.error] || r.error
  return defecto
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionCliente | null>(null)
  const [memoria, setMemoria] = useState<SesionCliente | null>(null)
  const [listo, setListo] = useState(false)

  // Al cargar, valida la sesión guardada contra el backend.
  useEffect(() => {
    (async () => {
      const s = leerSesionCliente()
      if (!s) { setListo(true); return }
      const me: any = await api('/portal/sesion', { method: 'POST', body: JSON.stringify({ token: s.jwt }) })
      if (me?.ok && me?.rfc) setSesion({ jwt: s.jwt, rfc: me.rfc, nombre: me.nombre || '' })
      else cerrarSesionCliente()
      setListo(true)
    })()
  }, [])

  async function entrar(rfc: string, codigo: string, recordar: boolean): Promise<Resultado> {
    const r: any = await api('/portal/entrar', {
      method: 'POST',
      body: JSON.stringify({ rfc: rfc.trim().toUpperCase(), codigo })
    })
    if (r?.ok && r?.jwt && r?.rfc) {
      const s = { jwt: r.jwt as string, rfc: r.rfc as string, nombre: (r.nombre as string) || '' }
      guardarSesionCliente(s, recordar)
      if (recordar) setSesion(s)
      else setMemoria(s)
      return { ok: true }
    }
    return { ok: false, error: mensajeError(r, 'No se pudo entrar.') }
  }

  function salir() {
    cerrarSesionCliente()
    setSesion(null)
    setMemoria(null)
  }

  return (
    <Ctx.Provider value={{ sesion: sesion || memoria, listo, entrar, salir }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePortal(): PortalCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePortal debe usarse dentro de <PortalProvider>')
  return ctx
}

/** Protege /c/:rfc/resumen: sin sesión válida del mismo RFC, manda al acceso. */
export function RequirePortal({ children }: { children: ReactNode }) {
  const { sesion, listo } = usePortal()
  const { rfc } = useParams()
  const RFC = (rfc || '').toUpperCase()
  if (!listo) return <div className="grid gap-3"><div className="skeleton h-24" /><div className="skeleton h-64" /></div>
  if (!sesion || sesion.rfc.toUpperCase() !== RFC) {
    return <Navigate to={`/c/${RFC}`} replace />
  }
  return <>{children}</>
}

/** Redirige al resumen si ya hay sesión válida para este RFC. */
export function SiSesionAlResumen() {
  const { sesion, listo } = usePortal()
  const { rfc } = useParams()
  const loc = useLocation()
  if (!listo) return null
  if (sesion && sesion.rfc.toUpperCase() === (rfc || '').toUpperCase()) {
    return <Navigate to={`/c/${sesion.rfc}/resumen`} replace state={loc.state} />
  }
  return null
}
