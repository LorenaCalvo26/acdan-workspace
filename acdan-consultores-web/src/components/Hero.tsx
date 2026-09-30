import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BadgeCheck, CalendarClock, FileCheck2, TrendingUp } from 'lucide-react'
import { brand, portal } from '../data/content'
import { Counter } from './Counter'

const stats = [
  { icon: TrendingUp, value: <Counter to={9} suffix="+" />, label: 'años de experiencia' },
  { icon: FileCheck2, value: <Counter to={4} />, label: 'áreas de especialidad' },
  { icon: BadgeCheck, value: <Counter to={100} suffix="%" />, label: 'confidencialidad' },
  { icon: CalendarClock, value: <Counter to={30} suffix="+" />, label: 'trámites y reportes al mes' },
]

const docs = [
  { label: 'Opinión 32-D', status: 'Al día', ok: true },
  { label: 'Constancia de Situación Fiscal', status: 'Descargada', ok: true },
  { label: 'Pago ISR · Mensual', status: 'Próximo: 17', ok: false },
]

export function Hero() {
  const reduceMotion = useReducedMotion()

  return (
    <section id="inicio" className="relative overflow-hidden bg-gradient-to-b from-navy-50 via-white to-white pt-28 sm:pt-32">
      <div aria-hidden="true" className="bg-grid-light pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-100 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-24 h-96 w-96 rounded-full bg-navy-100 blur-3xl"
      />

      <div className="container-site relative grid items-center gap-14 pb-24 pt-12 lg:grid-cols-2 lg:gap-12 lg:pt-16">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-white px-4 py-1.5 text-sm font-semibold text-navy-700 shadow-sm"
          >
            <span className="flex h-2 w-2 rounded-full bg-brand-600" />
            Despacho contable · Servicios integrales
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-navy-900 sm:text-5xl lg:text-[3.5rem]"
          >
            Contabilidad y fiscal sin{' '}
            <span className="text-gradient">enredos</span>, enfocados en tu
            negocio
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600"
          >
            {brand.tagline} Disponibilidad, calidad y excelencia para guiar tu
            vida empresarial.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <a
              href="#contacto"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 to-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:shadow-xl hover:shadow-brand-600/30 hover:brightness-105"
            >
              Agenda una consultoría
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#servicios"
              className="inline-flex items-center justify-center rounded-xl border border-navy-300 bg-white px-7 py-3.5 text-base font-semibold text-navy-800 transition-colors hover:border-navy-500 hover:bg-navy-50"
            >
              Ver servicios
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative mx-auto w-full max-w-lg"
        >
          <div className="absolute -right-8 -top-8 hidden h-40 w-40 rounded-full bg-gradient-to-br from-brand-100 to-navy-100 blur-2xl lg:block" />

          <div className="relative rounded-2xl border border-navy-100 bg-white p-5 shadow-xl shadow-navy-900/10">
            <div className="flex items-center justify-between border-b border-navy-100 pb-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-brand-500" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                ACDAN · Panel del cliente
              </span>
            </div>

            <div className="space-y-3 pt-4">
              {docs.map((doc) => (
                <div
                  key={doc.label}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium text-navy-900">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    {doc.label}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      doc.ok
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {doc.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-gradient-to-r from-navy-800 to-navy-700 p-4 text-white">
              <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-navy-200">
                Estado financiero <span className="text-emerald-300">Al día</span>
              </p>
              <div className="mt-3 flex items-end gap-2">
                {[40, 65, 50, 78, 60, 90, 72].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h * 0.7}px` }}
                    className={`w-4 rounded-t ${
                      i === 5 ? 'bg-brand-400' : 'bg-white/25'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="absolute -right-5 -top-5 flex h-20 w-20 rotate-6 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-600/30 sm:-right-8 sm:-top-8">
            <span className="font-display text-xl font-bold leading-none">9+</span>
            <span className="mt-0.5 text-[0.55rem] font-semibold uppercase tracking-wider">
              años
            </span>
          </div>

          <motion.div
            animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
            transition={
              reduceMotion ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
            }
            className="absolute -bottom-5 -left-5 flex items-center gap-3 rounded-2xl border border-navy-100 bg-white px-4 py-3 shadow-lg shadow-navy-900/10 sm:-left-8"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </span>
            <span className="text-xs leading-tight text-ink-600">
              <span className="block font-semibold text-navy-900">
                Sin multas ni recargos
              </span>
              cumplimiento puntual
            </span>
          </motion.div>

          <a
            href={portal.url || '#nosotros'}
            {...(portal.url ? { target: '_blank', rel: 'noreferrer' } : {})}
            className="group absolute -bottom-5 right-2 hidden items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-600 sm:right-0 md:inline-flex"
          >
            Así se ve el portal de clientes
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </motion.div>
      </div>

      <div className="container-site relative pb-4">
        <motion.dl
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-navy-100 bg-navy-100 shadow-lg shadow-navy-900/5 md:grid-cols-4"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1.5 bg-white px-6 py-7"
            >
              <stat.icon className="h-5 w-5 text-brand-600" />
              <dd className="font-display text-4xl font-bold text-navy-900">
                {stat.value}
              </dd>
              <dt className="text-center text-sm text-ink-600">{stat.label}</dt>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  )
}