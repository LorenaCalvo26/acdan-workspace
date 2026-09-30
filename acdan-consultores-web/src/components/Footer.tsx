import { ArrowUpRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { brand, navLinks, partners, services } from '../data/content'
import { Logo } from './Logo'

const contactInfo = [
  { icon: Phone, text: brand.phone },
  { icon: Mail, text: brand.email },
  { icon: MapPin, text: brand.address },
]

const CURRENT_YEAR = new Date().getFullYear()

export function Footer() {
  const whatsappUrl = `https://wa.me/${brand.whatsapp.replace(/[^0-9]/g, '')}`

  return (
    <footer className="relative overflow-hidden bg-navy-950 text-navy-100">
      <div aria-hidden="true" className="bg-grid-dark pointer-events-none absolute inset-0 opacity-60" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl"
      />

      <div className="container-site relative grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:py-20">
        <div>
          <div className="flex items-center gap-3">
            <Logo className="h-12 w-auto rounded-md" />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg font-bold tracking-tight text-white">
                ACDAN
              </span>
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.3em] text-brand-400">
                consultores
              </span>
            </span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-navy-200/70">
            Despacho contable con servicios integrales contables, fiscales,
            administrativos y financieros.
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <MessageCircle className="h-4 w-4" />
            Escríbenos por WhatsApp
          </a>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Navegación
          </h3>
          <ul className="mt-5 space-y-3 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-navy-200/70 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Servicios
          </h3>
          <ul className="mt-5 space-y-3 text-sm">
            {services.map((s) => (
              <li key={s.id}>
                <a
                  href="#servicios"
                  className="text-navy-200/70 transition-colors hover:text-white"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Contacto
          </h3>
          <ul className="mt-5 space-y-3 text-sm">
            {contactInfo.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-navy-200/70">
                <item.icon className="h-4 w-4 shrink-0 text-brand-400" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-site flex flex-col items-center justify-between gap-3 py-6 text-xs text-navy-200/60 sm:flex-row">
          <p>
            © {CURRENT_YEAR} {brand.name}. Todos los derechos reservados.
          </p>
          <p>
            Contabilidad · Fiscal · Nóminas · Consultoría empresarial
          </p>
        </div>
        <div className="container-site border-t border-white/5 py-5 text-center text-xs text-navy-200/50 sm:text-right">
          {partners.map((partner) => (
            <a
              key={partner.name}
              href={partner.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-brand-400"
            >
              {partner.role}:{' '}
              <span className="font-semibold text-navy-200/80">{partner.name}</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}