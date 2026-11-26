import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Alert, CamposObligatorios } from './ui'

/**
 * Aviso bloqueante: si la contraseña la generó Pilli, no se deja usar el panel
 * hasta que la persona elija la suya. Se monta en el layout, así cubre todas
 * las pantallas del personal.
 */
export default function DebeCambiarPassword() {
  const { user, cambiarPassword, actualizarUsuario, logout } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  if (!user?.debeCambiarPassword) return null

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (nueva.length < 8) { setError('Usa al menos 8 caracteres.'); return }
    if (nueva !== repetir) { setError('Las dos contraseñas no coinciden.'); return }
    setGuardando(true); setError(null)
    try {
      const r = await cambiarPassword(actual, nueva)
      if (!r.ok) { setError(r.error || 'No se pudo cambiar.'); return }
      actualizarUsuario({ debeCambiarPassword: false })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-marino/40 backdrop-blur-sm flex items-center justify-center px-4">
      <form onSubmit={guardar} className="card p-6 w-full max-w-md grid gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-marino font-pilli">Cambia tu contraseña</h2>
          <p className="text-sm text-marino/60 mt-1">
            Entraste con la contraseña temporal que te envió Pilli. Elige una propia para continuar.
          </p>
        </div>
        <CamposObligatorios />
        <div>
          <label className="label" htmlFor="p-actual">Contraseña temporal *</label>
          <input id="p-actual" className="input" type="password" value={actual}
            onChange={e => { setActual(e.target.value); setError(null) }} autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="p-nueva">Nueva contraseña *</label>
          <input id="p-nueva" className="input" type="password" value={nueva}
            onChange={e => { setNueva(e.target.value); setError(null) }} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="p-repetir">Repite la nueva *</label>
          <input id="p-repetir" className="input" type="password" value={repetir}
            onChange={e => { setRepetir(e.target.value); setError(null) }} autoComplete="new-password" />
        </div>
        {error && <Alert variant="danger" titulo="No se pudo cambiar">{error}</Alert>}
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn-ghost btn-sm" onClick={logout}>Salir</button>
          <button className="btn-gold" disabled={guardando || !actual || nueva.length < 8}>
            {guardando ? 'Guardando…' : 'Cambiar y continuar'}
          </button>
        </div>
      </form>
    </div>
  )
}
