import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, ROL_LABEL } from '../lib/auth'

const NAV = [
  { to: '/resumen', label: 'Inicio' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/config', label: 'Configuración' },
  { to: '/usuarios', label: 'Usuarios', admin: true }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const items = NAV.filter(n => !n.admin || user?.rol === 'ADMIN')

  function salir() {
    logout()
    setAbierto(false)
    nav('/login', { replace: true })
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `py-1 text-sm font-medium transition-all relative ${
      isActive
        ? 'text-marino font-bold border-b-2 border-dorado'
        : 'text-marino/50 hover:text-marino'
    }`

  return (
    <div className="min-h-screen flex flex-col bg-hueso">
      <header className="w-full bg-transparent py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4 sm:gap-6">
          <Link to="/resumen" className="flex items-center gap-3 shrink-0" onClick={() => setAbierto(false)}>
            <img src="/pilli-logo.svg" alt="Pilli" className="w-11 h-11 rounded-xl drop-shadow-sm" />
            <div className="leading-tight hidden sm:block">
              <div className="font-pilli font-extrabold text-base text-marino">Pilli <span className="text-dorado">Contable</span></div>
              <div className="text-[11px] font-medium text-marino/45">ACDAN Consultores</div>
            </div>
          </Link>

          {/* Navegación de escritorio */}
          <nav className="hidden md:flex items-center gap-6 ml-auto">
            {items.map(n => (
              <NavLink key={n.to} to={n.to} className={linkCls}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className="hidden md:flex items-center gap-3 shrink-0 ml-4 border-l border-line pl-4">
              <span className="hidden lg:block text-xs text-marino/55 max-w-40 truncate" title={user.email}>
                {user.nombre}
              </span>
              <span className="text-[11px] font-bold text-marino/50 border border-line rounded-full px-2 py-0.5">{ROL_LABEL[user.rol] || user.rol}</span>
              <button onClick={salir} className="text-xs font-medium text-marino/40 hover:text-marino transition-colors">Salir</button>
            </div>
          )}

          {/* Botón hamburguesa en móvil */}
          <button
            type="button"
            onClick={() => setAbierto(v => !v)}
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            className="md:hidden ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-marino"
          >
            {abierto ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            )}
          </button>
        </div>

        {/* Panel móvil */}
        {abierto && (
          <nav className="md:hidden mx-4 mt-1 rounded-2xl border border-line/70 bg-white shadow-card overflow-hidden anim-in">
            <div className="grid gap-1 p-3">
              {items.map(n => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  onClick={() => setAbierto(false)}
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors ${
                      isActive ? 'bg-hueso text-marino' : 'text-marino/65 hover:bg-hueso/60'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
            {user && (
              <div className="border-t border-line/70 px-4 py-3 flex items-center justify-between gap-3 bg-hueso/50">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-marino truncate">{user.nombre}</div>
                  <div className="text-xs text-marino/50 truncate">{user.email} · {ROL_LABEL[user.rol] || user.rol}</div>
                </div>
                <button onClick={salir} className="btn-ghost btn-sm shrink-0">Salir</button>
              </div>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6 min-w-0">
        <Outlet />
      </main>

      <footer className="border-t border-line py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-marino/40">
          <span>ACDAN Consultores · Clarity Fiscal</span>
          <span>Las contraseñas se guardan cifradas y nunca salen del servidor</span>
        </div>
      </footer>
    </div>
  )
}
