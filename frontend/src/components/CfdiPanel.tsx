import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../lib/api'
import { copiarTexto } from '../lib/portal'
import { Alert, MenuBoton, Spinner } from './ui'

export type Registro = {
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
export function clasificacion(row: Registro) { return row.clasificacion || row.campos['Efecto del Comprobante'] || '' }
// La contraparte es el otro extremo del movimiento: quién te factura en Recibidas, a quién facturas en Emitidas.
function contraparte(row: Registro) {
  const x = row.xmlDatos || {}
  const esEmisora = row.vista === 'emitidas'
  return {
    rfc: (esEmisora ? x.receptorRfc : x.emisorRfc) || (esEmisora ? row.campos['RFC Receptor'] : row.campos['RFC Emisor']) || '',
    nombre: (esEmisora ? x.receptorNombre : x.emisorNombre) || (esEmisora ? row.campos['Nombre o Razón Social del Receptor'] : row.campos['Nombre o Razón Social del Emisor']) || '',
  }
}
export const busquedaTexto = (row: Registro) => [row.folio, row.campos['RFC Emisor'], row.campos['RFC Receptor'],
  row.campos['Nombre o Razón Social del Emisor'], row.campos['Nombre o Razón Social del Receptor'],
  row.xmlDatos?.serie, row.xmlDatos?.folioComercial, row.xmlDatos?.emisorNombre, row.xmlDatos?.receptorNombre]
  .filter(Boolean).join(' ').toLowerCase()

type Filtros = { vista?: VistaUI; estado: string; clasif: string[]; busqueda: string }
// Nóminas como vista de primera clase: junta ambas vistas filtradas a Nómina.
export type VistaUI = Registro['vista'] | 'nominas'
export const esNomina = (row: Registro) => clasificacion(row).startsWith('Nómina')
// Cruce PPD↔complementos por UUID, como el admin contable: PUE se da por
// pagada sin marca; PPD con complemento(s) es Pagada (saldo 0) o Parcial;
// PPD sin complemento es Pendiente. Los complementos no llevan estado.
export type PagoInfo = { estado: string; fecha: string }
export function mapaEstadoPago(rows: Registro[]): Map<string, PagoInfo> {
  const porUuid = new Map<string, { saldoCero: boolean; fechas: string[] }>()
  for (const r of rows) {
    if (!esPago(r)) continue
    for (const p of ((r.xmlDatos?.pagosRelacionados || []) as any[])) {
      const id = String(p.IdDocumento || '').toUpperCase()
      if (!id) continue
      const e = porUuid.get(id) || { saldoCero: false, fechas: [] }
      const insoluto = String(p.ImpSaldoInsoluto ?? '').trim()
      if (insoluto !== '' && Number(insoluto) === 0) e.saldoCero = true
      if (p.FechaPago) e.fechas.push(String(p.FechaPago))
      porUuid.set(id, e)
    }
  }
  const mapa = new Map<string, PagoInfo>()
  for (const r of rows) {
    const uuid = r.folio.toUpperCase()
    if (esPago(r)) {
      const fechas = ((r.xmlDatos?.pagosRelacionados || []) as any[]).map(p => String(p.FechaPago || '')).filter(Boolean).sort()
      mapa.set(uuid, { estado: '', fecha: fechas.pop() || '' })
      continue
    }
    const metodo = String(r.xmlDatos?.metodoPago || '').toUpperCase()
    if (metodo.includes('PUE')) { mapa.set(uuid, { estado: '', fecha: '' }); continue }
    if (metodo.includes('PPD')) {
      const e = porUuid.get(uuid)
      if (!e) { mapa.set(uuid, { estado: 'Pendiente', fecha: '' }); continue }
      mapa.set(uuid, { estado: e.saldoCero ? 'Pagada' : 'Parcial', fecha: [...e.fechas].sort().pop() || '' })
      continue
    }
    mapa.set(uuid, { estado: '', fecha: '' })
  }
  return mapa
}
// Selección única que comparten la tabla, el resumen y la exportación.
export function seleccionar(rows: Registro[], f: Filtros) {
  return rows.filter(row => (f.vista === 'nominas' ? esNomina(row) : (!f.vista || row.vista === f.vista))
    && (!f.estado || row.campos['Estado del Comprobante'] === f.estado)
    && (!f.clasif.length || f.clasif.includes(clasificacion(row)))
    && (!f.busqueda || busquedaTexto(row).includes(f.busqueda.toLowerCase())))
}

// El admin fecha la emisión como dd/mm/aaaa (el timbrado queda ISO).
const fechaCortaSAT = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '')
}

// Layout de nóminas (encabezado de su archivo de Nómina, textual).
// Códigos tal cual (sin catálogo de descripciones aún); lo ausente queda vacío.
export function filaExcelNomina(row: Registro) {
  const x = row.xmlDatos || {}
  const descrip = ((x.conceptos || []) as any[]).map(c => String(c.descripcion || '')).filter(Boolean).join(' | ')
  return {
    'Verificado ó Asoc.': '',
    'EstadoSAT': row.campos['Estado del Comprobante'] || '',
    'FechaEmision': fechaCortaSAT(x.fecha || row.campos['Fecha de Emisión'] || ''),
    'Serie': x.serie || '', 'Folio': x.folioComercial || '', 'UUID': row.folio,
    'RFC Receptor': x.receptorRfc || row.campos['RFC Receptor'] || '', 'NombreReceptor': x.receptorNombre || '',
    'RegistroPatronal ': x.nomRegistroPatronal || '',
    'TipoNomina ': x.nomTipoDesc || x.tipoNomina || '',
    'FechaPago ': x.nomFechaPago || '',
    'FechaInicialPago ': x.nomFechaIni || '',
    'FechaFinalPago ': x.nomFechaFin || '',
    'NumDiasPagados ': x.nomDias || '',
    'TotalPercepciones ': x.nomTotalPer || '',
    'TotalDeducciones ': x.nomTotalDed || '',
    'TotalOtrosPagos ': x.nomTotalOtros || '',
    'SubTotal': x.subTotal || '', 'Descuento': x.descuento || '',
    'ISR XML': x.retIsr || '',
    'Total': x.total || row.campos.Total || '',
    'MetodoPago': x.metodoPago || '',
    'Regimen': x.receptorRegimenFiscal || '',
    'ArchivoXML': row.folio ? `${row.folio}.xml` : '',
    'Conceptos': descrip || 'Pago de nómina',
    'Version ': x.versionNomina || '',
    'Moneda': x.moneda || '', 'TipoCambio': x.tipoCambio || '',
    'ReceptorCurp ': x.nomCurp || '',
    'NumSeguridadSocial ': x.nomNss || '',
    'FechaInicioRelLaboral ': x.nomFechaInicioRel || '',
    'Antigüedad ': x.nomAntiguedad || '',
    'TipoContratoTipoContrato': x.nomTipoContrato || '',
    'Sindicalizado ': x.nomSindicalizado || '',
    'TipoJornada ': x.nomTipoJornada || '',
    'TipoRegimen ': x.nomTipoRegimen || '',
    'NumEmpleado ': x.nomNumEmpleado || '',
    'Departamento ': x.nomDepartamento || '',
    'Pueston ': x.nomPuesto || '',
    'RiesgoPuesto ': x.nomRiesgoPuesto || '',
    'PeriodicidadPago ': x.nomPeriodicidad || '',
    'Banco ': x.nomBanco || '',
    'CuentaBancaria ': x.nomCuenta || '',
    'SalarioBaseCotApor ': x.nomSalarioBase || '',
    'SalarioDiarioIntegrado ': x.nomSalarioDiario || '',
    'ClaveEntFed ': x.nomClaveEntFed || '',
    'TotalSueldosPer': x.nomTotalSueldos || '',
    'TotalSeparacionIndemnizacionPer': x.nomTotalSepInd || '',
    'TotalJubilacionPensionRetiroPer': x.nomTotalJub || '',
    'TotalGravadoPercepcion ': x.nomTotalGravado || '',
    'TotalExentoPercepcion': x.nomTotalExento || '',
    'TotalOtrasDeducciones ': x.nomTotalOtrasDed || '',
    'TotalImpuestosRetenidosDed': x.nomTotalImpRet || '',
  }
}

// Layout de complementos de pago (encabezado de su archivo de Pagos):
// datos del nodo Pago + UUID relacionado, no columnas de factura.
export function filaExcelPagos(row: Registro) {
  const x = row.xmlDatos || {}
  const rel = (((x.pagosRelacionados || []) as any[])[0] || {}) as Record<string, unknown>
  const str = (v: unknown) => String(v ?? '')
  const descrip = ((x.conceptos || []) as any[]).map(c => String(c.descripcion || '')).filter(Boolean).join(' | ')
  return {
    'Verificado': '',
    'Estado SAT': row.campos['Estado del Comprobante'] || '',
    'Version': x.versionCfdi || '',
    'TipoComprobante': x.tipoComprobante || '',
    'Fecha Emision': fechaCortaSAT(str(x.fecha) || row.campos['Fecha de Emisión'] || ''),
    'Serie': x.serie || '', 'Folio': x.folioComercial || '', 'UUID': row.folio,
    'RFC Emisor': x.emisorRfc || row.campos['RFC Emisor'] || '', 'Nombre Emisor': x.emisorNombre || '',
    'RFC Receptor': x.receptorRfc || row.campos['RFC Receptor'] || '', 'Nombre Receptor': x.receptorNombre || '',
    'UsoCFDI': x.usoCfdiDesc || x.usoCfdi || '',
    'FechaPago': x.pagoFecha || str(rel['FechaPago']) || '',
    'FormaDePagoP': x.pagoForma || '',
    'MonedaP': x.pagoMoneda || '',
    'Monto': x.pagoMonto || '',
    'UUIDRel': str(rel['IdDocumento']) || x.uuidRelacion || '',
    'Num Operacion': x.pagoNumOperacion || '',
    'Cuenta Destino': x.pagoCtaBeneficiario || '',
    'Cuenta Origen': x.pagoCtaOrdenante || '',
    'RfcEmisorCtaDestino': x.pagoRfcCtaBen || '',
    'RfcEmisorCtaOrigen': x.pagoRfcCtaOrd || '',
    'NomBancoOrdExtranjero': x.pagoBancoOrdExt || '',
    'TipoCadPago': '', 'CadPago': '',
    'Conceptos': descrip || 'Pago',
    'Archivo XML': row.folio ? `${row.folio}.xml` : '',
    'Total': x.total || row.campos.Total || '',
  }
}

// Fila del Excel contable con el ORDEN del admin (el SAT manda la estructura:
// Verificado, Estado SAT, Version, Tipo...). Conceptos trae solo descripción,
// como en su Excel ("Honorarios Profesionales", no "1 x ... = total").
export function filaExcel(row: Registro, ep?: Map<string, PagoInfo>) {
  const x = row.xmlDatos || {}
  const pago = ep?.get(row.folio.toUpperCase())
  const ieps = (x.iepsPorTasa || {}) as Record<string, string>
  const iepsT = (t: string) => ieps[t] || ''
  const conceptos = ((x.conceptos || []) as any[]).map(c => String(c.descripcion || '')).filter(Boolean).join(' | ')
    || x.conceptosResumen || ''
  return {
    'Verificado': '',
    'Estado SAT': row.campos['Estado del Comprobante'] || '',
    'Version': x.versionCfdi || '', 'Tipo': x.clasificacion || row.clasificacion || '',
    'Fecha Emision': fechaCortaSAT(x.fecha || row.campos['Fecha de Emisión'] || ''), 'Fecha Timbrado': x.fechaTimbrado || '',
    'EstadoPago': pago?.estado || '', 'FechaPago': pago?.fecha || '',
    'Serie': x.serie || '', 'Folio': x.folioComercial || '', 'UUID': row.folio, 'UUID Relacion': x.uuidRelacion || '',
    'RFC Emisor': x.emisorRfc || row.campos['RFC Emisor'] || '', 'Nombre Emisor': x.emisorNombre || '',
    'LugarDeExpedicion': x.lugarExpedicion || '',
    'RFC Receptor': x.receptorRfc || row.campos['RFC Receptor'] || '', 'Nombre Receptor': x.receptorNombre || '',
    'ResidenciaFiscal': x.receptorResidenciaFiscal || '', 'NumRegIdTrib': x.receptorNumRegIdTrib || '',
    'UsoCFDI': x.usoCfdiDesc || x.usoCfdi || '',
    'SubTotal': x.subTotal || '', 'Descuento': x.descuento || '', 'Total IEPS': x.iepsTotal || '',
    'IVA 16%': x.iva16 || '', 'Retenido IVA': x.retIva || '', 'Retenido ISR': x.retIsr || '', 'ISH': x.ish || '',
    'Total': x.total || row.campos.Total || '',
    'Total Trasladados': x.totalTrasladados || '', 'Total Retenidos': x.totalRetenidos || '',
    'Total LocalTrasladado': x.totalLocalTrasladado || '', 'Total LocalRetenido': x.totalLocalRetenido || '',
    'Moneda': x.moneda || '', 'Tipo De Cambio': x.tipoCambio || '',
    'FormaDePago': x.formaPagoDesc || x.formaPago || '', 'Metodo de Pago': x.metodoPagoDesc || x.metodoPago || '',
    'Condiciones de Pago': x.condicionPago || '',
    'Conceptos': conceptos,
    'IEPS 3%': iepsT('3'), 'IEPS 6%': iepsT('6'), 'IEPS 7%': iepsT('7'), 'IEPS 8%': iepsT('8'), 'IEPS 9%': iepsT('9'),
    'IEPS 26.5%': iepsT('26.5'), 'IEPS 30%': iepsT('30'), 'IEPS 53%': iepsT('53'), 'IEPS 160%': iepsT('160'),
    'Archivo XML': row.folio ? `${row.folio}.xml` : '',
    'IVA 8%': x.iva8 || '', 'IEPS 30.4%': iepsT('30.4'), 'IVA Ret 6%': x.ivaRet6 || '',
    'RegimenFiscalReceptor': x.receptorRegimenFiscalDesc || x.receptorRegimenFiscal || '',
    'DomicilioFiscalReceptor': x.receptorDomicilioFiscal || '',
    'Vista': row.vista,
    'Regimen Fiscal Emisor': x.emisorRegimenFiscalDesc || x.emisorRegimenFiscal || '',
    'Exportacion': x.exportacionDesc || x.exportacion || '',
    'Estado de descarga': row.estadoDescarga,
    'XML guardado': row.xmlGuardado === 'true' ? 'Sí' : 'No', 'PDF guardado': row.pdfGuardado === 'true' ? 'Sí' : 'No',
  }
}

const num = (v: any) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0
const nf = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esPago = (row: Registro) => (row.xmlDatos?.tipoComprobante === 'P') || clasificacion(row) === 'Complemento de pago'

type MonedaResumen = { moneda: string; count: number; subtotal: number; descuento: number; trasladados: number; retenidos: number; total: number; pagos: number }
type ResumenVista = { total: number; vigentes: number; cancelados: number; pagos: number; porMoneda: MonedaResumen[]; porClasif: { clasificacion: string; count: number; total: number }[] }
// Suma sobre TODO el conjunto filtrado, sin mezclar monedas y sin añadir complementos de pago al total facturado.
export function resumir(rows: Registro[]): ResumenVista {
  const monedas = new Map<string, MonedaResumen>()
  const clases = new Map<string, { clasificacion: string; count: number; total: number }>()
  let vigentes = 0, cancelados = 0, pagos = 0
  for (const row of rows) {
    const x = row.xmlDatos || {}
    if (row.campos['Estado del Comprobante'] === 'Cancelado') cancelados++; else vigentes++
    const pago = esPago(row)
    if (pago) pagos++
    const c = clasificacion(row) || 'Sin clasificar'
    const cc = clases.get(c) || { clasificacion: c, count: 0, total: 0 }
    cc.count++; cc.total += importe(row); clases.set(c, cc)
    const m = moneda(row) || 'MXN'
    const mm = monedas.get(m) || { moneda: m, count: 0, subtotal: 0, descuento: 0, trasladados: 0, retenidos: 0, total: 0, pagos: 0 }
    if (pago) mm.pagos++
    else {
      mm.count++
      mm.subtotal += num(x.subTotal); mm.descuento += num(x.descuento)
      mm.trasladados += num(x.totalTrasladados); mm.retenidos += num(x.totalRetenidos); mm.total += importe(row)
    }
    monedas.set(m, mm)
  }
  return { total: rows.length, vigentes, cancelados, pagos, porMoneda: [...monedas.values()], porClasif: [...clases.values()].sort((a, b) => b.total - a.total) }
}

export default function CfdiPanel({ rfc, token, soloLectura = false }: { rfc: string; token: string; soloLectura?: boolean }) {
  const [periodo, setPeriodo] = useState(ultimoMesCerrado)
  const [vista, setVista] = useState<VistaUI>('emitidas')
  const [items, setItems] = useState<Registro[]>([])
  const [job, setJob] = useState<any>(null)
  const [resumen, setResumen] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [version, setVersion] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [clasif, setClasif] = useState<string[]>([])
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

  // filaExcel vive a nivel módulo (exportada para pruebas).

  // Dos alcances explícitos: mes completo (sin filtros) y filtrado (vista activa + filtros).
  // La vista Nóminas exporta su propia hoja con columna Vista para distinguir origen.
  function exportarExcel(alcance: 'mes' | 'filtrado') {
    const libro = XLSX.utils.book_new()
    const esNom = vista === 'nominas'
    const grupos: { v: string; rows: Registro[] }[] = alcance === 'mes'
      ? (['emitidas', 'recibidas'] as const).map(v => ({ v, rows: items.filter(r => r.vista === v) }))
      : esNom ? [{ v: 'nominas', rows: registros }] : [{ v: vista, rows: registros }]
    const ep = mapaEstadoPago(grupos.flatMap(g => g.rows))
    const r = resumir(grupos.flatMap(g => g.rows))
    const r2 = (n: number) => Math.round(n * 100) / 100
    const filtros = alcance === 'mes'
      ? 'Sin filtros: todas las categorías y estados'
      : [estado ? `Estado: ${estado}` : '', clasif.length ? `Categorías: ${clasif.join(', ')}` : '', busqueda ? `Búsqueda: "${busqueda}"` : ''].filter(Boolean).join(' · ') || 'Sin filtros de pantalla'
    const meta: (string | number)[][] = [
      ['CFDI Pilli'], [],
      ['RFC', rfc],
      ['Periodo', periodo],
      ['Alcance', alcance === 'mes' ? 'Mes completo · todas las vistas' : `Filtrado · ${vista === 'nominas' ? 'nóminas (emitidas+recibidas)' : vista}`],
      ['Vistas', grupos.map(g => g.v).join(', ')],
      ['Filtros aplicados', filtros],
      ['Comprobantes exportados', r.total],
      ['Vigentes', r.vigentes], ['Cancelados', r.cancelados], ['Complementos de pago (no se suman al facturado)', r.pagos],
      [],
      ['Totales por moneda (facturas, notas y nómina; complementos de pago aparte)'],
      ['Moneda', 'Comprobantes', 'SubTotal', 'Descuento', 'Trasladados', 'Retenidos', 'Total', 'Complementos de pago'],
      ...r.porMoneda.map(m => [m.moneda, m.count, r2(m.subtotal), r2(m.descuento), r2(m.trasladados), r2(m.retenidos), r2(m.total), m.pagos] as (string | number)[]),
      [],
      ['Totales por clasificación'],
      ['Clasificación', 'Comprobantes', 'Total'],
      ...r.porClasif.map(c => [c.clasificacion, c.count, r2(c.total)] as (string | number)[]),
      [],
      ['Cifras como resumen de comprobantes; no infieren deducibilidad ni impuesto a pagar.'],
      ['Generado', new Date().toLocaleString('es-MX')],
    ]
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(meta), 'Resumen')
    for (const g of grupos) {
      // Grupo homogéneo → layout del admin (pagos o nóminas); si no, factura.
      const soloPagos = g.rows.length > 0 && g.rows.every(esPago)
      const soloNomina = !soloPagos && g.rows.length > 0 && g.rows.every(esNomina)
      const filas = soloPagos ? g.rows.map(filaExcelPagos) : soloNomina ? g.rows.map(filaExcelNomina) : g.rows.map(r => filaExcel(r, ep))
      const hoja = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([['Folio Fiscal', 'Total']])
      hoja['!cols'] = Array.from({ length: Object.keys(filas[0] ?? { a: 1 }).length }, () => ({ wch: 22 }))
      XLSX.utils.book_append_sheet(libro, hoja, soloPagos ? 'Pagos' : soloNomina ? 'Nóminas'
        : g.v === 'emitidas' ? 'Emitidas' : g.v === 'recibidas' ? 'Recibidas' : 'Nóminas')
    }
    const sufijo = alcance === 'mes' ? `mes-completo-${items.length}` : `filtrado-${vista}-${registros.length}`
    XLSX.writeFile(libro, `${rfc}-${periodo}-${sufijo}.xlsx`)
  }

  function ordenarPor(campo: Orden) {
    if (orden === campo) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrden(campo); setOrdenDir(campo === 'fecha' ? 'desc' : 'asc') }
  }
  const flecha = (campo: Orden) => orden === campo ? (ordenDir === 'asc' ? ' ▲' : ' ▼') : ''

  const registros = useMemo(() => {
    const filtrados = seleccionar(items, { vista, estado, clasif, busqueda })
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
  const resumenVista = useMemo(() => resumir(registros), [registros])
  // Espejo SAT vs Pilli: lo que REPORTÓ el SAT por vista contra lo custodiado,
  // más el estado del cierre. Sin estos campos (cierres viejos) no se muestra.
  const espejo = useMemo(() => {
    if (!resumen || (resumen.estado !== 'completo' && resumen.estado !== 'parcial')) return null
    const sat = Number(resumen.satEmitidas || 0) + Number(resumen.satRecibidas || 0)
    const ok = sat > 0 && sat === items.length && resumen.estado === 'completo'
    return { sat, ok, estado: resumen.estado as string, e: resumen.satEmitidas, r: resumen.satRecibidas, at: resumen.updatedAt }
  }, [resumen, items.length])

  const umbral = 'sticky top-0 z-10 bg-white border-b border-line'

  return <section className="card overflow-hidden anim-in">
    <header className="p-5 border-b border-line flex flex-wrap justify-between gap-3">
      <div><h2 className="font-bold text-lg">Movimientos CFDI</h2><p className="text-xs text-marino/55">Del primer al último día del mes · Emitidas y Recibidas · revisión del contador</p></div>
      <div className="flex items-center gap-2 flex-wrap">
        <input aria-label="Mes de CFDI" className="input !w-auto" type="month" value={periodo} max={ultimoMesCerrado()} onChange={e => { if (e.target.value) setPeriodo(e.target.value) }} />
        {/* Lo que ves es lo que bajas: botón directo para lo filtrado, mes completo como secundario. */}
        <button
          className="btn-gold btn-sm"
          disabled={!registros.length}
          title={registros.length
            ? `Baja exactamente lo que ves: vista ${vista}, filtros y orden actuales, todas las páginas (${registros.length} de ${items.length})`
            : 'Ningún movimiento coincide con los filtros actuales'}
          onClick={() => exportarExcel('filtrado')}
        >
          Bajar filtrado ({registros.length}/{items.length})
        </button>
        <MenuBoton
          label="Excel"
          disabled={!items.length}
          titulo={!items.length ? 'No hay CFDI cargados para este periodo' : 'Otras exportaciones a Excel'}
          grupos={[{
            titulo: 'Alcance de la exportación',
            opciones: [
              {
                label: registros.length ? `Solo lo filtrado (${registros.length})` : 'Solo lo filtrado',
                desc: registros.length
                  ? `Lo mismo que el botón dorado: vista ${vista}, estado, categorías y búsqueda. Una hoja + resumen.`
                  : 'Ningún movimiento coincide con los filtros actuales.',
                onClick: () => exportarExcel('filtrado'),
                disabled: !registros.length,
              },
              {
                label: `Mes completo (${items.length})`,
                desc: 'Sin filtros: todas las categorías y estados, en hojas Emitidas y Recibidas.',
                onClick: () => exportarExcel('mes'),
              },
            ],
          }]}
        />
        {!soloLectura && <button className="btn-gold btn-sm" onClick={sincronizar} disabled={!!busy || corriendo}>{busy === 'sync' || corriendo ? <><Spinner small /> Sincronizando…</> : 'Sincronizar mes'}</button>}
      </div>
    </header>
    <div className="p-5 grid gap-3">
      {err && <Alert variant="danger">{err}</Alert>}
      {corriendo && <Alert variant="info"><Spinner small /> {job.status === 'descargando_cfdi' ? `Descargando archivos: ${job.cfdiProcesados || 0}/${job.cfdiTotal || '…'} · ${job.cfdiVista || ''}` : `Consultando el portal SAT…${Number(job?.intentoCaptcha) > 0 ? ` · captcha ${job.intentoCaptcha}/6` : ''}`}</Alert>}
      {!corriendo && job?.status === 'error' && <Alert variant="danger">Última sincronización: {job.error}</Alert>}
      {!corriendo && (job?.status === 'parcial' || resumen?.estado === 'parcial') && <Alert variant="info">Hay archivos pendientes. Los registros ya están disponibles; la siguiente sincronización reintenta solo los archivos faltantes.</Alert>}
      <div className="flex flex-wrap gap-2 items-center">
        {(['emitidas', 'recibidas'] as const).map(tipo => <button key={tipo} className={`chip ${vista === tipo ? 'bg-marino text-white border-marino' : ''}`} onClick={() => setVista(tipo)}>{tipo === 'emitidas' ? 'Emitidas' : 'Recibidas'} ({items.filter(row => row.vista === tipo).length})</button>)}
        <button className={`chip ${vista === 'nominas' ? 'bg-marino text-white border-marino' : ''}`} onClick={() => { setVista('nominas'); setClasif([]) }}>Nóminas ({items.filter(esNomina).length})</button>
        <input aria-label="Buscar CFDI" className="input flex-1 min-w-[160px]" placeholder="Buscar folio, RFC, razón social o UUID" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select aria-label="Estado del comprobante" className="input !w-auto" value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option><option>Vigente</option><option>Cancelado</option></select>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[11px] font-bold uppercase tracking-wider text-marino/45">Categorías</span>
        <button className={`chip ${!clasif.length ? 'bg-marino text-white border-marino' : ''}`} onClick={() => setClasif([])}>Todas</button>
        {[...new Set(items.map(row => clasificacion(row)).filter(Boolean))].sort().map(c => <button key={c} className={`chip ${clasif.includes(c) ? 'bg-marino text-white border-marino' : ''}`} onClick={() => setClasif(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])}>{c}</button>)}
      </div>
      {!loading && resumenVista.total > 0 && <div className="rounded-xl border border-line bg-hueso/40 p-4 grid gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
          <span className="font-bold text-marino">{resumenVista.total} {resumenVista.total === 1 ? 'movimiento' : 'movimientos'}</span>
          <span className="text-emerald-700">{resumenVista.vigentes} vigentes</span>
          <span className="text-rose-700">{resumenVista.cancelados} cancelados</span>
          {resumenVista.pagos > 0 && <span className="text-marino/60">{resumenVista.pagos} complementos de pago</span>}
          {espejo && <span className={`font-semibold ${espejo.ok ? 'text-emerald-700' : 'text-amber-700'}`} title={`SAT: ${espejo.e ?? '?'} emitidas + ${espejo.r ?? '?'} recibidas · cierre ${espejo.estado} · consultado ${espejo.at ?? ''}`}>Espejo SAT {espejo.sat > 0 ? `${espejo.sat}/` : ''}{items.length} · {espejo.estado}</span>}
          <span className="text-[11px] text-marino/45 ml-auto">Resumen de los movimientos filtrados · no infiere deducibilidad ni impuesto a pagar</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="overflow-x-auto">
            <div className="text-[11px] font-bold uppercase tracking-wider text-marino/45 mb-1">Totales por moneda</div>
            <table className="w-full text-xs text-left">
              <thead><tr className="text-marino/50"><th className="pr-3 py-1">Moneda</th><th className="pr-3 py-1 text-right">Compr.</th><th className="pr-3 py-1 text-right">SubTotal</th><th className="pr-3 py-1 text-right">Descuento</th><th className="pr-3 py-1 text-right">Trasladados</th><th className="pr-3 py-1 text-right">Retenidos</th><th className="py-1 text-right">Total</th></tr></thead>
              <tbody>{resumenVista.porMoneda.map(m => <tr key={m.moneda} className="border-t border-line/50 tabular-nums">
                <td className="pr-3 py-1 font-bold">{m.moneda}</td><td className="pr-3 py-1 text-right">{m.count}</td>
                <td className="pr-3 py-1 text-right">{nf(m.subtotal)}</td><td className="pr-3 py-1 text-right">{nf(m.descuento)}</td>
                <td className="pr-3 py-1 text-right">{nf(m.trasladados)}</td><td className="pr-3 py-1 text-right">{nf(m.retenidos)}</td>
                <td className="py-1 text-right font-bold">{nf(m.total)}</td>
              </tr>)}</tbody>
            </table>
            {resumenVista.pagos > 0 && <div className="text-[11px] text-marino/45 mt-1">Los {resumenVista.pagos} complementos de pago se cuentan aparte y no se suman al total facturado (evita doble conteo).</div>}
          </div>
          <div className="overflow-x-auto">
            <div className="text-[11px] font-bold uppercase tracking-wider text-marino/45 mb-1">Totales por clasificación</div>
            <table className="w-full text-xs text-left">
              <thead><tr className="text-marino/50"><th className="pr-3 py-1">Clasificación</th><th className="pr-3 py-1 text-right">Compr.</th><th className="py-1 text-right">Total</th></tr></thead>
              <tbody>{resumenVista.porClasif.map(c => <tr key={c.clasificacion} className="border-t border-line/50 tabular-nums">
                <td className="pr-3 py-1">{c.clasificacion}</td><td className="pr-3 py-1 text-right">{c.count}</td><td className="py-1 text-right">{nf(c.total)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>}
      {loading ? <div className="py-8 text-center"><Spinner /></div> : <>
        <div className="overflow-auto max-h-[70vh] rounded-xl border border-line">
          <table className="w-full text-sm text-left border-collapse">
            <thead><tr className="text-xs text-marino/60">
              <th className={`${umbral} p-3 whitespace-nowrap`}><button className="hover:text-marino" onClick={() => ordenarPor('fecha')}>Fecha{flecha('fecha')}</button></th>
              <th className={`${umbral} p-3 whitespace-nowrap`}>Serie-Folio</th>
              <th className={`${umbral} p-3 whitespace-nowrap`}><button className="hover:text-marino" onClick={() => ordenarPor('contraparte')}>{vista === 'emitidas' ? 'Cliente' : vista === 'recibidas' ? 'Proveedor' : 'Empleado'}{flecha('contraparte')}</button></th>
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
          <span>Mostrando {registros.length ? (pag - 1) * 25 + 1 : 0}–{Math.min(pag * 25, registros.length)} de {registros.length} · página {pag} de {paginas}</span>
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
