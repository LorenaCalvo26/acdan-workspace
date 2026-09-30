const items = [
  'SAT',
  'IMSS',
  'INFONAVIT',
  'Personas físicas y morales',
  'Contabilidad electrónica',
  'Opinión 32-D',
  'Constancia de Situación Fiscal',
  'Declaraciones informativas',
  'Nóminas',
  'Consultoría empresarial',
]

export function Marquee() {
  const row = [...items, ...items]
  return (
    <div className="overflow-hidden bg-gradient-to-r from-brand-700 via-brand-600 to-brand-700 py-4">
      <div className="flex w-max animate-marquee gap-0">
        {[...row, ...row].map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-6 whitespace-nowrap px-6 text-sm font-semibold uppercase tracking-widest text-white"
          >
            {item}
            <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
          </span>
        ))}
      </div>
    </div>
  )
}