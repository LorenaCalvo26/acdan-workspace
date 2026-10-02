const items = [
  { text: 'SAT', highlight: true },
  { text: 'IMSS', highlight: false },
  { text: 'INFONAVIT', highlight: false },
  { text: 'Personas Físicas y Morales', highlight: false },
  { text: 'Contabilidad Electrónica', highlight: false },
  { text: 'Opinión 32-D', highlight: true },
  { text: 'Constancia de Situación Fiscal', highlight: false },
  { text: 'Declaraciones Informativas', highlight: false },
  { text: 'Nóminas y Seguridad Social', highlight: false },
  { text: 'Consultoría Empresarial', highlight: true },
]

export function Marquee() {
  const row = [...items, ...items]
  return (
    <div className="relative overflow-hidden bg-[#0F2A44] border-y border-[#C9A86A]/25 py-3.5 shadow-[0_4px_20px_-4px_rgba(15,42,68,0.3)]">
      {/* Side Fade Masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0F2A44] via-[#0F2A44]/80 to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0F2A44] via-[#0F2A44]/80 to-transparent z-10" />

      <div className="flex w-max animate-marquee gap-0">
        {[...row, ...row].map((item, i) => (
          <span
            key={`${item.text}-${i}`}
            className="flex items-center gap-6 whitespace-nowrap px-6 text-xs font-bold uppercase tracking-[0.18em]"
          >
            <span className={item.highlight ? 'text-[#C9A86A] font-extrabold' : 'text-white/85'}>
              {item.text}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#C9A86A]/70 shadow-[0_0_6px_rgba(201,168,106,0.6)]" />
          </span>
        ))}
      </div>
    </div>
  )
}
