import { useState } from 'react'
import { api } from '../lib/api'
import { Spinner, Alert } from './ui'

const RE_RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Alta manual. Solo RFC + Contraseña SAT son obligatorios. */
export default function ClienteForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ rfc: '', nombre: '', email: '', ciec: '', frecuenciaDias: 25 })
  const [err, setErr] = useState('')
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF({ ...f, [k]: v })
  const blur = (k: string) => setTocado(t => ({ ...t, [k]: true }))

  const rfcValido = RE_RFC.test(f.rfc)
  const mailValido = f.email === '' || RE_MAIL.test(f.email)

  const errores = {
    rfc: f.rfc !== '' && !rfcValido ? 'El RFC no tiene el formato válido (13 caracteres: 4 letras, 6 de fecha y 3 de homoclave).' : '',
    email: !mailValido ? 'Ese correo no parece válido. Ejemplo: contacto@ejemplo.mx' : '',
    ciec: f.ciec === '' ? 'La Contraseña SAT es obligatoria.' : ''
  }
  const primerError = errores.rfc || errores.email || errores.ciec

  async function save() {
    if (saving) return
    setTocado({ rfc: true, email: true, ciec: true })
    if (primerError) { setErr('Revisa los campos marcados antes de guardar.'); return }
    setSaving(true); setErr('')
    try {
      const res: any = await api('/clientes', {
        method: 'POST',
        body: JSON.stringify({ ...f, tipos: ['32d'] })
      })
      if (res?.ok) {
        setF({ rfc: '', nombre: '', email: '', ciec: '', frecuenciaDias: 25 })
        setTocado({})
        onDone()
      } else {
        setErr(res?.details ? JSON.stringify(res.details) : res?.error || 'No se pudo guardar')
      }
    } finally { setSaving(false) }
  }

  const marca = (k: string) => (tocado[k] && errores[k as keyof typeof errores] ? 'input-error' : '')

  return (
    <div>
      <div className="grid gap-3.5">
        <div>
          <label className="label">RFC *</label>
          <input
            className={`input ${marca('rfc')}`}
            value={f.rfc}
            aria-invalid={!!(tocado.rfc && errores.rfc)}
            onBlur={() => blur('rfc')}
            onChange={e => { set('rfc', e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13)); setErr('') }}
            placeholder="GUAJ880224I62"
            maxLength={13}
          />
          {tocado.rfc && errores.rfc ? (
            <p className="invalid-feedback">
              <svg width="12" height="12" className="shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 8v4.5" /><path d="M12 16h.01" /></svg>
              {errores.rfc}
            </p>
          ) : (
            <p className="text-xs text-marino/40 mt-1">Persona moral: 12 caracteres · Persona física: 13.</p>
          )}
        </div>

        <div>
          <label className="label">Nombre o razón social <span className="font-normal text-marino/40">(opcional)</span></label>
          <input className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre del contribuyente" />
        </div>

        <div>
          <label className="label">Correo <span className="font-normal text-marino/40">(opcional, para avisos)</span></label>
          <input
            className={`input ${marca('email')}`}
            type="email"
            value={f.email}
            aria-invalid={!!(tocado.email && errores.email)}
            onBlur={() => blur('email')}
            onChange={e => { set('email', e.target.value); setErr('') }}
            placeholder="correo@ejemplo.mx"
          />
          {tocado.email && errores.email && (
            <p className="invalid-feedback">
              <svg width="12" height="12" className="shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 8v4.5" /><path d="M12 16h.01" /></svg>
              {errores.email}
            </p>
          )}
        </div>

        <div>
          <label className="label">Contraseña SAT (antes CIEC) *</label>
          <input
            className={`input ${marca('ciec')}`}
            type="password"
            value={f.ciec}
            aria-invalid={!!(tocado.ciec && errores.ciec)}
            onBlur={() => blur('ciec')}
            onChange={e => { set('ciec', e.target.value); setErr('') }}
            placeholder="La del portal SAT"
            autoComplete="new-password"
          />
          {tocado.ciec && errores.ciec ? (
            <p className="invalid-feedback">
              <svg width="12" height="12" className="shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 8v4.5" /><path d="M12 16h.01" /></svg>
              {errores.ciec}
            </p>
          ) : (
            <p className="text-xs text-marino/45 mt-1 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/></svg>
              Se cifra y se guarda fuera de la base de datos. Nadie más puede verla.
            </p>
          )}
        </div>

        <div>
          <label className="label">Cada cuántos días repetir</label>
          <div className="flex gap-2">
            <input className="input" type="number" min={1} value={f.frecuenciaDias} onChange={e => set('frecuenciaDias', Number(e.target.value) || 25)} />
            <div className="flex gap-1.5 shrink-0">
              {[25, 30, 90].map(d => (
                <button key={d} type="button" className={`btn btn-sm ${f.frecuenciaDias === d ? 'btn-gold' : 'btn-ghost'}`} onClick={() => set('frecuenciaDias', d)}>{d}</button>
              ))}
            </div>
          </div>
        </div>

        {err && <Alert variant="danger" titulo="No se pudo guardar el contribuyente">{err}</Alert>}

        <button className="btn" disabled={saving} onClick={save}>
          {saving ? <><Spinner small /> Guardando…</> : 'Guardar contribuyente'}
        </button>
      </div>
    </div>
  )
}
