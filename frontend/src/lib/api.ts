export const API = import.meta.env.VITE_API_URL || 'http://localhost:8090/api/v1'

export type Cliente = {
  rfc: string
  nombre: string
  email: string
  tipos: string
  frecuenciaDias: string
  tieneCiec: string
  proximoRun: string
  status?: string
  cfdiMensual?: string
  cfdiDesde?: string
}

export type Doc = {
  docId: string
  rfc: string
  tipo: string
  s3Key: string
  campos: string
  createdAt: string
}

export type Campos = Record<string, string>

export type Resumen = {
  rfc: string
  sentido: string
  estado: 'sin-correr' | 'vigente' | 'por-vencer' | 'vencido' | 'sin-fecha'
  folio: string
  fecha32d: string
  diasRestantes: number | null
  docId: string
}

export type Stats = {
  clientes: number
  conCredencial: number
  docs: number
  docs32d: number
  docsConstancia: number
  positivos: number
  negativos: number
  porVencer: number
  jobsHoy: number
  jobsOk: number
  jobsError: number
  ultimoJob: string
}

/** Los PDFs se sirven con staticFiles en /pdfs y se nombran {docId}.pdf */
export const pdfUrl = (rfc: string, docId: string) =>
  `${API.replace(/\/api\/v1$/, '')}/pdfs/${rfc}/${docId}.pdf`

export async function api(path: string, opts: RequestInit = {}) {
  let r: Response
  // El JWT también viaja en Authorization para cuando el backend lo lea de headers.
  let bearer: Record<string, string> = {}
  try {
    const raw = localStorage.getItem('acdan-session')
    const jwt = raw && (JSON.parse(raw) as any)?.jwt
    if (jwt) bearer = { Authorization: `Bearer ${jwt}` }
  } catch { /* sin sesión */ }
  const { headers: optHeaders, ...rest } = opts
  try {
    r = await fetch(`${API}${path}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...bearer, ...((optHeaders as Record<string, string>) || {}) }
    })
    // El text() va DENTRO del try: si la conexión se corta a media respuesta,
    // antes lanzaba una excepción fuera de control y la UI se quedaba colgada.
    const text = await r.text()
    try { return JSON.parse(text) } catch { return { raw: text, status: r.status } }
  } catch (e: any) {
    return { error: 'SIN_CONEXION', detail: `No llegué al backend ${API}${path}. ¿Está corriendo? (${e?.message || e})` }
  }
}

export function parseCampos(doc: Doc | { campos?: string } | null | undefined): Campos {
  if (!doc) return {}
  const c = typeof doc.campos === 'string' ? doc.campos : JSON.stringify(doc.campos)
  if (!c) return {}
  try { return JSON.parse(c) } catch { return {} }
}

/**
 * El backend devuelve el listado como objeto paginado `{items:[...]}`.
 * Normaliza a arreglo para que la UI no se quede vacía por un cambio de forma.
 */
export function asItems<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res as T[]
  if (Array.isArray(res?.items)) return res.items as T[]
  if (Array.isArray(res?.clientes)) return res.clientes as T[]
  return []
}

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre']
const MES_IDX: Record<string, number> = Object.fromEntries(MES.map((m, i) => [m, i]))
MES_IDX['sep'] = 8
MES_IDX['oct'] = 9
MES_IDX['dic'] = 11

/** "29 de septiembre de 2026 a las 23:07" -> Date local */
export function parseFechaES(s: string): Date | null {
  const m = /(\d{1,2})\s*de\s*([a-záéíóúñ]+)\s*de\s*(\d{4})/i.exec(s || '')
  if (!m) return null
  const dia = Number(m[1])
  const mes = MES_IDX[m[2].toLowerCase()]
  const anio = Number(m[3])
  if (Number.isNaN(dia) || mes === undefined) return null
  return new Date(anio, mes, dia)
}

export function fechaCorta(s: string): string {
  const d = parseFechaES(s)
  if (d) return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  if (s) return s.slice(0, 22)
  return '—'
}

export function haceRato(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.round(hrs / 24)} d`
}

export const TIPO_LABEL: Record<string, string> = {
  '32d': 'Opinión 32-D',
  constancia: 'Constancia'
}

export type EstadoDoc = { label: string; cls: string; dot: string }

export function estadoDe(s: { sentido?: string; estado?: string; diasRestantes?: number | null }): EstadoDoc {
  const est = s.estado || 'sin-correr'
  if (est === 'sin-correr') return { label: 'Sin correr', cls: 'bg-marino/8 text-marino/60', dot: 'bg-marino/30' }
  if (est === 'vencido') return { label: 'Vencido', cls: 'bg-red-100 text-red-800', dot: 'bg-red-500' }
  if (est === 'por-vencer') return { label: 'Por vencer', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' }
  if (est === 'sin-fecha') return { label: 'Dictamen sin fecha', cls: 'bg-marino/8 text-marino/60', dot: 'bg-marino/30' }
  const neg = s.sentido === 'negativo'
  return neg
    ? { label: 'Negativa', cls: 'bg-red-100 text-red-800', dot: 'bg-red-500' }
    : { label: 'Positiva', cls: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' }
}
