import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

const ease = [0.16, 1, 0.3, 1] as const

function Fade({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0 }}
      whileInView={reduceMotion ? undefined : { opacity: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
}: {
  index: string
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-12 sm:mb-16">
      <div className="grid gap-6 border-t border-navy-100 pt-8 lg:grid-cols-12 lg:items-end lg:gap-10">
        <Fade className="lg:col-span-4">
          <span className="font-display text-5xl font-bold leading-none text-navy-900/10 lg:text-6xl">
            {index}
          </span>
        </Fade>
        <div className="lg:col-span-8">
          <Fade delay={0.05}>
            <p className="mb-3 flex items-center gap-3 text-sm font-bold uppercase tracking-[0.25em] text-brand-600">
              {eyebrow}
              <span className="h-px w-10 bg-brand-600/40" />
            </p>
          </Fade>
          <Fade delay={0.1}>
            <h2 className="font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.1]">
              {title}
            </h2>
          </Fade>
          {description ? (
            <Fade delay={0.18}>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg">
                {description}
              </p>
            </Fade>
          ) : null}
        </div>
      </div>
    </div>
  )
}