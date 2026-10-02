export const brand = {
  name: 'ACDAN Consultores',
  shortName: 'ACDAN',
  subName: 'consultores',
  tagline:
    'Servicios integrales en contabilidad, fiscalidad, nóminas y consultoría, con profesionales expertos en cada materia.',
  email: 'contacto@acdanconsultores.mx',
  phone: '+52 (55) 0000 0000',
  whatsapp: '+525500000000',
  address: 'Ciudad de México, México',
  schedule: 'Lun – Vie · 9:00 a 18:00',
}

export const services = [
  {
    id: 'fiscales',
    title: 'Servicios fiscales',
    description:
      'Mantenemos tus obligaciones fiscales al día y optimizamos tu carga tributaria.',
    icon: 'landmark',
    items: [
      'Pre-cierres fiscales mensuales y anuales',
      'Determinación y pago de impuestos para personas físicas y morales',
      'Declaraciones informativas',
      'Estrategia y planeación fiscal',
      'Devolución y compensación de impuestos',
      'Actualización de obligaciones fiscales',
      'Avisos ante el RFC y actualización de socios y accionistas',
    ],
  },
  {
    id: 'contabilidad',
    title: 'Contabilidad integral',
    description:
      'Registros claros y estados financieros confiables para tomar mejores decisiones.',
    icon: 'book',
    items: [
      'Registros contables para personas físicas y morales',
      'Elaboración de estados financieros',
      'Envío de contabilidad electrónica',
      'Conciliaciones bancarias',
      'Cálculo y envío de obligaciones fiscales',
      'Reportes de flujo de efectivo (ingresos y egresos)',
      'Control de cuentas por pagar y por cobrar',
      'Cierres fiscales y contables',
    ],
  },
  {
    id: 'nominas',
    title: 'Nóminas y seguro social',
    description:
      'Administra tu plantilla laboral con nóminas exactas y trámites IMSS sin contratiempos.',
    icon: 'users',
    items: [
      'Cálculo y elaboración de nóminas',
      'Ajuste anual de sueldos y salarios',
      'Cálculo de prestaciones laborales',
      'Determinación y envío de prima de riesgo',
      'Altas y bajas patronales y salariales',
      'Reportes de plantilla laboral',
      'Solicitud de certificados ante el IMSS',
      'Trámites ante IMSS, INFONAVIT y contribuciones estatales',
    ],
  },
  {
    id: 'consultoria',
    title: 'Consultoría empresarial',
    description:
      'Acompañamos el crecimiento de tu negocio con estrategia y análisis financiero.',
    icon: 'briefcase',
    items: [
      'Creación de empresas',
      'Planeación de funciones por departamento',
      'Análisis e interpretación de estados financieros',
      'Estrategias para la toma de decisiones con socios y accionistas',
      'Propuestas de mejora fiscal, administrativa y financiera',
      'Selección de perfiles para puestos clave',
    ],
  },
]

export const about = {
  big: 'Contabilidad clara, cumplimiento al día y un trato cercano.',
  who:
    'Somos un despacho contable joven, con profesionales expertos en cada materia. La disponibilidad, calidad y excelencia nos caracterizan ante nuestros clientes.',
  mission:
    'Ofrecer servicios profesionales de calidad en cada una de nuestras áreas, brindando las mejores soluciones que ayuden a nuestros clientes a optimizar sus recursos y ser una guía a lo largo de su vida empresarial.',
  vision:
    'Ser una firma reconocida por su ética, profesionalismo y compromiso al cliente.',
  values: ['Integridad', 'Liderazgo', 'Responsabilidad', 'Empatía'],
  tech: [
    'Descarga automática de tu Constancia y tu Opinión 32-D directo del SAT',
    'Custodia tus documentos y los mantiene al día, sin que muevas un dedo',
    'Te avisa antes de cada vencimiento para que nunca pierdas un trámite',
  ],
}

export const testimonials = [
  {
    quote:
      'Todo el despacho fiscal y contable de nuestra empresa lo maneja ACDAN. Siempre disponibles y muy claros en cada cierre mensual.',
    name: 'María Fernández',
    role: 'Directora · Comercio minorista',
  },
  {
    quote:
      'Dejamos de preocuparnos por las declaraciones y avisos ante el SAT. El servicio es puntual, preventivo y muy profesional.',
    name: 'Carlos Ramírez',
    role: 'Fundador · Empresa de servicios',
  },
  {
    quote:
      'El acompañamiento en la nómina y los trámites del IMSS es impecable. Nos ahorran tiempo y riesgos todos los meses.',
    name: 'Ana Torres',
    role: 'Gerente general · Manufactura',
  },
]

export const faqs = [
  {
    question: '¿Qué documentación necesito para empezar a trabajar con ustedes?',
    answer:
      'Solo datos básicos de tu empresa o actividad: acta constitutiva o alta de actividad por internet, RFC y, en su caso, los estados de cuenta para conciliaciones. Nosotros nos encargamos del resto y te indicamos cada documento que haga falta según tu caso.',
  },
  {
    question: '¿Trabajan con personas físicas y morales?',
    answer:
      'Sí. Atendemos tanto personas físicas con actividad empresarial o profesional como personas morales, sin importar el tamaño de la operación.',
  },
  {
    question: '¿Cómo recibo mis declaraciones, avisos y documentos?',
    answer:
      'Generamos y presentamos tus obligaciones y te entregamos un reporte claro. Además, con nuestra tecnología automatizamos documentos como la Constancia de Situación Fiscal y la Opinión 32-D para que nunca pierdas un trámite.',
  },
  {
    question: '¿Manejan la confidencialidad de mi información?',
    answer:
      'Absolutamente. Toda la información que nos confías es tratada con estricta confidencialidad y sólo se utiliza para los fines del servicio contratado.',
  },
  {
    question: '¿Pueden ayudarme a constituir mi empresa desde cero?',
    answer:
      'Sí. Dentro de la consultoría empresarial te acompañamos en la creación de tu empresa, la definición de sus procesos contables y administrativos, y la estrategia fiscal inicial.',
  },
  {
    question: '¿Qué incluye el trámite ante IMSS e INFONAVIT?',
    answer:
      'Altas y bajas patronales, altas, bajas y modificaciones salariales, prima de riesgo, certificados y cualquier gestión ante IMSS, INFONAVIT y contribuciones estatales.',
  },
]

export const partners = [
  { name: 'Igly Technologies', url: 'https://igly.mx', role: 'Socio tecnológico' },
] as const

// Portal de clientes (Pilli Contable: plataforma de monitoreo fiscal).
// En la demo local apunta al dashboard de Vite. Al desplegar, cambia esta
// URL por la pública; mientras esté vacía el sitio muestra "Solicitar acceso".
export const portal = {
  nombre: 'Pilli Contable',
  url: 'https://modem-nickel-how-trains.trycloudflare.com',
}

export const sections = [
  { id: 'servicios', num: '01', label: 'Servicios' },
  { id: 'proceso', num: '02', label: 'Proceso' },
  { id: 'nosotros', num: '03', label: 'Nosotros' },
  { id: 'testimonios', num: '04', label: 'Testimonios' },
  { id: 'faq', num: '05', label: 'FAQ' },
  { id: 'contacto', num: '06', label: 'Contacto' },
] as const

export const sectionNum = (id: (typeof sections)[number]['id']) =>
  sections.find((s) => s.id === id)?.num ?? '—'

export const navLinks = sections.map((s) => ({
  href: `#${s.id}` as string,
  label: s.label,
}))