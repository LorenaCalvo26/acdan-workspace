import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import { copiarTexto } from '../lib/portal'
import { Alert, Spinner } from './ui'

type Registro = {
  docId: string; folio: string; vista: 'emitidas' | 'recibidas'; campos: Record<string, string>
  xmlGuardado?: string; pdfGuardado?: string; acuseGuardado?: string
  xmlDisponible?: string; pdfDisponible?: string; estadoDescarga: string
  xmlError?: string; pdfError?: string; acuseError?: string
  clasificacion?: string; serie?: string; folioComercial?: string
  xmlDatos?: Record<string, any>
}

type Orden = 'fecha' | 'importe' | 'contraparte'

function ultimoMesCerrado() {
  const partes = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const anio = Number(partes.find(p => p.type === 'year')!.value)
  const mes = Number(partes.find(p => p.type === 'month')!.value)
  return new Date(Date.UTC(anio, mes - 2, 1)).toISOString().slice(0, 7)
}
const ACTIVOS = new Set(['queued', 'login', 'captcha', 'consultando_cfdi', 'descargando_cfdi', 'descargando', 'extrayendo'])

const fecha = (row: Registro) => row.xmlDatos?.fecha || row.campos['Fecha de Emisión'] || ''
const importe = (row: Registro) => Number(String(row.xmlDatos?.total || row.campos.Total || '').replace(/[^\d.-]/g, '')) || 0
const moneda = (row: Registro) => row.xmlDatos?.moneda || (row.vista === 'emitidas' ? 'MXN' : '')
const serieFolio = (row: Registro) => [row.xmlDatos?.serie || row.serie, row.xmlDatos?.folioComercial || row.folioComercial].filter(Boolean).join('-')
const clasificacion = (row: Registro) => row.clasificacion || row.campos['Efecto del Comprobante'] || ''
// La contraparte es el otro extremo del movimiento: quién te factura en Recibidas, a quién facturas en Emitidas.
function contraparte(row: Registro) {
  const x = row.xmlDatos || {}
  const esEmisora = row.vista === 'emitidas'
  return {
    rfc: (esEmisora ? x.receptorRfc : x.emisorRfc) || (esEmisora ? row.campos['RFC Receptor'] : row.campos['RFC Emisor']) || '',
    nombre: (esEmisora ? x.receptorNombre : x.emisorNombre) || (esEmisora ? row.campos['Nombre o Razón Social del Receptor'] : row.campos['Nombre o Razón Social del Emisor']) || '',
  }
}
const busquedaTexto = (row: Registro) => [row.folio, row.campos['RFC Emisor'], row.campos['RFC Receptor'],
  row.campos['Nombre o Razón Social del Emisor'], row.campos['Nombre o Razón Social del Receptor'],
  row.xmlDatos?.serie, row.xmlDatos?.folioComercial, row.xmlDatos?.emisorNombre, row.xmlDatos?.receptorNombre]
  .filter(Boolean).join(' ').toLowerCase()

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
  const [clasif, setClasif] = useState('')
  const [pagina, setPagina] = useState(1)
  const [orden, setOrden] = useState<Orden>('fecha')
  const [ordenDir, setOrdenDir] = useState<'asc' | 'desc'>('desc')
  const [abierto, setAbierto] = useState('')
  const [copiado, setCopiado] = useState('')

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
  useEffect(() => { setPagina(1); setAbierto('') }, [vista, busqueda, estado, clasif, periodo, orden, ordenDir])

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

  async function copiarUUID(uuid: string) {
    if (await copiarTexto(uuid)) { setCopiado(uuid); setTimeout(() => setCopiado(''), 2000) }
  }

  function excel() {
    const libro = XLSX.utils.book_new()
    for (const tipo of ['emitidas', 'recibidas'] as const) {
      const filas = items.filter(row => row.vista === tipo).map(row => {
        const x = row.xmlDatos || {}
        return {
          'Version': x.versionCfdi || '', 'Tipo': x.clasificacion || row.clasificacion || '',
          'Fecha Emision': x.fecha || row.campos['Fecha de Emisión'] || '', 'Fecha Timbrado': x.fechaTimbrado || '',
          'Serie': x.serie || '', 'Folio': x.folioComercial || '', 'UUID': row.folio, 'UUID Relacion': x.uuidRelacion || '',
          'RFC Emisor': x.emisorRfc || row.campos['RFC Emisor'] || '', 'Nombre Emisor': x.emisorNombre || '',
          'Regimen Fiscal Emisor': x.emisorRegimenFiscalDesc || x.emisorRegimenFiscal || '', 'LugarDeExpedicion': x.lugarExpedicion || '',
          'RFC Receptor': x.receptorRfc || row.campos['RFC Receptor'] || '', 'Nombre Receptor': x.receptorNombre || '',
          'UsoCFDI': x.usoCfdiDesc || x.usoCfdi || '', 'RegimenFiscalReceptor': x.receptorRegimenFiscalDesc || x.receptorRegimenFiscal || '',
          'DomicilioFiscalReceptor': x.receptorDomicilioFiscal || '', 'ResidenciaFiscal': x.receptorResidenciaFiscal || '', 'NumRegIdTrib': x.receptorNumRegIdTrib || '',
          'SubTotal': x.subTotal || '', 'Descuento': x.descuento || '', 'Total IEPS': x.iepsTotal || '',
          'IVA 16%': x.iva16 || '', 'IVA 8%': x.iva8 || '', 'Retenido IVA': x.retIva || '', 'Retenido ISR': x.retIsr || '', 'ISH': x.ish || '',
          'Total': x.total || row.campos.Total || '', 'Total Trasladados': x.totalTrasladados || '', 'Total Retenidos': x.totalRetenidos || '',
          'Total LocalTrasladado': x.totalLocalTrasladado || '', 'Total LocalRetenido': x.totalLocalRetenido || '',
          'Moneda': x.moneda || '', 'Tipo De Cambio': x.tipoCambio || '',
          'FormaDePago': x.formaPagoDesc || x.formaPago || '', 'Metodo de Pago': x.metodoPagoDesc || x.metodoPago || '',
          'Conceptos': x.conceptosResumen || '', 'Exportacion': x.exportacionDesc || x.exportacion || '',
          'Estado SAT': row.campos['Estado del Comprobante'] || '', 'Estado de descarga': row.estadoDescarga,
          'XML guardado': row.xmlGuardado === 'true' ? 'Sí' : 'No', 'PDF guardado': row.pdfGuardado === 'true' ? 'Sí' : 'No',
        }
      })
      const hoja = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([['Folio Fiscal', 'Total']])
      hoja['!cols'] = Array.from({ length: 41 }, () => ({ wch: 22 }))
      XLSX.utils.book_append_sheet(libro, hoja, tipo === 'emitidas' ? 'Emitidas' : 'Recibidas')
    }
    XLSX.writeFile(libro, `CFDI-${rfc}-${periodo}.xlsx`)
  }

  function ordenarPor(campo: Orden) {
    if (orden === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrden(campo); setOrdenDir(campo === 'fecha' ? 'desc' : 'asc') }
  }
  const flecha = (campo: Orden) => orden === campo ? (ordenDir === 'asc' ? ' ▲' : ' ▼') : ''

  const registros = useMemo(() => {
    const filtrados = items.filter(row => row.vista === vista
      && (!estado || row.campos['Estado del Comprobante'] === estado)
      && (!clasif || clasificacion(row) === clasif)
      && (!busqueda || busquedaTexto(row).includes(busqueda.toLowerCase())))
    const cmp = (a: Registro, b: Registro) => {
      const r = orden === 'fecha' ? fecha(a).localeCompare(fecha(b))
        : orden === 'importe' ? importe(a) - importe(b)
        : contraparte(a).nombre.localeCompare(contraparte(b).nombre)
      return ordenDir === 'asc' ? r : -r
    }
    return [...filtrados].sort(cmp)
  }, [items, vista, estado, clasif, busqueda, orden, ordenDir])

  const paginas = Math.max(1, Math.ceil(registros.length / 25))
  const pag = Math.min(pagina, paginas)
  const corriendo = ACTIVOS.has(job?.status)
  const totalVista = registros.reduce((s, r) => s + importe(r), 0)
  const monedaVista = registros.map(moneda).find(Boolean) || 'MXN'

  const umbral = 'sticky top-0 z-10 bg-white border-b border-line'

  return <section className="card overflow-hidden anim-in">
    <header className="p-5 border-b border-line flex flex-wrap justify-between gap-3">
      <div><h2 className="font-bold text-lg">Movimientos CFDI</h2><p className="text-xs text-marino/55">Del primer al último día del mes · Emitidas y Recibidas · revisión del contador</p></div>
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
        <input aria-label="Buscar CFDI" className="input flex-1 min-w-[160px]" placeholder="Buscar folio, RFC, razón social o UUID" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select aria-label="Estado del comprobante" className="input !w-auto" value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option><option>Vigente</option><option>Cancelado</option></select>
        <select aria-label="Clasificación CFDI" className="input !w-auto" value={clasif} onChange={e => setClasif(e.target.value)}><option value="">Todas las categorías</option>{[...new Set(items.map(row => clasificacion(row)).filter(Boolean))].sort().map(c => <option key={c}>{c}</option>)}</select>
      </div>
      {loading ? <div className="py-8 text-center"><Spinner /></div> : <>
        <div className="overflow-auto max-h-[70vh] rounded-xl border border-line">
          <table className="w-full text-sm text-left border-collapse">
            <thead><tr className="text-xs text-marino/60">
              <th className={`${umbral} p-3 whitespace-nowrap`}><button className="hover:text-marino" onClick={() => ordenarPor('fecha')}>Fecha{flecha('fecha')}</button></th>
              <th className={`${umbral} p-3 whitespace-nowrap`}>Serie-Folio</th>
              <th className={`${umbral} p-3 whitespace-nowrap`}><button className="hover:text-marino" onClick={() => ordenarPor('contraparte')}>{vista === 'emitidas' ? 'Cliente' : 'Proveedor'}{flecha('contraparte')}</button></th>
              <th className={`${umbral} p-3 whitespace-nowrap hidden md:table-cell`}>Clasificación</th>
              <th className={`${umbral} p-3 whitespace-nowrap text-right`}><button className="hover:text-marino" onClick={() => ordenarPor('importe')}>Importe{flecha('importe')}</button></th>
              <th className={`${umbral} p-3 whitespace-nowrap hidden sm:table-cell`}>Estado</th>
              <th className={`${umbral} p-3 whitespace-nowrap`}>Archivos</th>
            </tr></thead>
            <tbody>{registros.slice((pag - 1) * 25, pag * 25).map(row => {
              const cp = contraparte(row)
              const x = row.xmlDatos || {}
              const abiertoAqui = abierto === row.docId
              return (
                <Fragmento key={row.docId}>
                  <tr className={`border-t border-line/60 cursor-pointer ${abiertoAqui ? 'bg-dorado/5' : 'hover:bg-hueso/60'}`} onClick={() => setAbierto(a => a === row.docId ? '' : row.docId)}>
                    <td className="p-3 text-xs whitespace-nowrap"><span className="text-marino/40 mr-1">{abiertoAqui ? '▾' : '▸'}</span>{fecha(row)?.replace('T', ' ')}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{serieFolio(row) || '—'}</td>
                    <td className="p-3 min-w-[180px]"><b className="text-xs">{cp.rfc || '—'}</b><div className="text-xs text-marino/55 truncate max-w-[260px]" title={cp.nombre}>{cp.nombre || 'Sin razón social'}</div></td>
                    <td className="p-3 text-xs hidden md:table-cell">{clasificacion(row)}<div className="text-[11px] text-marino/45">{x.versionNomina ? `Nómina ${x.versionNomina}` : x.versionPagos ? `Pagos ${x.versionPagos}` : x.metodoPago || ''}</div></td>
                    <td className="p-3 whitespace-nowrap tabular-nums text-right"><b>{x.total || row.campos.Total || ''}</b><div className="text-[11px] text-marino/45">{moneda(row)}</div></td>
                    <td className="p-3 text-xs hidden sm:table-cell">{row.campos['Estado del Comprobante']}</td>
                    <td className="p-3 min-w-[150px]" onClick={e => e.stopPropagation()}><div className="flex gap-1">
                      {(['pdf', 'xml', 'acuse'] as const).filter(formato => formato !== 'acuse' || row.acuseGuardado === 'true').map(formato => <button key={formato} className="btn-ghost btn-sm" disabled={!!busy || row[`${formato}Guardado`] !== 'true'} title={row[`${formato}Error`] || (row[`${formato}Guardado`] === 'true' ? `Descargar ${formato}` : 'No disponible o pendiente de descarga del SAT')} onClick={() => descargar(row, formato)}>{busy === row.docId + formato ? <Spinner small /> : formato.toUpperCase()}</button>)}
                    </div>{row.pdfDisponible === 'false' && row.xmlDisponible === 'false' && <div className="text-[11px] text-marino/50 mt-1">SAT no ofrece PDF/XML</div>}</td>
                  </tr>
                  {abiertoAqui && <tr className="bg-hueso/40"><td colSpan={7} className="p-4 border-t border-line/60">
                    <Detalle row={row} copiado={copiado} onCopiar={copiarUUID} />
                  </td></tr>}
                </Fragmento>
              )
            })}</tbody>
          </table>
        </div>
        {!registros.length && <p className="text-sm text-marino/55 text-center py-6">No hay CFDI para esta consulta.</p>}
        <div className="flex items-center justify-between text-xs text-marino/55">
          <span>{registros.length} movimientos · total {monedaVista} {totalVista.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · página {pag} de {paginas}</span>
          <div className="flex gap-2"><button className="btn-ghost btn-sm" disabled={pag <= 1} onClick={() => setPagina(pag - 1)}>Anterior</button><button className="btn-ghost btn-sm" disabled={pag >= paginas} onClick={() => setPagina(pag + 1)}>Siguiente</button></div>
        </div>
      </>}
    </div>
  </section>
}

function Linea({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  if (!v) return null
  return <div className="flex items-baseline gap-2 py-1 border-b border-line/40 last:border-0"><span className="text-[11px] uppercase tracking-wider text-marino/45 w-28 shrink-0">{k}</span><span className={`text-xs font-semibold break-all ${mono ? 'font-mono' : ''}`}>{v}</span></div>
}

function Detalle({ row, copiado, onCopiar }: { row: Registro; copiado: string; onCopiar: (uuid: string) => void }) {
  const x = row.xmlDatos || {}
  const imp = x.impuestos || {}
  const traslados: any[] = imp.traslados || []
  const retenciones: any[] = imp.retenciones || []
  const conceptos: any[] = x.conceptos || []
  return <div className="grid gap-4 lg:grid-cols-2">
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-marino/45 mb-2">Identificadores y pago</div>
      <div className="flex items-baseline gap-2 py-1 border-b border-line/40"><span className="text-[11px] uppercase tracking-wider text-marino/45 w-28 shrink-0">UUID</span><span className="text-xs font-mono break-all">{row.folio}</span><button className="btn-ghost btn-sm shrink-0" onClick={() => onCopiar(row.folio)}>{copiado === row.folio ? '¡Copiado!' : 'Copiar'}</button></div>
      <Linea k="UUID relacionado" v={x.uuidRelacion} mono />
      <Linea k="Versión CFDI" v={x.versionCfdi} />
      <Linea k="Lugar expedición" v={x.lugarExpedicion} mono />
      <Linea k="Forma de pago" v={x.formaPagoDesc || x.formaPago} />
      <Linea k="Método de pago" v={x.metodoPagoDesc || x.metodoPago} />
      <Linea k="Uso CFDI" v={x.usoCfdiDesc || x.usoCfdi} />
      <Linea k="Régimen receptor" v={x.receptorRegimenFiscalDesc || x.receptorRegimenFiscal} />
      <Linea k="Domicilio receptor" v={x.receptorDomicilioFiscal} mono />
      {x.versionNomina && <Linea k="Nómina" v={`${x.versionNomina}${x.tipoNomina ? ` · ${x.tipoNomina}` : ''}`} />}
      {x.versionPagos && <Linea k="Pagos" v={x.versionPagos} />}
    </div>
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-marino/45 mb-2">Impuestos</div>
      <table className="w-full text-xs">
        <thead><tr className="text-marino/45 text-[11px]"><th className="text-left py-1">Impuesto</th><th className="text-left py-1">Factor</th><th className="text-right py-1">Base</th><th className="text-right py-1">Importe</th></tr></thead>
        <tbody>
          {[...traslados.map(t => ({ ...t, signo: '+' })), ...retenciones.map(t => ({ ...t, signo: '−' }))].map((t, i) => <tr key={i} className="border-t border-line/40"><td className="py-1">{t.impuestoDesc || t.impuesto}{t.tasa ? ` ${t.tasa}%` : ''}</td><td className="py-1 text-marino/60">{t.tipoFactor}{t.signo === '−' ? ' (ret)' : ''}</td><td className="py-1 text-right tabular-nums">{t.base || ''}</td><td className="py-1 text-right tabular-nums">{t.signo}{t.importe || ''}</td></tr>)}
          {!traslados.length && !retenciones.length && <tr><td colSpan={4} className="py-2 text-marino/45">Sin impuestos en el XML.</td></tr>}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-marino/55">
        {imp.totalTrasladados && <span>Trasladados <b className="text-marino">{imp.totalTrasladados}</b></span>}
        {imp.totalRetenidos && <span>Retenidos <b className="text-marino">{imp.totalRetenidos}</b></span>}
        {x.totalLocalTrasladado && <span>Locales <b className="text-marino">{x.totalLocalTrasladado}</b></span>}
      </div>
    </div>
    <div className="lg:col-span-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-marino/45 mb-2">Conceptos</div>
      {conceptos.length ? <table className="w-full text-xs">
        <thead><tr className="text-marino/45 text-[11px]"><th className="text-left py-1">Descripción</th><th className="text-left py-1 hidden sm:table-cell">Clave</th><th className="text-right py-1">Cantidad</th><th className="text-right py-1">Importe</th></tr></thead>
        <tbody>{conceptos.map((c, i) => <tr key={i} className="border-t border-line/40"><td className="py-1 max-w-[360px]">{c.descripcion}</td><td className="py-1 hidden sm:table-cell font-mono text-marino/55">{c.claveProdServ}</td><td className="py-1 text-right tabular-nums">{c.cantidad}</td><td className="py-1 text-right tabular-nums">{c.importe}</td></tr>)}</tbody>
      </table> : <p className="text-xs text-marino/45">{x.conceptosResumen || 'Sin conceptos en el XML.'}</p>}
    </div>
  </div>
}

function Fragmento({ children }: { children: ReactNode }) {
  return <>{children}</>
}
