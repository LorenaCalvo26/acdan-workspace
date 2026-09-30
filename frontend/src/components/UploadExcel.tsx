import { useState } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import { Spinner } from './ui'

type Resultado = { ok: number; errores: number; detalle?: string[] }

/** Excel/CSV con RFC, Nombre, Email, Contraseña (o CIEC), TipoDocs, FrecuenciaDias. */
export default function UploadExcel({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(false)
  const [loading, setLoading] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)

  async function onFile(f: File) {
    if (loading) return
    setLoading(true); setMsg(''); setRes(null); setBad(false)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf)
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      if (rows.length === 0) { setMsg('El archivo no tiene filas.'); setBad(true); return }

      const payload = {
        rows: rows.map((r: any) => ({
          rfc: String(r.RFC || r.rfc || '').trim(),
          nombre: String(r.Nombre || r.nombre || ''),
          email: String(r.Email || r.email || ''),
          ciec: String(r.Contraseña || r.contraseña || r.Contrasena || r.CIEC || r.ciec || r.Password || r.password || r.PASS || r.pass || ''),
          tipos: String(r.TipoDocs || '32d').split(/[;,]/).map((s: string) => s.trim()).filter(Boolean),
          frecuenciaDias: Number(r.FrecuenciaDias || 25)
        }))
      }

      const r: any = await api('/clientes/bulk', { method: 'POST', body: JSON.stringify(payload) })
      if (r?.insertados != null) {
        setRes({ ok: r.insertados, errores: r.errores ?? 0, detalle: r.detalle })
        setMsg(`${r.insertados} cliente(s) guardados${r.errores ? `, ${r.errores} con error` : ''}.`)
        setBad(!!r.errores)
        if (r.insertados > 0) onDone()
      } else {
        setMsg(r?.detail || r?.error || 'No se pudo procesar el archivo')
        setBad(true)
      }
    } catch (e: any) {
      setMsg(String(e?.message || e)); setBad(true)
    } finally { setLoading(false) }
  }

  return (
    <div className="grid gap-3.5 content-start">
      <div>
        <div className="font-bold text-sm">Carga masiva</div>
        <p className="text-xs text-marino/55 mt-0.5">
          Sube un Excel o CSV con las columnas <code className="text-[11px] bg-hueso px-1 rounded">RFC</code>,{' '}
          <code className="text-[11px] bg-hueso px-1 rounded">Nombre</code>,{' '}
          <code className="text-[11px] bg-hueso px-1 rounded">Email</code>,{' '}
          <code className="text-[11px] bg-hueso px-1 rounded">Contraseña</code>,{' '}
          <code className="text-[11px] bg-hueso px-1 rounded">FrecuenciaDias</code>.
        </p>
        <a className="inline-block text-xs text-dorado font-semibold hover:underline mt-1" href="/excel-template.csv" download>
          Descargar plantilla →
        </a>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={e => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
        className={`grid place-items-center gap-2 text-center border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer transition-colors ${
          arrastrando ? 'border-dorado bg-dorado/5' : 'border-line hover:border-dorado/50 hover:bg-hueso/40'
        }`}
      >
        {loading ? <Spinner /> : (
          <svg width="26" height="26" className="text-marino/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v13"/>
          </svg>
        )}
        <div className="text-sm font-semibold">{loading ? 'Procesando…' : 'Arrastra tu archivo aquí'}</div>
        <div className="text-xs text-marino/45">o haz clic para elegir · .xlsx y .csv</div>
        <input
          type="file" className="hidden" accept=".xlsx,.csv" disabled={loading}
          onChange={e => { if (e.target.files) onFile(e.target.files[0]); e.target.value = '' }}
        />
      </label>

      {msg && (
        <div className={`text-sm rounded-lg px-3 py-2 border ${bad ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          {msg}
          {res && res.detalle && res.detalle.length > 0 && (
            <ul className="mt-1.5 text-[11px] space-y-0.5 list-disc pl-4 max-h-24 overflow-y-auto">
              {res.detalle.slice(0, 8).map((d, i) => <li key={i} className="break-all">{d}</li>)}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-marino/45 flex items-start gap-1.5">
        <svg width="12" height="12" className="mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/></svg>
        Las contraseñas del archivo se cifran al instante y el archivo no se guarda en el servidor.
      </p>
    </div>
  )
}
