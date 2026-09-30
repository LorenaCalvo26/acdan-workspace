import { ArrowRight, BellRing, CloudDownload, Cpu, FileCheck2, LogIn } from 'lucide-react'
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

        <div>
          <div className="tech-spectrum tech-ring relative isolate mt-14 rounded-3xl p-[2px]">
            <div
              aria-hidden="true"
              className="tech-spectrum tech-glow absolute -inset-8 -z-10 rounded-[3rem]"
            />
            <div className="relative overflow-hidden rounded-[1.4rem] bg-[#FAF7F2] p-8 shadow-lg shadow-[#0F2A44]/5 ring-1 ring-[#C9A86A]/25 sm:p-12">
              <div aria-hidden="true" className="bg-grid-light pointer-events-none absolute inset-0" />
              <div
                aria-hidden="true"
                className="tech-blob pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-[#C9A86A]/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="tech-blob pointer-events-none absolute -bottom-36 -left-24 h-80 w-80 rounded-full bg-[#C9A86A]/15 blur-3xl"
                style={{ animationDelay: '-6s' }}
              />
              <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
                <div>
                  <div className="flex items-center gap-4">
                    <img
                      src="/Pilli-logo.svg"
                      alt="Pilli"
                      className="h-20 w-20 rounded-2xl bg-white p-1 shadow-md shadow-[#0F2A44]/10 ring-1 ring-[#0F2A44]/10"
                    />
                    <p className="font-pilli text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
                      <span className="text-[#0F2A44]">Pilli</span>{' '}
                      <span className="text-[#C9A86A]">Contable</span>
                    </p>
                  </div>
                  <h3 className="mt-4 font-display text-2xl font-bold leading-snug text-[#0F2A44] sm:text-3xl">
                    Tu Opinión 32-D siempre vigente, sin mover un dedo
                  </h3>
                  <p className="mt-3 max-w-md text-[#0F2A44]/70">
                    <span className="font-semibold text-[#0F2A44]">Pilli</span>, nuestra plataforma,
                    descarga tu Constancia y tu Opinión 32-D directo del SAT,
                    las custodia y te avisa antes de que venzan. Tú solo
                    recibes el reporte.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {portal.url ? (
                      <a
                        href={portal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-[#C9A86A] px-5 py-2.5 font-pilli text-sm font-bold text-[#0F2A44] shadow-md shadow-[#C9A86A]/30 transition-all hover:brightness-105"
                      >
                        <LogIn className="h-4 w-4" />
                        Acceso clientes
                      </a>
                    ) : (
                      <a
                        href="#contacto/acceso"
                        className="inline-flex items-center gap-2 rounded-full bg-[#C9A86A] px-5 py-2.5 font-pilli text-sm font-bold text-[#0F2A44] shadow-md shadow-[#C9A86A]/30 transition-all hover:brightness-105"
                      >
                        <ArrowRight className="h-4 w-4" />
                        Solicitar acceso
                      </a>
                    )}
                    <a
                      href="#contacto/demo"
                      className="inline-flex items-center gap-2 rounded-full border border-[#0F2A44]/20 bg-white px-4 py-2 font-pilli text-sm font-bold text-[#0F2A44] transition-colors hover:border-[#C9A86A] hover:text-[#0F2A44]"
                    >
                      Pedir una demo
                    </a>
                  </div>
                  <a
                    href={partners[0].url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#0F2A44]/15 bg-white px-4 py-2 text-xs font-semibold text-[#0F2A44]/70 transition-colors hover:border-[#C9A86A] hover:text-[#0F2A44]"
                  >
                    <Cpu className="h-3.5 w-3.5 text-[#C9A86A]" />
                    Con el respaldo de {partners[0].name}
                  </a>
                </div>
                <ul className="space-y-4">
                  {about.tech.map((item, i) => {
                    const Icon = techIcons[i]
                    return (
                      <li
                        key={item}
                        className="flex items-start gap-3 border-b border-[#0F2A44]/10 pb-4 text-sm leading-relaxed text-[#0F2A44]/80"
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#C9A86A]/15 text-[#0F2A44] ring-1 ring-[#C9A86A]/50">
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
        </div>
      </div>
    </section>
  )
}