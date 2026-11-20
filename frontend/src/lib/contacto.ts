/** Datos de contacto de ACDAN, un solo lugar para todo el portal. */
export const CONTACTO = {
  email: 'lcalvo@acdanconsultores.com.mx',
  telefonoVisible: '+52 56 1110 1780',
  // Para wa.me va solo dígitos, con lada del país y sin el 1 de celular.
  whatsapp: '525611101780',
  nombre: 'ACDAN Consultores',
}

export const waLink = (texto = '') =>
  `https://wa.me/${CONTACTO.whatsapp}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
