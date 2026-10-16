import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Spinner, Alert, Seccion, PageHeader } from '../components/ui'

export default function MiCuenta() {
  const { user, cambiarPassword } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [msg, setMsg] = useState<{ txt: string; bad?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})

  const errores = {
    actual: actual === '' ? 'Escribe tu contraseña actual.' : '',
    nueva: nueva === '' ? 'Escribe la nueva contraseña.' : nueva.length < 8 ? 'Mínimo 8 caracteres.' : nueva === actual ? 'La nueva debe ser diferente a la actual.' : '',
    confirmar: confirmar === '' ? 'Confirma la nueva contraseña.' : confirmar !== nueva ? 'No coincide con la nueva.' : '',
  }
  const primerError = errores.actual || errores.nueva || errores.confirmar

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setTocado({ actual: true, nueva: true, confirmar: true })
    if (primerError) { setMsg({ txt: 'Revisa los campos marcados.', bad: true }); return }
    setGuardando(true); setMsg(null)
    try {
      const r = await cambiarPassword(actual, nueva)
      if (!r.ok) { setMsg({ txt: r.error || 'No se pudo cambiar la contraseña.', bad: true }); return }
      setMsg({ txt: 'Contraseña actualizada. La próxima vez entra con la nueva.' })
      setActual(''); setNueva(''); setConfirmar(''); setTocado({})
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="grid gap-5 max-w-xl">
      <PageHeader titulo="Mi cuenta" desc={user ? `${user.nombre} · ${user.email}` : 'Cambia tu contraseña'} />
      <Seccion titulo="Cambiar contraseña" desc="Te pedimos la actual por seguridad">
        <form onSubmit={guardar} className="px-6 py-5 grid gap-4">
          <div>
            <label className="label">Contraseña actual</label>
            <input
              className={`input ${tocado.actual && errores.actual ? 'input-error' : ''}`}
              type="password"
              value={actual}
              autoComplete="current-password"
              onChange={e => { setActual(e.target.value); setMsg(null) }}
              onBlur={() => setTocado(t => ({ ...t, actual: true }))}
              placeholder="Tu contraseña de hoy"
            />
            {tocado.actual && errores.actual && <p className="invalid-feedback">{errores.actual}</p>}
          </div>
          <div>
            <label className="label">Nueva contraseña</label>
            <input
              className={`input ${tocado.nueva && errores.nueva ? 'input-error' : ''}`}
              type="password"
              value={nueva}
              autoComplete="new-password"
              onChange={e => { setNueva(e.target.value); setMsg(null) }}
              onBlur={() => setTocado(t => ({ ...t, nueva: true }))}
              placeholder="Mínimo 8 caracteres"
            />
            {tocado.nueva && errores.nueva ? (
              <p className="invalid-feedback">{errores.nueva}</p>
            ) : (
              <p className="text-xs text-marino/45 mt-1">Usa algo que no uses en otro lado.</p>
            )}
          </div>
          <div>
            <label className="label">Confirmar nueva</label>
            <input
              className={`input ${tocado.confirmar && errores.confirmar ? 'input-error' : ''}`}
              type="password"
              value={confirmar}
              autoComplete="new-password"
              onChange={e => { setConfirmar(e.target.value); setMsg(null) }}
              onBlur={() => setTocado(t => ({ ...t, confirmar: true }))}
              placeholder="Repite la nueva"
            />
            {tocado.confirmar && errores.confirmar && <p className="invalid-feedback">{errores.confirmar}</p>}
          </div>
          {msg && <Alert variant={msg.bad ? 'danger' : 'success'}>{msg.txt}</Alert>}
          <button className="btn-gold" disabled={guardando}>
            {guardando ? <><Spinner small /> Guardando…</> : 'Cambiar contraseña'}
          </button>
        </form>
      </Seccion>
    </div>
  )
}
