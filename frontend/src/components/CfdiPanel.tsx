import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import { Alert, Spinner } from './ui'

type Registro = {
  docId: string; folio: string; vista: 'emitidas' | 'recibidas'; campos: Record<string, string>
  xmlGuardado?: string; pdfGuardado?: string; acuseGuardado?: string
  xmlDisponible?: string; pdfDisponible?: string; estadoDescarga: string
  xmlError?: string; pdfError?: string; acuseError?: string
}

function ultimoMesCerrado() {
  const partes = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const anio = Number(partes.find(p => p.type === 'year')!.value)
  const mes = Number(partes.find(p => p.type === 'month')!.value)
  return new Date(Date.UTC(anio, mes - 2, 1)).toISOString().slice(0, 7)
}
const ACTIVOS = new Set(['queued', 'login', 'captcha', 'consultando_cfdi', 'descargando_cfdi', 'descargando', 'extrayendo'])

export default function CfdiPanel({ rfc, token, soloLectura = false }: { rfc: string; token: string; soloLectura?: boolean }) {
  const [periodo, setPeriodo] = useState(ultimoMesCerrado)
  const [vista, setVista] = useState<'emitidas' | 'recibidas'>('emitidas')
  const [items, setItems] = useState<Registro[]>([])
  const [job, setJob] = useState<any>(null)
  const [resumen, setResumen] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [version, setVersion] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    let cancelado = false
    let timer: ReturnType<typeof setTimeout>
    setLoading(true); setItems([]); setJob(null); setResumen(null); setErr('')
    async function cargar() {
      const result = await api('/cfdi/listar', { method: 'POST', body: JSON.stringify({ token, rfc, periodo }) })
      if (cancelado) return
      if (result?.error) setErr(result.detail || result.error)
      else { setItems(result.items || []); setJob(result.job); setResumen(result.resumen); setErr('') }
      setLoading(false)
      timer = setTimeout(cargar, ACTIVOS.has(result?.job?.status) ? 5000 : 60000)
    }
    if (token) cargar(); else setLoading(false)
    return () => { cancelado = true; clearTimeout(timer) }
  }, [rfc, token, periodo, version])
  useEffect(() => setPagina(1), [vista, busqueda, estado, periodo])

  async function sincronizar() {
    setBusy('sync'); setErr('')
    try {
      const result = await api('/cfdi/sincronizar', { method: 'POST', body: JSON.stringify({ token, rfc, periodo }) })
      if (result?.error && result.error !== 'JOB_EN_CURSO') setErr(result.detail || result.error)
      else setVersion(v => v + 1)
    } finally { setBusy('') }
  }

  async function descargar(row: Registro, formato: 'pdf' | 'xml' | 'acuse') {
    setBusy(row.docId + formato); setErr('')
    try {
      const result = await api('/cfdi/archivo', { method: 'POST', body: JSON.stringify({ token, rfc, docId: row.docId, formato }) })
      if (!result?.ok || !result?.base64) throw new Error(result.detail || result.error || 'No se pudo obtener el archivo')
      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: result.mime }))
      const a = document.createElement('a'); a.href = url; a.download = result.nombre; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error: any) { setErr(error.message) }
    finally { setBusy('') }
  }

  function excel() {
    const libro = XLSX.utils.book_new()
    for (const tipo of ['emitidas', 'recibidas'] as const) {
      const filas = items.filter(row => row.vista === tipo).map(row => ({
        ...Object.fromEntries(Object.entries(row.campos).filter(([nombre]) => nombre !== 'Acciones')),
        Total: Number((row.campos.Total || '0').replace(/[^\d.-]/g, '')),
        'Estado de descarga': row.estadoDescarga,
        'XML guardado': row.xmlGuardado === 'true' ? 'Sí' : 'No',
        'PDF guardado': row.pdfGuardado === 'true' ? 'Sí' : 'No',
      }))
      const hoja = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([['Folio Fiscal', 'Total']])
      hoja['!cols'] = Array.from({ length: 23 }, () => ({ wch: 24 }))
      XLSX.utils.book_append_sheet(libro, hoja, tipo === 'emitidas' ? 'Emitidas' : 'Recibidas')
    }
    XLSX.writeFile(libro, `CFDI-${rfc}-${periodo}.xlsx`)
  }

  const registros = items.filter(row => row.vista === vista && (!estado || row.campos['Estado del Comprobante'] === estado) &&
    (!busqueda || Object.values(row.campos).some(value => value.toLowerCase().includes(busqueda.toLowerCase()))))
  const paginas = Math.max(1, Math.ceil(registros.length / 25))
  const pag = Math.min(pagina, paginas)
  const corriendo = ACTIVOS.has(job?.status)

  return <section className="card overflow-hidden anim-in">
    <header className="p-5 border-b border-line flex flex-wrap justify-between gap-3">
      <div><h2 className="font-bold text-lg">CFDI mensuales</h2><p className="text-xs text-marino/55">Del primer al último día del mes · Emitidas y Recibidas · PDF y XML por registro</p></div>
      <div className="flex items-center gap-2 flex-wrap">
        <input aria-label="Mes de CFDI" className="input !w-auto" type="month" value={periodo} max={ultimoMesCerrado()} onChange={e => { if (e.target.value) setPeriodo(e.target.value) }} />
        <button className="btn-ghost btn-sm" onClick={excel} disabled={!items.length}>Excel del mes</button>
        {!soloLectura && <button className="btn-gold btn-sm" onClick={sincronizar} disabled={!!busy || corriendo}>{busy === 'sync' || corriendo ? <><Spinner small /> Sincronizando…</> : 'Sincronizar mes'}</button>}
      </div>
    </header>
    <div className="p-5 grid gap-3">
      {err && <Alert variant="danger">{err}</Alert>}
      {corriendo && <Alert variant="info"><Spinner small /> {job.status === 'descargando_cfdi' ? `Descargando archivos: ${job.cfdiProcesados || 0}/${job.cfdiTotal || '…'} · ${job.cfdiVista || ''}` : 'Consultando el portal SAT…'}</Alert>}
      {!corriendo && job?.status === 'error' && <Alert variant="danger">Última sincronización: {job.error}</Alert>}
      {!corriendo && (job?.status === 'parcial' || resumen?.estado === 'parcial') && <Alert variant="info">Hay archivos pendientes. Los registros ya están disponibles; la siguiente sincronización reintenta solo los archivos faltantes.</Alert>}
      <div className="flex flex-wrap gap-2 items-center">
        {(['emitidas', 'recibidas'] as const).map(tipo => <button key={tipo} className={`chip ${vista === tipo ? 'bg-marino text-white border-marino' : ''}`} onClick={() => setVista(tipo)}>{tipo === 'emitidas' ? 'Emitidas' : 'Recibidas'} ({items.filter(row => row.vista === tipo).length})</button>)}
        <input aria-label="Buscar CFDI" className="input flex-1 min-w-[160px]" placeholder="Buscar folio, RFC o razón social" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select aria-label="Estado del comprobante" className="input !w-auto" value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option><option>Vigente</option><option>Cancelado</option></select>
      </div>
      {loading ? <div className="py-8 text-center"><Spinner /></div> : <>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left">
          <thead><tr className="text-xs text-marino/60 border-b border-line">{['Folio fiscal', 'Emisor', 'Receptor', 'Emisión', 'Total', 'Efecto', 'Estado', 'Archivos'].map(col => <th key={col} className="p-3 whitespace-nowrap">{col}</th>)}</tr></thead>
          <tbody>{registros.slice((pag - 1) * 25, pag * 25).map(row => <tr key={row.docId} className="border-b border-line/50 hover:bg-hueso/60">
            <td className="p-3 font-mono text-xs whitespace-nowrap">{row.folio}</td>
            <td className="p-3 min-w-[180px]"><b className="text-xs">{row.campos['RFC Emisor']}</b><div className="text-xs text-marino/55">{row.campos['Nombre o Razón Social del Emisor']}</div></td>
            <td className="p-3 min-w-[180px]"><b className="text-xs">{row.campos['RFC Receptor']}</b><div className="text-xs text-marino/55">{row.campos['Nombre o Razón Social del Receptor']}</div></td>
            <td className="p-3 text-xs whitespace-nowrap">{row.campos['Fecha de Emisión']?.replace('T', ' ')}</td><td className="p-3 whitespace-nowrap tabular-nums">{row.campos.Total}</td><td className="p-3">{row.campos['Efecto del Comprobante']}</td><td className="p-3">{row.campos['Estado del Comprobante']}</td>
            <td className="p-3 min-w-[170px]"><div className="flex gap-1">
              {(['pdf', 'xml', 'acuse'] as const).filter(formato => formato !== 'acuse' || row.acuseGuardado === 'true').map(formato => <button key={formato} className="btn-ghost btn-sm" disabled={!!busy || row[`${formato}Guardado`] !== 'true'} title={row[`${formato}Error`] || (row[`${formato}Guardado`] === 'true' ? `Descargar ${formato}` : 'No disponible o pendiente de descarga del SAT')} onClick={() => descargar(row, formato)}>{busy === row.docId + formato ? <Spinner small /> : formato.toUpperCase()}</button>)}
            </div>{row.pdfDisponible === 'false' && row.xmlDisponible === 'false' && <div className="text-[11px] text-marino/50 mt-1">SAT no ofrece PDF/XML</div>}</td>
          </tr>)}</tbody>
        </table></div>
        {!registros.length && <p className="text-sm text-marino/55 text-center py-6">No hay CFDI para esta consulta.</p>}
        <div className="flex items-center justify-between text-xs text-marino/55"><span>{registros.length} registros · página {pag} de {paginas}</span><div className="flex gap-2"><button className="btn-ghost btn-sm" disabled={pag <= 1} onClick={() => setPagina(pag - 1)}>Anterior</button><button className="btn-ghost btn-sm" disabled={pag >= paginas} onClick={() => setPagina(pag + 1)}>Siguiente</button></div></div>
      </>}
    </div>
  </section>
}
