import { ArrowRight, BellRing, CloudDownload, Cpu, FileCheck2, LogIn, Sparkles } from 'lucide-react'
import { about, partners, portal, sectionNum } from '../data/content'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

const techIcons = [FileCheck2, CloudDownload, BellRing] as const

const facts = [
  { label: 'Experiencia', value: 'Más de 9 años' },
  { label: 'Áreas de especialidad', value: 'Contable, fiscal, administrativa y financiera' },
  { label: 'Enfoque', value: 'Personas físicas y morales' },
  { label: 'Confianza', value: 'Clientes que nos recomiendan' },
]

const pillars = [
  { label: 'Misión', text: about.mission },
  { label: 'Visión', text: about.vision },
]

export function About() {
  return (
    <section id="nosotros" className="scroll-mt-24 bg-slate-50 py-20 sm:py-28">
      <div className="container-site">
        <SectionHeading index={sectionNum('nosotros')} eyebrow="Nosotros" title="Quiénes somos" />

        <Reveal>
          <p className="max-w-4xl font-display text-3xl font-bold leading-[1.15] tracking-tight text-navy-900 sm:text-4xl lg:text-[3.4rem] lg:leading-[1.1]">
            {about.big}{' '}
            <span className="text-gradient">
              Así de simple debe ser tu despacho.
            </span>
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-start">
          <Reveal>
            <div className="flex h-full flex-col justify-between gap-8">
              <p className="text-lg leading-relaxed text-ink-600 sm:text-xl">
                {about.who}
              </p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-navy-200/70 pt-6">
                {about.values.map((value) => (
                  <span
                    key={value}
                    className="flex items-center gap-3 font-display text-base font-bold uppercase tracking-wide text-navy-800"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                    {value}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <dl className="divide-y divide-navy-100 rounded-3xl border border-navy-100 bg-white">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex flex-col gap-1 px-7 py-5 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <dt className="text-sm font-medium text-ink-600">
                    {fact.label}
                  </dt>
                  <dd className="text-sm font-semibold text-navy-900 sm:text-right">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-navy-100 bg-navy-100 md:grid-cols-2">
          {pillars.map((pillar, i) => (
            <Reveal key={pillar.label} delay={i * 0.08}>
              <div className="h-full bg-white p-8 transition-colors duration-300 hover:bg-slate-50/60 lg:p-10">
                <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
                  {pillar.label}
                </p>
                <p className="mt-4 font-display text-xl font-semibold leading-snug text-navy-900">
                  “{pillar.text}”
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="tech-spectrum tech-ring relative isolate mt-14 rounded-3xl p-[2px]">
            <div
              aria-hidden="true"
              className="tech-spectrum tech-glow absolute -inset-10 -z-10 rounded-[3rem]"
            />
            <div className="relative overflow-hidden rounded-[1.4rem] bg-navy-900 p-8 text-white sm:p-12">
              <div aria-hidden="true" className="bg-grid-dark pointer-events-none absolute inset-0" />
              <div
                aria-hidden="true"
                className="tech-blob pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-brand-600/45 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="tech-blob pointer-events-none absolute -bottom-36 -left-24 h-80 w-80 rounded-full bg-navy-500/45 blur-3xl"
                style={{ animationDelay: '-6s' }}
              />
              <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Innovación · Monitoreo automático
                  </span>
                  <h3 className="text-gradient-tech mt-4 font-display text-2xl font-bold leading-snug sm:text-3xl">
                    Tu Opinión 32-D siempre vigente, sin mover un dedo
                  </h3>
                  <p className="mt-3 max-w-md text-navy-100/70">
                    Nuestra plataforma descarga tu Constancia y tu Opinión 32-D
                    directo del SAT, las custodia y te avisa antes de que
                    venzan. Tú solo recibes el reporte.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {portal.url ? (
                      <a
                        href={portal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-900/40 transition-colors hover:bg-brand-500"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        Acceso clientes
                      </a>
                    ) : (
                      <a
                        href="#contacto/acceso"
                        className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-900/40 transition-colors hover:bg-brand-500"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Solicitar acceso
                      </a>
                    )}
                    <a
                      href="#contacto/demo"
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-navy-100/80 backdrop-blur-sm transition-colors hover:border-brand-400/40 hover:text-white"
                    >
                      Pedir una demo
                    </a>
                  </div>
                  <a
                    href={partners[0].url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-navy-100/80 backdrop-blur-sm transition-colors hover:border-brand-400/40 hover:text-white"
                  >
                    <Cpu className="h-3.5 w-3.5 text-brand-400" />
                    Con el respaldo de {partners[0].name}
                  </a>
                </div>
                <ul className="space-y-4">
                  {about.tech.map((item, i) => {
                    const Icon = techIcons[i]
                    return (
                      <li
                        key={item}
                        className="flex items-start gap-3 border-b border-white/10 pb-4 text-sm leading-relaxed text-navy-50"
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-600/25 text-brand-300 ring-1 ring-brand-400/30">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {item}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}