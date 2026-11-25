import { useState } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import { Spinner, Alert } from './ui'

type Resultado = { ok: number; errores: number; detalle?: string[] }

function dos(n: number) { return String(n).padStart(2, '0') }

/** Acepta celdas fecha de Excel, ISO `YYYY-MM-DD` o `dd/mm/yyyy`. */
function fechaISO(v: any): string {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`
  }
  if (typeof v === 'number' && v > 0) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${dos(d.m)}-${dos(d.d)}`
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${dos(Number(m[2]))}-${dos(Number(m[1]))}`
  return s
}

/** Acepta celdas hora de Excel o texto `H:mm` / `HH:mm`. */
function horaHHMM(v: any): string {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${dos(v.getHours())}:${dos(v.getMinutes())}`
  }
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const total = Math.round(v * 24 * 60)
    return `${dos(Math.floor(total / 60) % 24)}:${dos(total % 60)}`
  }
  const s = String(v).trim()
  const m = /^(\d{1,2}):(\d{2})/.exec(s)
  if (m) return `${dos(Number(m[1]))}:${m[2]}`
  return s
}

/** Excel/CSV con RFC, Nombre, Email, Contraseña (o CIEC), TipoDocs, FrecuenciaDias y fecha opcional. */
const txt = (v: any) => String(v ?? '').trim()

/**
 * Deja los encabezados comparables: minúsculas, sin acentos, sin espacios,
 * guiones ni signos. Así "Contraseña SAT", "CONTRASEÑA" y "contrasena" son lo mismo.
 */
function normalizarFila(raw: any): Record<string, any> {
  const salida: Record<string, any> = {}
  for (const clave of Object.keys(raw || {})) {
    const limpia = String(clave)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    salida[limpia] = raw[clave]
  }
  return salida
}

/** Si se pasa `despacho`, todos los clientes del archivo quedan ligados a ese despacho. */
export default function UploadExcel({ onDone, despacho }: { onDone: () => void; despacho?: { rfc: string; nombre: string } }) {
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
      // La libreria lee los CSV como Latin-1 si no se le dice lo contrario, y
      // entonces "Contraseña" (UTF-8) llega como "ContraseÃ±a" y la columna no
      // coincide. Se decide la codificacion mirando el propio archivo.
      let wb = XLSX.read(buf, { cellDates: true })
      if (/\.csv$/i.test(f.name)) {
        const texto = new TextDecoder('utf-8', { fatal: false }).decode(buf)
        const cp = texto.includes('\uFFFD') ? 1252 : 65001
        wb = XLSX.read(buf, { cellDates: true, codepage: cp })
      }
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      if (rows.length === 0) { setMsg('El archivo no tiene filas.'); setBad(true); return }

      const payload = {
        rows: rows.map((raw: any) => {
          // Encabezados tolerantes: sin acentos, sin mayúsculas, sin espacios ni guiones.
          const r = normalizarFila(raw)
          return {
            // Todos los campos se limpian: los CSV suelen traer espacios
            // alrededor de las comas. A la contraseña solo se le quitan los de
            // los extremos, porque podría tener espacios a proposito.
            rfc: txt(r['rfc']).toUpperCase(),
            nombre: txt(r['nombre'] || r['razonsocial']),
            email: txt(r['email'] || r['correo'] || r['correoelectronico']).replace(/\s+/g, ''),
            ciec: txt(r['contrasena'] || r['contrasenasat'] || r['contrasea'] || r['contraseaa'] || r['ciec'] || r['password'] || r['pass'] || r['clave']),
            tipos: txt(r['tipodocs'] || '32d').split(/[;,]/).map((s: string) => s.trim()).filter(Boolean),
            frecuenciaDias: Number(txt(r['frecuenciadias']).replace(',', '.') || 25),
            fechaProgramada: fechaISO(txt(r['fechaprogramada'] || r['fecha'])),
            horaProgramada: horaHHMM(txt(r['horaprogramada'] || r['hora'])),
            // La columna Despacho del archivo manda; si no viene, se usa el despacho elegido.
            despacho: txt(r['despacho']).toUpperCase() || (despacho?.rfc || '')
          }
        })
      }

      // Se manda por lotes: la Lambda tiene 29 s y API Gateway 30 s, así que
      // una cartera grande en una sola petición se corta a la mitad.
      const LOTE = 8
      let insertados = 0
      let errores = 0
      const detalle: string[] = []
      for (let i = 0; i < payload.rows.length; i += LOTE) {
        const trozo = payload.rows.slice(i, i + LOTE)
        const hasta = Math.min(i + LOTE, payload.rows.length)
        setMsg(`Guardando ${hasta} de ${payload.rows.length}…`)
        // Un lote que falle no debe tumbar el resto: se anota y se sigue.
        let r: any = null
        try {
          r = await api('/clientes/bulk', { method: 'POST', body: JSON.stringify({ rows: trozo }) })
        } catch {
          r = null
        }
        if (r?.insertados == null) {
          errores += trozo.length
          detalle.push(`Filas ${i + 2} a ${hasta + 1}: el servidor no respondió (puede que el archivo sea muy grande; reintenta)`)
          continue
        }
        insertados += r.insertados ?? 0
        errores += r.errores ?? 0
        // El backend numera las filas dentro del lote; se ajusta al archivo real.
        for (const d of (r.detalle || []) as string[]) {
          detalle.push(d.replace(/Fila (\d+)/, (_m, n) => `Fila ${Number(n) + i}`))
        }
      }

      setRes({ ok: insertados, errores, detalle })
      setMsg(`${insertados} cliente(s) guardados${errores ? `, ${errores} con error` : ''}.`)
      setBad(!!errores)
      if (insertados > 0) onDone()
    } catch (e: any) {
      setMsg(String(e?.message || e)); setBad(true)
    } finally { setLoading(false) }
  }

  return (
    <div className="grid gap-3.5 content-start">
      <div>
        <div className="font-bold text-sm">Carga masiva</div>
        {despacho && (
          <div className="mt-1.5 rounded-lg border border-dorado/30 bg-dorado/10 px-2.5 py-2 text-[11px] text-marino/75">
            Los clientes del archivo quedarán bajo <b className="text-marino">{despacho.nombre}</b> ({despacho.rfc}).
            Si el archivo trae una columna <code className="bg-white/70 px-1 rounded">Despacho</code>, esa manda.
          </div>
        )}
        <p className="text-xs text-marino/55 mt-1">
          Sube un Excel o CSV con estas columnas. Descarga la plantilla para traerlas ya puestas.
        </p>

        <p className="text-[11px] text-marino/50 mt-1.5">
          Regla general: si dejas una columna opcional vacía, se aplica lo que dice la columna
          <b className="text-marino/70"> “Si lo dejas vacío”</b>. No se rechaza el archivo.
        </p>

        <details className="mt-2 rounded-lg border border-line/80 bg-hueso/30 px-2.5 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-marino/70 select-none">Ver qué va en cada columna</summary>
          <table className="mt-2 w-full text-[11px]">
            <thead>
              <tr className="text-left text-marino/45">
                <th className="pb-1 font-semibold">Columna</th>
                <th className="pb-1 font-semibold">¿Obligatoria?</th>
                <th className="pb-1 font-semibold">Qué va</th>
                <th className="pb-1 font-semibold">Si lo dejas vacío</th>
              </tr>
            </thead>
            <tbody className="text-marino/70 align-top">
              <tr><td className="py-0.5 font-mono">RFC</td><td className="text-rose-600 font-semibold">Sí</td><td>El RFC del contribuyente, 12 o 13 caracteres.</td><td>La fila se rechaza.</td></tr>
              <tr><td className="py-0.5 font-mono">Contraseña</td><td className="text-rose-600 font-semibold">Sí</td><td>La del SAT del contribuyente (antes CIEC), mínimo 8 caracteres.</td><td>La fila se rechaza.</td></tr>
              <tr><td className="py-0.5 font-mono">Nombre</td><td>No</td><td>Razón social o nombre del contribuyente.</td><td>El cliente queda sin nombre hasta que lo pongas.</td></tr>
              <tr><td className="py-0.5 font-mono">Email</td><td>No</td><td>Correo del contribuyente.</td><td>No se le crea portal ni recibe avisos.</td></tr>
              <tr><td className="py-0.5 font-mono">TipoDocs</td><td>No</td><td><code className="bg-white/70 px-1 rounded">32d</code>, <code className="bg-white/70 px-1 rounded">constancia</code> o ambos con <code className="bg-white/70 px-1 rounded">;</code>.</td><td>Se piden los dos documentos.</td></tr>
              <tr><td className="py-0.5 font-mono">FrecuenciaDias</td><td>No</td><td>Días entre corridas.</td><td>Cada 25 días.</td></tr>
              <tr><td className="py-0.5 font-mono">FechaProgramada</td><td>No</td><td>Primera corrida, formato <code className="bg-white/70 px-1 rounded">AAAA-MM-DD</code>.</td><td>Se agenda a los días de la frecuencia, contados desde hoy.</td></tr>
              <tr><td className="py-0.5 font-mono">HoraProgramada</td><td>No</td><td><code className="bg-white/70 px-1 rounded">HH:MM</code>.</td><td>08:00.</td></tr>
              <tr><td className="py-0.5 font-mono">Despacho</td><td>No</td><td><b>El RFC del despacho</b> (por ejemplo <code className="bg-white/70 px-1 rounded">CAAX7605101P8</code>), no su nombre.</td><td>El cliente queda individual.</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-marino/50">
            Los saltos de línea y las columnas extra se ignoran. Si un RFC ya existe, se actualiza, no se duplica.
          </p>
        </details>

        <a className="inline-block text-xs text-dorado font-semibold hover:underline mt-1" href="/excel-template.csv" download>
          Descargar plantilla →
        </a>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={e => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
        className={`grid place-items-center gap-2 text-center border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer transition-colors ${
          arrastrando ? 'border-dorado bg-dorado/5' : bad ? 'border-rose-300 bg-rose-50/40' : 'border-line hover:border-dorado/50 hover:bg-hueso/40'
        }`}
      >
        {loading ? <Spinner /> : (
          <svg width="26" height="26" className={bad ? 'text-rose-400' : 'text-marino/30'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
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
        <Alert
          variant={bad ? (res && res.ok > 0 ? 'warning' : 'danger') : 'success'}
          titulo={bad ? (res && res.ok > 0 ? 'Carga aplicada con errores' : 'No se pudo procesar el archivo') : 'Carga masiva aplicada'}
          onClose={() => { setMsg(''); setRes(null); setBad(false) }}
        >
          {msg}
          {res && res.detalle && res.detalle.length > 0 && (
            <ul className="mt-2 text-[11px] space-y-1 list-disc pl-4 max-h-28 overflow-y-auto">
              {res.detalle.slice(0, 20).map((d, i) => <li key={i} className="break-all">{d}</li>)}
            </ul>
          )}
          {res && res.detalle && res.detalle.length > 20 && (
            <div className="text-[11px] mt-1.5 opacity-70">y {res.detalle.length - 20} error(es) más…</div>
          )}
        </Alert>
      )}

      <p className="text-xs text-marino/45 flex items-start gap-1.5">
        <svg width="12" height="12" className="mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 118 0v3"/></svg>
        Las contraseñas del archivo se cifran al instante y el archivo no se guarda en el servidor.
      </p>
    </div>
  )
}
