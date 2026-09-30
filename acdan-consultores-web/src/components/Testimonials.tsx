import { Quote, Star } from 'lucide-react'
import { sectionNum, testimonials } from '../data/content'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

const avatars = [
  'from-brand-600 to-brand-400',
  'from-navy-700 to-navy-500',
  'from-brand-500 to-brand-300',
]

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
}

export function Testimonials() {
  return (
    <section id="testimonios" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <div className="container-site">
        <SectionHeading
          index={sectionNum('testimonios')}
          eyebrow="Testimonios"
          title="La confianza de nuestros clientes"
          description="Historias de empresas que ya confían en nosotros y avanza con orden su contabilidad y fiscalidad."
        />

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <figure className="relative flex h-full flex-col rounded-2xl border border-navy-100 bg-slate-50 p-7 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-navy-900/5">
                <Quote
                  aria-hidden="true"
                  className="absolute right-6 top-6 h-9 w-9 text-brand-200"
                />
                <div className="flex gap-0.5" aria-label="5 de 5 estrellas">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star
                      key={s}
                      className="h-4 w-4 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-[0.95rem] leading-relaxed text-ink-600">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-navy-100 pt-5">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${avatars[i]} font-display text-sm font-bold text-white`}
                  >
                    {initials(t.name)}
                  </span>
                  <span>
                    <p className="font-semibold text-navy-900">{t.name}</p>
                    <p className="text-sm text-ink-400">{t.role}</p>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}