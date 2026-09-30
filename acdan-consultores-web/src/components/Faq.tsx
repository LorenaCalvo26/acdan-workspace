import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { faqs, sectionNum } from '../data/content'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="scroll-mt-24 bg-slate-50 py-20 sm:py-28">
      <div className="container-site">
        <SectionHeading
          index={sectionNum('faq')}
          eyebrow="FAQ"
          title="Resolvemos tus dudas"
          description="Lo que más nos preguntan antes de empezar a trabajar juntos."
        />

        <div className="mx-auto max-w-3xl space-y-3">
          {faqs.map((faq, i) => {
            const expanded = open === i
            return (
              <Reveal key={faq.question} delay={i * 0.05}>
                <div
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    expanded
                      ? 'border-brand-600/30 bg-white shadow-md shadow-brand-600/5'
                      : 'border-navy-100 bg-white hover:border-brand-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : i)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="flex items-center gap-3 font-semibold text-navy-900">
                      <span
                        className={`font-display text-sm font-bold ${
                          expanded ? 'text-brand-600' : 'text-navy-300'
                        }`}
                      >
                        0{i + 1}
                      </span>
                      {faq.question}
                    </span>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                        expanded
                          ? 'rotate-180 bg-brand-600 text-white'
                          : 'bg-navy-50 text-navy-500'
                      }`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <p className="px-6 pb-6 pl-12 text-sm leading-relaxed text-ink-600">
                          {faq.answer}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}