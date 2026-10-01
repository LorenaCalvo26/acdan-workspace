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
  const items = NAV.filter(n => !n.admin || user?.rol === 'ADMIN')

  function salir() {
    logout()
    nav('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col bg-hueso">
      <header className="w-full bg-transparent py-3">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-6">
          <Link to="/resumen" className="flex items-center gap-3 shrink-0">
            <img src="/pilli-logo.svg" alt="Pilli" className="w-11 h-11 rounded-xl drop-shadow-sm" />
            <div className="leading-tight hidden sm:block">
              <div className="font-pilli font-extrabold text-base text-slate-800">pilli Contable</div>
              <div className="text-[11px] font-medium text-slate-400">ACDAN Consultores</div>
            </div>
          </Link>

          <nav className="flex items-center gap-6 ml-auto">
            {items.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `py-1 text-sm font-medium transition-all relative ${
                    isActive
                      ? 'text-slate-900 font-bold border-b-2 border-slate-900'
                      : 'text-slate-500 hover:text-slate-800'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className="flex items-center gap-3 shrink-0 ml-4 border-l border-slate-200 pl-4">
              <span className="hidden md:block text-xs text-slate-500 max-w-40 truncate" title={user.email}>
                {user.nombre}
              </span>
              <button onClick={salir} className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">Salir</button>
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
