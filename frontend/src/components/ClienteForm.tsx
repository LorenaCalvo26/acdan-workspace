import { useState } from 'react'
import { api } from '../lib/api'
import { Spinner } from './ui'

/** Alta manual. Solo RFC + Contraseña SAT son obligatorios. */
export default function ClienteForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ rfc: '', nombre: '', email: '', ciec: '', frecuenciaDias: 25 })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF({ ...f, [k]: v })

  const rfcValido = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(f.rfc)

  async function save() {
    if (saving) return
    if (!rfcValido) { setErr('El RFC no tiene el formato válido (13 o 14 caracteres).'); return }
    if (!f.ciec) { setErr('La Contraseña SAT es obligatoria.'); return }
    setSaving(true); setErr('')
    try {
      const res: any = await api('/clientes', {
        method: 'POST',
        body: JSON.stringify({ ...f, tipos: ['32d'] })
      })
      if (res?.ok) {
        setF({ rfc: '', nombre: '', email: '', ciec: '', frecuenciaDias: 25 })
        onDone()
      } else {
        setErr(res?.details ? JSON.stringify(res.details) : res?.error || 'No se pudo guardar')
      }
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="grid gap-3.5">
        <div>
          <label className="label">RFC *</label>
          <input
            className="input"
            value={f.rfc}
            onChange={e => set('rfc', e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13))}
            placeholder="GUAJ880224I62"
            maxLength={13}
          />
          {f.rfc && !rfcValido && <p className="text-xs text-amber-600 mt-1">Formato inválido. Ejemplo: GUAJ880224I62</p>}
        </div>

        <div>
          <label className="label">Nombre o razón social <span className="font-normal text-marino/40">(opcional)</span></label>
          <input className="input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre del contribuyente" />
        </div>

        <div>
          <label className="label">Correo <span className="font-normal text-marino/40">(opcional, para avisos)</span></label>
          <input className="input" type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" />
        </div>

        <div>
          <label className="label">Contraseña SAT (antes CIEC) *</label>
          <input className="input" type="password" value={f.ciec} onChange={e => set('ciec', e.target.value)} placeholder="La del portal SAT" autoComplete="new-password" />
          <p className="text-xs text-marino/45 mt-1 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/></svg>
            Se cifra y se guarda fuera de la base de datos. Nadie más puede verla.
          </p>
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

        {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

        <button className="btn" disabled={saving} onClick={save}>
          {saving ? <><Spinner small /> Guardando…</> : 'Guardar contribuyente'}
        </button>
      </div>
    </div>
  )
}
