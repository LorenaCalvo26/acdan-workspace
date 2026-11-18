import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { Spinner, Alert, Seccion, PageHeader, CamposObligatorios } from '../components/ui'

function iniciales(nombre?: string): string {
  if (!nombre) return '?'
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?'
}

export default function MiCuenta() {
  const { user, jwt, cambiarPassword, actualizarUsuario } = useAuth()
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [msgFoto, setMsgFoto] = useState<{ txt: string; bad?: boolean } | null>(null)
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

  async function subirFoto(file: File) {
    if (!file.type.startsWith('image/')) { setMsgFoto({ txt: 'Solo imágenes (PNG, JPG o WebP).', bad: true }); return }
    if (file.size > 2 * 1024 * 1024) { setMsgFoto({ txt: 'Máximo 2 MB.', bad: true }); return }
    setSubiendoFoto(true); setMsgFoto(null)
    try {
      const firma: any = await api('/auth/avatar-url', { method: 'POST', body: JSON.stringify({ token: jwt, fileType: file.type }) })
      if (!firma?.uploadUrl) throw new Error(firma?.error === 'ALMACEN_NO_CONFIGURADO' ? 'El almacén de imágenes no está configurado.' : (firma?.error || 'No se pudo firmar la subida.'))
      const subida = await fetch(firma.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!subida.ok) throw new Error(`El almacén respondió ${subida.status}`)
      const r: any = await api('/auth/avatar', { method: 'POST', body: JSON.stringify({ token: jwt, url: firma.publicUrl }) })
      if (!r?.ok) throw new Error(r?.error || 'No se pudo guardar la foto.')
      actualizarUsuario({ avatarUrl: firma.publicUrl })
      setMsgFoto({ txt: 'Foto actualizada.' })
    } catch (e: any) {
      setMsgFoto({ txt: e?.message || 'No se pudo subir la foto.', bad: true })
    } finally {
      setSubiendoFoto(false)
    }
  }

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
      <Seccion titulo="Mi foto de perfil" desc="Se muestra en la barra superior del portal">
        <div className="px-6 py-5 grid gap-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full border border-line bg-hueso/50 grid place-items-center overflow-hidden shrink-0">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt="Mi foto" className="h-full w-full object-cover" />
                : <span className="text-lg font-bold text-marino/40">{iniciales(user?.nombre)}</span>}
            </div>
            <div className="grid gap-1.5">
              <label className="btn-ghost btn-sm cursor-pointer w-fit">
                {subiendoFoto ? 'Subiendo…' : (user?.avatarUrl ? 'Cambiar foto' : 'Subir foto')}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={subiendoFoto}
                  onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f); e.currentTarget.value = '' }} />
              </label>
              <span className="text-[11px] text-marino/45">PNG, JPG o WebP hasta 2 MB.</span>
            </div>
          </div>
          {msgFoto && <Alert variant={msgFoto.bad ? 'danger' : 'success'}>{msgFoto.txt}</Alert>}
        </div>
      </Seccion>

      <Seccion titulo="Cambiar contraseña" desc="Te pedimos la actual por seguridad">
        <form onSubmit={guardar} className="px-6 py-5 grid gap-4">
          <div>
            <CamposObligatorios />
            <label className="label">Contraseña actual *</label>
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
            <label className="label">Nueva contraseña *</label>
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
            <label className="label">Confirmar nueva *</label>
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
