import { useEffect, useState } from 'react'
import { useAuth, ROL_LABEL, type Rol, type Usuario } from '../lib/auth'
import { Spinner, Alert, Seccion, PageHeader, Vacio } from '../components/ui'

const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ERROR_AMABLE: Record<string, string> = {
  LIMITE_USUARIOS: 'Tu plan incluye hasta 3 usuarios. Para agregar más, hablamos del siguiente nivel.',
  EMAIL_YA_REGISTRADO: 'Ese correo ya tiene usuario.',
}

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
  const [tocado, setTocado] = useState<Record<string, boolean>>({})

  useEffect(() => {
    (async () => {
      setUsuarios(await listarUsuarios())
      setCargando(false)
    })()
  }, [])

  if (user?.rol !== 'ADMIN') {
    return (
      <div className="card p-6 anim-in">
        <Alert variant="warning" titulo="Acceso restringido">
          Solo el administrador puede crear usuarios de la plataforma.
        </Alert>
      </div>
    )
  }

  const errores = {
    nombre: nombre.trim() === '' ? 'Escribe el nombre de la persona.' : '',
    email: email.trim() === '' ? 'El correo es obligatorio.' : !RE_MAIL.test(email.trim()) ? 'Ese correo no parece válido. Ejemplo: usuario@acdan.mx' : '',
    password: password === '' ? 'Asigna una contraseña temporal.' : password.length < 8 ? 'Mínimo 8 caracteres.' : ''
  }
  const primerError = errores.nombre || errores.email || errores.password
  const marca = (k: keyof typeof errores) => (tocado[k] && errores[k] ? 'input-error' : '')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setTocado({ nombre: true, email: true, password: true })
    if (primerError) { setMsg({ txt: 'Revisa los campos marcados.', bad: true }); return }
    setGuardando(true); setMsg(null)
    try {
      const r = await crearUsuario(nombre, email, password, rol)
      if (!r.ok) { setMsg({ txt: (r.error && ERROR_AMABLE[r.error]) || r.error || 'No se pudo crear el usuario.', bad: true }); return }
      setMsg({ txt: `Usuario ${email.trim().toLowerCase()} creado con rol ${ROL_LABEL[rol]}.` })
      setNombre(''); setEmail(''); setPassword(''); setRol('OPERADOR'); setTocado({})
      setUsuarios(await listarUsuarios())
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader titulo="Usuarios" desc="Solo el admin puede dar de alta usuarios. Cada usuario entra con su correo y contraseña." />

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Seccion titulo="Nuevo usuario" desc="Se crea con rol y puede entrar de inmediato">
          <form onSubmit={guardar} className="px-6 py-5 grid gap-4">
            <div>
              <label className="label">Nombre</label>
              <input
                className={`input ${marca('nombre')}`}
                value={nombre}
                aria-invalid={!!(tocado.nombre && errores.nombre)}
                onChange={e => { setNombre(e.target.value); setMsg(null) }}
                onBlur={() => setTocado(t => ({ ...t, nombre: true }))}
                placeholder="Nombre completo"
              />
              {tocado.nombre && errores.nombre && <p className="invalid-feedback">{errores.nombre}</p>}
            </div>
            <div>
              <label className="label">Correo</label>
              <input
                className={`input ${marca('email')}`}
                type="email"
                value={email}
                aria-invalid={!!(tocado.email && errores.email)}
                onChange={e => { setEmail(e.target.value); setMsg(null) }}
                onBlur={() => setTocado(t => ({ ...t, email: true }))}
                placeholder="usuario@acdan.mx"
              />
              {tocado.email && errores.email && <p className="invalid-feedback">{errores.email}</p>}
            </div>
            <div>
              <label className="label">Contraseña temporal</label>
              <input
                className={`input ${marca('password')}`}
                type="password"
                value={password}
                aria-invalid={!!(tocado.password && errores.password)}
                onChange={e => { setPassword(e.target.value); setMsg(null) }}
                onBlur={() => setTocado(t => ({ ...t, password: true }))}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
              {tocado.password && errores.password ? (
                <p className="invalid-feedback">{errores.password}</p>
              ) : (
                <p className="text-xs text-marino/45 mt-1">Pídele cambiarlo en su primer ingreso.</p>
              )}
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
            {msg && <Alert variant={msg.bad ? 'danger' : 'success'}>{msg.txt}</Alert>}
            <button className="btn-gold" disabled={guardando}>
              {guardando ? <><Spinner small /> Guardando…</> : 'Crear usuario'}
            </button>
          </form>
        </Seccion>

        <Seccion titulo="Usuarios registrados" desc={`${usuarios.length} cuenta(s) en la plataforma`}>
          {cargando ? (
            <div className="px-6 py-5 grid gap-2"><div className="skeleton h-10" /><div className="skeleton h-10" /></div>
          ) : usuarios.length === 0 ? (
            <Vacio titulo="Aún no hay usuarios" hint="Crea el primero con el formulario." />
          ) : (
            <div className="divide-y divide-line/60">
              {usuarios.map(u => (
                <div key={u.userId} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-marino truncate">{u.nombre}</div>
                    <div className="text-xs text-marino/50 truncate">{u.email}</div>
                  </div>
                  <span className={`badge shrink-0 ${u.rol === 'ADMIN' ? 'bg-marino text-white' : 'bg-hueso text-marino/70 border border-line'}`}>{ROL_LABEL[u.rol] || u.rol}</span>
                </div>
              ))}
            </div>
          )}
        </Seccion>
      </div>
    </div>
  )
}
