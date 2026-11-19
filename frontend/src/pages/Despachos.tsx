import { useEffect, useState } from 'react'
import { api, mensajeError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Alert, PageHeader, Seccion, Spinner, Vacio, CamposObligatorios, Modal } from '../components/ui'
import UploadExcel from '../components/UploadExcel'

type Despacho = {
  rfc: string
  nombre: string
  email: string
  telefono: string
  notas: string
  activo: string
  logoUrl?: string
}

const VACIO: Despacho = { rfc: '', nombre: '', email: '', telefono: '', notas: '', activo: 'true' }

export default function Despachos() {
  const { jwt } = useAuth()
  const [items, setItems] = useState<Despacho[]>([])
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState<Despacho>(VACIO)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; txt: string } | null>(null)
  const [subiendo, setSubiendo] = useState('')
  const [cartera, setCartera] = useState<Despacho | null>(null)
  const [paquete, setPaquete] = useState<Despacho | null>(null)
  const [mesPaquete, setMesPaquete] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [generando, setGenerando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [tocado, setTocado] = useState<Record<string, boolean>>({})

  // Validaciones propias: el backend responde genérico, así que aquí se avisa claro.
  const RE_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i
  const RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const RE_TEL = /^[0-9+()\s-]{7,20}$/

  const errores = {
    rfc: !form.rfc.trim()
      ? 'El RFC es obligatorio.'
      : (!RE_RFC.test(form.rfc.trim()) ? 'El RFC no tiene el formato válido (12 o 13 caracteres).' : ''),
    nombre: !form.nombre.trim() ? 'El nombre es obligatorio.' : '',
    email: form.email.trim() && !RE_MAIL.test(form.email.trim()) ? 'Ese correo no parece válido.' : '',
    telefono: form.telefono.trim() && !RE_TEL.test(form.telefono.trim()) ? 'Solo números, espacios, + y guiones.' : '',
  }
  const primerError = errores.rfc || errores.nombre || errores.email || errores.telefono
  const ver = (k: string) => tocado[k] || false

  async function cargar() {
    try {
      const r: any = await api('/despachos/list', { method: 'POST', body: '{}' })
      setItems(Array.isArray(r?.items) ? r.items : [])
    } catch { setItems([]) }
    finally { setCargando(false) }
  }

  useEffect(() => { cargar() }, [])

  function avisar(txt: string) { setMsg({ tipo: 'ok', txt }) }

  function nuevo() { setForm(VACIO); setEditando(true); setMsg(null) }
  function editar(d: Despacho) { setForm(d); setEditando(true); setMsg(null) }

  async function guardar() {
    setTocado({ rfc: true, nombre: true, email: true, telefono: true })
    if (primerError) { setMsg({ tipo: 'error', txt: 'Revisa los campos marcados antes de guardar.' }); return }
    setGuardando(true); setMsg(null)
    try {
      // Solo lo que el DTO conoce: mandar campos extra rompe el backend.
      const payload = { rfc: form.rfc.trim().toUpperCase(), nombre: form.nombre.trim(), email: form.email.trim(), telefono: form.telefono.trim(), notas: form.notas }
      const r: any = await api('/despachos/guardar', { method: 'POST', body: JSON.stringify(payload) })
      if (r?.error) { setMsg({ tipo: 'error', txt: r.error }); return }
      setMsg({ tipo: 'ok', txt: `Despacho ${r.rfc} guardado` })
      setEditando(false); setForm(VACIO)
      await cargar()
    } catch (e: any) { setMsg({ tipo: 'error', txt: mensajeError(e) }) }
    finally { setGuardando(false) }
  }

  async function subirLogo(d: Despacho, file: File) {
    if (!file.type.startsWith('image/')) { setMsg({ tipo: 'error', txt: 'Solo imágenes (PNG, JPG o WebP)' }); return }
    if (file.size > 2 * 1024 * 1024) { setMsg({ tipo: 'error', txt: 'Máximo 2 MB' }); return }
    setSubiendo(d.rfc); setMsg(null)
    try {
      const firma: any = await api('/despachos/logo-url', { method: 'POST', body: JSON.stringify({ rfc: d.rfc, fileType: file.type }) })
      if (!firma?.uploadUrl) throw new Error(firma?.error || 'No se pudo firmar la subida')
      const subida = await fetch(firma.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!subida.ok) throw new Error(`S3 respondió ${subida.status}`)
      const r: any = await api('/despachos/logo', { method: 'POST', body: JSON.stringify({ rfc: d.rfc, url: firma.publicUrl }) })
      if (!r?.ok) throw new Error(r?.error || 'No se pudo guardar el logo')
      await cargar()
      setForm(f => (f.rfc === d.rfc ? { ...f, logoUrl: firma.publicUrl } : f))
      setMsg({ tipo: 'ok', txt: `Logo de ${d.nombre} actualizado` })
    } catch (e: any) { setMsg({ tipo: 'error', txt: e?.message || 'Falló la subida' }) }
    finally { setSubiendo('') }
  }
  async function enviarBienvenida(d: Despacho) {
    if (!d.email) { setMsg({ tipo: 'error', txt: 'Ese despacho no tiene correo registrado.' }); return }
    setMsg(null)
    try {
      const r: any = await api('/despachos/bienvenida', { method: 'POST', body: JSON.stringify({ rfc: d.rfc, fileType: '' }) })
      if (!r?.ok) throw new Error(r?.error || 'No se pudo enviar')
      setMsg({ tipo: 'ok', txt: `Bienvenida enviada a ${r.email}` })
    } catch (e: any) { setMsg({ tipo: 'error', txt: e?.message || 'No se pudo enviar la bienvenida' }) }
  }
  async function generarPaquete() {
    if (!paquete) return
    setGenerando(true); setResultado(null); setMsg(null)
    try {
      const r: any = await api('/despachos/paquete', {
        method: 'POST',
        body: JSON.stringify({ token: jwt, rfc: paquete.rfc, periodo: mesPaquete }),
      })
      if (!r?.ok) throw new Error(r?.detalle || r?.error || 'No se pudo armar el paquete')
      setResultado(r)
      setMsg({ tipo: 'ok', txt: `Paquete de ${r.periodo} listo: ${r.cliente} cliente(s), ${r.archivos} archivo(s)` })
    } catch (e: any) { setMsg({ tipo: 'error', txt: e?.message || 'No se pudo armar el paquete' }) }
    finally { setGenerando(false) }
  }

  async function eliminar(d: Despacho) {
    if (!confirm(`¿Eliminar el despacho ${d.nombre}? Sus clientes quedan como individuales.`)) return
    try {
      await api('/despachos/eliminar', { method: 'POST', body: JSON.stringify({ rfc: d.rfc }) })
      await cargar()
      setMsg({ tipo: 'ok', txt: `Despacho ${d.rfc} eliminado` })
    } catch (e: any) { setMsg({ tipo: 'error', txt: mensajeError(e) }) }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        titulo="Despachos"
        desc="Pilli se vende por despacho. Cada despacho es una cuenta con su cartera de clientes."
        accion={
          <div className="flex items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => { setPaquete({ rfc: 'ACDAN', nombre: 'Individuales (ACDAN)' } as any); setResultado(null) }}
              title="Armar el paquete del mes de los clientes individuales">
              Paquete ACDAN
            </button>
            <button className="btn-gold btn-sm" onClick={nuevo}>Nuevo despacho</button>
          </div>
        }
      />

      {msg && <Alert variant={msg.tipo === 'ok' ? 'success' : 'danger'}>{msg.txt}</Alert>}

      {editando && (
        <Seccion titulo={form.rfc ? `Editar ${form.rfc}` : 'Nuevo despacho'} desc="Datos de la cuenta">
          <div className="px-4 sm:px-6 py-5 grid gap-4 max-w-2xl">
            <CamposObligatorios />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">RFC *</span>
                <input className={`input ${ver('rfc') && errores.rfc ? 'input-error' : ''}`} value={form.rfc}
                  disabled={!!items.find(i => i.rfc === form.rfc)}
                  onBlur={() => setTocado(t => ({ ...t, rfc: true }))} onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })} placeholder="XAXX010101000" />
                <span className="min-h-[14px] text-[11px] leading-[14px] text-rose-600">{ver('rfc') ? errores.rfc : ''}</span>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">Nombre *</span>
                <input className={`input ${ver('nombre') && errores.nombre ? 'input-error' : ''}`} value={form.nombre}
                  onBlur={() => setTocado(t => ({ ...t, nombre: true }))} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Despacho Contable ..." />
                <span className="min-h-[14px] text-[11px] leading-[14px] text-rose-600">{ver('nombre') ? errores.nombre : ''}</span>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">Correo <span className="font-normal text-marino/40">(opcional)</span></span>
                <input className={`input ${ver('email') && errores.email ? 'input-error' : ''}`} type="email" value={form.email}
                  onBlur={() => setTocado(t => ({ ...t, email: true }))} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contacto@despacho.mx" />
                <span className="min-h-[14px] text-[11px] leading-[14px] text-rose-600">{ver('email') ? errores.email : ''}</span>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">Teléfono <span className="font-normal text-marino/40">(opcional)</span></span>
                <input className={`input ${ver('telefono') && errores.telefono ? 'input-error' : ''}`} value={form.telefono}
                  onBlur={() => setTocado(t => ({ ...t, telefono: true }))} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="55 1234 5678" />
                <span className="min-h-[14px] text-[11px] leading-[14px] text-rose-600">{ver('telefono') ? errores.telefono : ''}</span>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-gold btn-sm" onClick={guardar} disabled={guardando || !form.rfc || !form.nombre}>
                {guardando ? <><Spinner small /> Guardando…</> : 'Guardar'}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => { setEditando(false); setForm(VACIO) }}>Cancelar</button>
            </div>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Cuentas" desc="Despachos dados de alta">
        {cargando ? <div className="py-8 text-center"><Spinner /></div>
          : items.length === 0 ? <Vacio titulo="Sin despachos" hint="Crea el primero con “Nuevo despacho”." />
          : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Logo</th><th>RFC</th><th>Nombre</th><th>Correo</th><th>Teléfono</th><th className="text-right">Acciones</th></tr>
                </thead>
                <tbody>
                  {items.map(d => (
                    <tr key={d.rfc}>
                      <td>
                        {d.logoUrl
                          ? <img src={d.logoUrl} alt={`Logo de ${d.nombre}`} className="h-9 w-9 rounded-lg border border-line object-contain bg-white" />
                          : <div className="h-9 w-9 rounded-lg border border-dashed border-line/80 grid place-items-center text-[10px] text-marino/30">—</div>}
                      </td>
                      <td className="font-semibold">{d.rfc}</td>
                      <td>{d.nombre}</td>
                      <td className="text-marino/60">{d.email || '—'}</td>
                      <td className="text-marino/60">{d.telefono || '—'}</td>
                      <td className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <label className="btn-ghost btn-sm cursor-pointer inline-flex items-center">
                            {subiendo === d.rfc ? 'Subiendo…' : (d.logoUrl ? 'Cambiar logo' : 'Subir logo')}
                            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                              disabled={!!subiendo} onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(d, f); e.currentTarget.value = '' }} />
                          </label>
                          <button className="btn-ghost btn-sm" onClick={() => enviarBienvenida(d)} title="Reenviar el correo de bienvenida a este despacho">Bienvenida</button>
                          <button className="btn-ghost btn-sm" onClick={() => { setPaquete(d); setResultado(null) }} title="Armar el paquete del mes de toda la cartera">Paquete</button>
<button className="btn-ghost btn-sm" onClick={() => setCartera(d)} title="Cargar los clientes de este despacho desde Excel">Cartera</button>
                          <button className="btn-ghost btn-sm" onClick={() => editar(d)}>Editar</button>
                          <button className="btn-ghost btn-sm text-rose-700" onClick={() => eliminar(d)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Seccion>

      {paquete && (
        <Modal abierto titulo={`Paquete de ${paquete.nombre}`} onClose={() => setPaquete(null)}>
          <div className="p-5 grid gap-4">
            <p className="text-xs text-marino/60">
              Se arma un ZIP con una carpeta por RFC (XML, PDF y el Excel del mes) más un índice de la cartera.
              Al terminar tendrás una liga de descarga válida 7 días.
            </p>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-marino/45">Mes</span>
              <input className="input" type="month" value={mesPaquete} onChange={e => setMesPaquete(e.target.value)} />
            </label>
            <div className="flex items-center gap-3">
              <button className="btn-gold btn-sm" onClick={generarPaquete} disabled={generando || !mesPaquete}>
                {generando ? <><Spinner small /> Armando…</> : 'Generar paquete'}
              </button>
              {generando && <span className="text-[11px] text-marino/50">Puede tardar unos minutos si la cartera es grande.</span>}
            </div>
            {resultado && (
              <div className="rounded-xl border border-line/80 bg-hueso/40 p-3 grid gap-2">
                <div className="text-xs text-marino/70">
                  <b>{resultado.cliente}</b> cliente(s) · <b>{resultado.archivos}</b> archivo(s) ·{' '}
                  <b>{(resultado.bytes / 1024 / 1024).toFixed(1)} MB</b>
                </div>
                <a className="btn-gold btn-sm w-fit" href={resultado.url} target="_blank" rel="noreferrer">Descargar ZIP</a>
                <div className="text-[10px] text-marino/40 break-all">Liga válida 7 días. Caduca: {new Date(Date.now() + 7 * 864e5).toLocaleDateString('es-MX')}</div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {cartera && (
        <Modal abierto titulo={`Cartera de ${cartera.nombre}`} onClose={() => setCartera(null)}>
          <div className="p-5">
            <UploadExcel
              despacho={{ rfc: cartera.rfc, nombre: cartera.nombre }}
              onDone={async () => { await cargar(); avisar(`Cartera de ${cartera.nombre} actualizada`) }}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
