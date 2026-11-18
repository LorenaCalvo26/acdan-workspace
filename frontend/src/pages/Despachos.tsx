import { useEffect, useState } from 'react'
import { api, mensajeError } from '../lib/api'
import { Alert, PageHeader, Seccion, Spinner, Vacio } from '../components/ui'

type Despacho = {
  rfc: string
  nombre: string
  email: string
  telefono: string
  notas: string
  activo: string
}

const VACIO: Despacho = { rfc: '', nombre: '', email: '', telefono: '', notas: '', activo: 'true' }

export default function Despachos() {
  const [items, setItems] = useState<Despacho[]>([])
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState<Despacho>(VACIO)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; txt: string } | null>(null)

  async function cargar() {
    try {
      const r: any = await api('/despachos/list', { method: 'POST', body: '{}' })
      setItems(Array.isArray(r?.items) ? r.items : [])
    } catch { setItems([]) }
    finally { setCargando(false) }
  }

  useEffect(() => { cargar() }, [])

  function nuevo() { setForm(VACIO); setEditando(true); setMsg(null) }
  function editar(d: Despacho) { setForm(d); setEditando(true); setMsg(null) }

  async function guardar() {
    setGuardando(true); setMsg(null)
    try {
      const r: any = await api('/despachos/guardar', { method: 'POST', body: JSON.stringify(form) })
      if (r?.error) { setMsg({ tipo: 'error', txt: r.error }); return }
      setMsg({ tipo: 'ok', txt: `Despacho ${r.rfc} guardado` })
      setEditando(false); setForm(VACIO)
      await cargar()
    } catch (e: any) { setMsg({ tipo: 'error', txt: mensajeError(e) }) }
    finally { setGuardando(false) }
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
        accion={<button className="btn-gold btn-sm" onClick={nuevo}>Nuevo despacho</button>}
      />

      {msg && <Alert variant={msg.tipo === 'ok' ? 'success' : 'danger'}>{msg.txt}</Alert>}

      {editando && (
        <Seccion titulo={form.rfc ? `Editar ${form.rfc}` : 'Nuevo despacho'} desc="Datos de la cuenta">
          <div className="px-4 sm:px-6 py-5 grid gap-4 max-w-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">RFC</span>
                <input className="input" value={form.rfc} disabled={!!items.find(i => i.rfc === form.rfc)}
                  onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })} placeholder="XAXX010101000" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">Nombre</span>
                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Despacho Contable ..." />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">Correo</span>
                <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contacto@despacho.mx" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-marino/45">Teléfono</span>
                <input className="input" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="55 1234 5678" />
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
                  <tr><th>RFC</th><th>Nombre</th><th>Correo</th><th>Teléfono</th><th className="text-right">Acciones</th></tr>
                </thead>
                <tbody>
                  {items.map(d => (
                    <tr key={d.rfc}>
                      <td className="font-semibold">{d.rfc}</td>
                      <td>{d.nombre}</td>
                      <td className="text-marino/60">{d.email || '—'}</td>
                      <td className="text-marino/60">{d.telefono || '—'}</td>
                      <td className="text-right whitespace-nowrap">
                        <button className="btn-ghost btn-sm" onClick={() => editar(d)}>Editar</button>
                        <button className="btn-ghost btn-sm text-rose-700" onClick={() => eliminar(d)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Seccion>
    </div>
  )
}
