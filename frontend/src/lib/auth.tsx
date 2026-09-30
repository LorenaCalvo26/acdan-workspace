import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from './api'

export type Rol = 'ADMIN' | 'OPERADOR'

export type Usuario = {
  userId: string
  email: string
  nombre: string
  rol: Rol
  status: string
}

type Sesion = { jwt: string; user: Usuario }

const SESSION_KEY = 'acdan-session'

export function leerSesion(): Sesion | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Sesion
    if (!s?.jwt || !s?.user?.email) return null
    return s
  } catch {
    return null
  }
}

export function guardarSesion(s: Sesion) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

export function cerrarSesion() {
  localStorage.removeItem(SESSION_KEY)
}

type Resultado = { ok: boolean; error?: string }

type AuthCtx = {
  user: Usuario | null
  jwt: string | null
  listo: boolean
  login: (email: string, password: string) => Promise<Resultado>
  logout: () => void
  crearUsuario: (nombre: string, email: string, password: string, rol: Rol) => Promise<Resultado>
  listarUsuarios: () => Promise<Usuario[]>
}

const Ctx = createContext<AuthCtx | null>(null)

function mensajeError(r: any, defecto: string): string {
  if (!r) return defecto
  if (r.error === 'SIN_CONEXION') return r.detail || defecto
  if (typeof r.error === 'string') {
    const mapa: Record<string, string> = {
      CREDENCIALES_INVALIDAS: 'Usuario o contraseña incorrectos.',
      USUARIO_INACTIVO: 'Usuario inactivo.',
      TOKEN_INVALIDO: 'Sesión vencida, entra de nuevo.',
      SOLO_ADMIN: 'Solo el admin puede crear usuarios.',
      EMAIL_YA_REGISTRADO: 'Ese correo ya está registrado.',
      EMAIL_INVALIDO: 'Correo inválido.',
      PASSWORD_MIN_8: 'La contraseña debe tener al menos 8 caracteres.',
      ROL_INVALIDO: 'Rol inválido.'
    }
    return mapa[r.error] || r.error
  }
  return defecto
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [listo, setListo] = useState(false)

  // Al cargar, valida la sesión guardada contra el backend.
  useEffect(() => {
    (async () => {
      const s = leerSesion()
      if (!s) { setListo(true); return }
      const me: any = await api('/auth/me', { method: 'POST', body: JSON.stringify({ token: s.jwt }) })
      if (me?.ok && me?.user) setSesion({ jwt: s.jwt, user: me.user as Usuario })
      else cerrarSesion()
      setListo(true)
    })()
  }, [])

  async function login(email: string, password: string): Promise<Resultado> {
    const r: any = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    if (r?.ok && r?.jwt && r?.user) {
      const s = { jwt: r.jwt as string, user: r.user as Usuario }
      guardarSesion(s)
      setSesion(s)
      return { ok: true }
    }
    return { ok: false, error: mensajeError(r, 'No se pudo iniciar sesión.') }
  }

  function logout() {
    cerrarSesion()
    setSesion(null)
  }

  async function crearUsuario(nombre: string, email: string, password: string, rol: Rol): Promise<Resultado> {
    if (!sesion) return { ok: false, error: 'Sesión vencida, entra de nuevo.' }
    const r: any = await api('/auth/usuarios', {
      method: 'POST',
      body: JSON.stringify({ token: sesion.jwt, nombre, email, password, rol })
    })
    if (r?.ok) return { ok: true }
    return { ok: false, error: mensajeError(r, 'No se pudo crear el usuario.') }
  }

  async function listarUsuarios(): Promise<Usuario[]> {
    if (!sesion) return []
    const r: any = await api('/auth/usuarios/list', { method: 'POST', body: JSON.stringify({ token: sesion.jwt }) })
    return Array.isArray(r) ? (r as Usuario[]) : []
  }

  return (
    <Ctx.Provider value={{ user: sesion?.user || null, jwt: sesion?.jwt || null, listo, login, logout, crearUsuario, listarUsuarios }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, listo } = useAuth()
  const loc = useLocation()
  if (!listo) return <div className="grid gap-3"><div className="skeleton h-24" /><div className="skeleton h-64" /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, listo } = useAuth()
  if (!listo) return <div className="grid gap-3"><div className="skeleton h-24" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (user.rol !== 'ADMIN') {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Acceso restringido</h1>
        <p className="text-sm text-marino/60 mt-1">Solo el administrador puede crear usuarios de la plataforma.</p>
      </div>
    )
  }
  return <>{children}</>
}

export const ROL_LABEL: Record<Rol, string> = { ADMIN: 'Admin', OPERADOR: 'Operador' }
