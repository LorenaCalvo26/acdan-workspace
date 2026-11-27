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

/** Liga pública del portal de un cliente, con el origen actual (local o túnel). */
export function portalUrl(rfc: string) {
  return `${window.location.origin}/c/${(rfc || '').trim().toUpperCase()}`
}

/** Copia al portapapeles con fallback para navegadores sin Clipboard API. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

type Resultado = { ok: boolean; error?: string }

type ResultadoEntrada = Resultado & { pedirPassword?: boolean }

type PortalCtx = {
  sesion: SesionCliente | null
  listo: boolean
  entrar: (rfc: string, codigo: string, recordar: boolean) => Promise<ResultadoEntrada>
  entrarConPassword: (rfc: string, password: string, recordar: boolean) => Promise<Resultado>
  crearPassword: (password: string) => Promise<Resultado>
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

  /**
   * Una sola entrada: se manda lo que escribió la persona en los dos campos.
   * El backend compara con el código y con la contraseña, y entra con la que
   * coincida. Así no hay que elegir en qué puerta tocar.
   */
  async function entrar(rfc: string, clave: string, recordar: boolean): Promise<ResultadoEntrada> {
    const valor = clave.trim()
    return conectar({ rfc: rfc.trim().toUpperCase(), codigo: valor, password: valor }, recordar)
  }

  /** Compatibilidad: la entrada por contraseña es la misma puerta. */
  async function entrarConPassword(rfc: string, password: string, recordar: boolean): Promise<Resultado> {
    return entrar(rfc, password, recordar)
  }

  async function conectar(cuerpo: Record<string, string>, recordar: boolean): Promise<ResultadoEntrada> {
    const r: any = await api('/portal/entrar', { method: 'POST', body: JSON.stringify(cuerpo) })
    if (r?.ok && r?.jwt && r?.rfc) {
      const s = { jwt: r.jwt as string, rfc: r.rfc as string, nombre: (r.nombre as string) || '' }
      guardarSesionCliente(s, recordar)
      if (recordar) setSesion(s)
      else setMemoria(s)
      return { ok: true, pedirPassword: !!r.pedirPassword }
    }
    return { ok: false, error: mensajeError(r, 'No se pudo entrar.') }
  }

  /** El contribuyente define su contraseña después de entrar con el código. */
  async function crearPassword(password: string): Promise<Resultado> {
    const s = sesion || memoria
    if (!s) return { ok: false, error: 'Sesión vencida, entra de nuevo.' }
    const r: any = await api('/portal/password/crear', {
      method: 'POST',
      body: JSON.stringify({ token: s.jwt, password })
    })
    if (r?.ok) return { ok: true }
    if (r?.error === 'PASSWORD_MIN_8') return { ok: false, error: 'Usa al menos 8 caracteres.' }
    return { ok: false, error: mensajeError(r, 'No se pudo guardar la contraseña.') }
  }

  function salir() {
    cerrarSesionCliente()
    setSesion(null)
    setMemoria(null)
  }

  return (
    <Ctx.Provider value={{ sesion: sesion || memoria, listo, entrar, entrarConPassword, crearPassword, salir }}>
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

export type MarcaPortal = { despacho: boolean; nombre: string; logoUrl: string }

/**
 * Marca que se muestra en el portal de un RFC: el despacho al que pertenece,
 * o ACDAN si es cliente individual. Es pública, se pide antes de iniciar sesión.
 */
export async function marcaPortal(rfc: string): Promise<MarcaPortal | null> {
  try {
    const r: any = await api('/portal/marca', { method: 'POST', body: JSON.stringify({ rfc: rfc.toUpperCase() }) })
    if (r?.ok) return { despacho: !!r.despacho, nombre: r.nombre || '', logoUrl: r.logoUrl || '' }
    return null
  } catch {
    return null
  }
}
