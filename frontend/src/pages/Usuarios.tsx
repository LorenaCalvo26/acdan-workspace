import { useEffect, useState } from 'react'
import { useAuth, ROL_LABEL, type Rol, type Usuario } from '../lib/auth'
import { Spinner } from '../components/ui'

export default function Usuarios() {
  const { user, crearUsuario, listarUsuarios } = useAuth()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('OPERADOR')
  const [msg, setMsg] = useState<{ txt: string; bad?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      setUsuarios(await listarUsuarios())
      setCargando(false)
    })()
  }, [])

  if (user?.rol !== 'ADMIN') {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Acceso restringido</h1>
        <p className="text-sm text-marino/60 mt-1">Solo el administrador puede crear usuarios de la plataforma.</p>
      </div>
    )
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setMsg(null)
    try {
      const r = await crearUsuario(nombre, email, password, rol)
      if (!r.ok) { setMsg({ txt: r.error || 'No se pudo crear el usuario.', bad: true }); return }
      setMsg({ txt: `Usuario ${email.trim().toLowerCase()} creado con rol ${ROL_LABEL[rol]}.` })
      setNombre(''); setEmail(''); setPassword(''); setRol('OPERADOR')
      setUsuarios(await listarUsuarios())
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-sm text-marino/55">Solo el admin puede dar de alta usuarios. Cada usuario entra con su correo y contraseña.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={guardar} className="card p-5 grid gap-4 content-start">
          <h2 className="font-bold">Nuevo usuario</h2>
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" />
          </div>
          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@acdan.mx" />
          </div>
          <div>
            <label className="label">Contraseña temporal</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
          </div>
          <div>
            <label className="label">Rol</label>
            <div className="flex gap-2">
              {(['ADMIN', 'OPERADOR'] as Rol[]).map(r => (
                <button key={r} type="button" onClick={() => setRol(r)} className={`chip ${rol === r ? 'bg-marino text-white border-marino' : ''}`}>
                  {ROL_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="text-xs text-marino/45 mt-1.5">Admin: puede crear usuarios. Operador: usa el dashboard y clientes.</p>
          </div>
          {msg && <div className={`text-sm ${msg.bad ? 'text-red-700' : 'text-emerald-700'}`}>{msg.txt}</div>}
          <button className="btn-gold" disabled={guardando}>
            {guardando ? <><Spinner small /> Guardando…</> : 'Crear usuario'}
          </button>
        </form>

        <section className="card p-5">
          <h2 className="font-bold mb-3">Usuarios registrados ({usuarios.length})</h2>
          {cargando ? (
            <div className="grid gap-2"><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
          ) : usuarios.length === 0 ? (
            <p className="text-sm text-marino/55">Aún no hay usuarios.</p>
          ) : (
            <div className="divide-y divide-line">
              {usuarios.map(u => (
                <div key={u.userId} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{u.nombre}</div>
                    <div className="text-xs text-marino/50 truncate">{u.email}</div>
                  </div>
                  <span className={`badge ${u.rol === 'ADMIN' ? 'bg-marino text-white' : 'bg-hueso text-marino/70'}`}>{ROL_LABEL[u.rol] || u.rol}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
