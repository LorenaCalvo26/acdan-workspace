import { sectionNum } from '../data/content'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

const steps = [
  {
    step: '01',
    title: 'Diagnóstico inicial',
    text: 'Conocemos tu negocio, tu RFC y tus obligaciones. Detectamos riesgos y oportunidades a tiempo.',
  },
  {
    step: '02',
    title: 'Propuesta a tu medida',
    text: 'Diseñamos la estrategia contable y fiscal justo para tu operación. Sin letras chiquitas ni sorpresas.',
  },
  {
    step: '03',
    title: 'Nosotros nos encargamos',
    text: 'Mantenemos tus obligaciones al día y te avisamos de cada vencimiento. Tú te enfocas en crecer.',
  },
]

export function Process() {
  return (
    <section id="proceso" className="scroll-mt-24 bg-slate-50 py-20 sm:py-28">
      <div className="container-site">
        <SectionHeading
          index={sectionNum('proceso')}
          eyebrow="Proceso"
          title="Arrancamos en 3 pasos sencillos"
          description="Sin complicaciones ni burocracia. Así de simple es empezar a trabajar con nosotros."
        />

        <div className="mx-auto max-w-4xl">
          {steps.map((step, i) => (
            <Reveal key={step.step} delay={i * 0.08}>
              <div className="group flex flex-col gap-4 border-b border-navy-100 py-10 transition-colors last:border-b-0 hover:border-brand-200 sm:flex-row sm:items-start sm:gap-10 sm:py-12">
                <div className="flex items-baseline gap-4 sm:w-24 sm:justify-end sm:shrink-0">
                  <span className="font-display text-5xl font-bold text-navy-200 transition-colors duration-300 group-hover:text-brand-600 sm:text-6xl">
                    {step.step}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest text-brand-600 sm:hidden">
                    Paso {step.step}
                  </span>
                </div>
                <div className="sm:border-l sm:border-navy-100 sm:pl-10">
                  <p className="text-xs font-bold uppercase tracking-widest text-ink-400">
                    Paso {step.step}
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-bold text-navy-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-600">
                    {step.text}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="mt-14 flex justify-center">
            <a
              href="#contacto"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 to-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:brightness-105"
            >
              Agenda tu diagnóstico sin costo
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}