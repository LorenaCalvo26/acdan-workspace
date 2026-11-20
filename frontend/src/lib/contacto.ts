/** Datos de contacto de ACDAN, un solo lugar para todo el portal. */
export const CONTACTO = {
  email: 'lcalvo@acdanconsultores.com.mx',
  telefonoVisible: '+52 1 56 1110 1780',
  // Para wa.me va solo dígitos: 52 + 1 + número (así lo reconoce WhatsApp en México).
  whatsapp: '5215611101780',
  nombre: 'ACDAN Consultores',
}

export const waLink = (texto = '') =>
  `https://wa.me/${CONTACTO.whatsapp}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
