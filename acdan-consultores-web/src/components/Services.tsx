import { ArrowUpRight } from 'lucide-react'
import { sectionNum, services } from '../data/content'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

export function Services() {
  return (
    <section id="servicios" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <div className="container-site">
        <SectionHeading
          index={sectionNum('servicios')}
          eyebrow="Servicios"
          title="Lo que hacemos por tu negocio"
          description="Cuatro áreas de especialidad que cubren toda la vida contable, fiscal y laboral de tu negocio."
        />

        <div className="grid gap-px overflow-hidden rounded-3xl border border-navy-100 bg-navy-100 md:grid-cols-2">
          {services.map((service, i) => (
            <Reveal key={service.id} delay={i * 0.07}>
              <article className="group flex h-full flex-col bg-white p-8 transition-colors duration-300 hover:bg-slate-50/60 lg:p-10">
                <div className="flex items-start justify-between">
                  <span className="font-display text-sm font-bold tracking-widest text-brand-600">
                    0{i + 1}
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-navy-300 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </div>

                <h3 className="mt-4 font-display text-2xl font-bold leading-tight text-navy-900 lg:text-[1.7rem]">
                  {service.title}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-600">
                  {service.description}
                </p>

                <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  {service.items.length} servicios incluidos
                </p>

                <ul className="mt-6 grid gap-x-6 gap-y-2 border-t border-navy-100 pt-6 sm:grid-cols-2">
                  {service.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-600"
                    >
                      <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-brand-600/60" />
                      {item}
                    </li>
                  ))}
                </ul>

                <a
                  href="#contacto"
                  className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-navy-900 transition-colors hover:text-brand-600"
                >
                  Agendar asesoría
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}