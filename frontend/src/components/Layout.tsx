import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, ROL_LABEL } from '../lib/auth'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/config', label: 'Configuración' },
  { to: '/usuarios', label: 'Usuarios', admin: true }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const items = NAV.filter(n => !n.admin || user?.rol === 'ADMIN')

  function salir() {
    logout()
    nav('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-line">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
          <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0 group">
            <img src="/pilli-logo.svg" alt="Pilli" className="w-9 h-9 rounded-xl" />
            <div className="leading-tight hidden sm:block">
              <div className="font-pilli font-bold text-sm">Pilli Contable</div>
              <div className="text-[11px] text-marino/50">ACDAN Consultores</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1 ml-auto">
            {items.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive ? 'bg-marino text-white' : 'text-marino/65 hover:bg-hueso hover:text-marino'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden md:block text-xs text-marino/60 max-w-40 truncate" title={user.email}>
                {user.nombre} · {ROL_LABEL[user.rol] || user.rol}
              </span>
              <button onClick={salir} className="btn btn-sm btn-ghost">Salir</button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-marino/40">
          <span>ACDAN Consultores · Clarity Fiscal</span>
          <span>Las contraseñas se guardan cifradas y nunca salen del servidor</span>
        </div>
      </footer>
    </div>
  )
}
