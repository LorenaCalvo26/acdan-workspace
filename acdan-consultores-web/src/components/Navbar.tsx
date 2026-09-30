import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { navLinks, portal, sections } from '../data/content'
import { Logo } from './Logo'

const spyIds = ['inicio', ...sections.map((s) => s.id)]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    )
    spyIds.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-navy-100/60 bg-white/90 shadow-sm backdrop-blur-md'
          : 'bg-white/0'
      }`}
    >
      <nav className="container-site flex h-20 items-center justify-between">
        <a href="#inicio" className="flex items-center gap-3" aria-label="ACDAN Consultores">
          <Logo className="h-12 w-auto rounded-md" />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-lg font-bold tracking-tight text-navy-900">
              ACDAN
            </span>
            <span className="text-[0.6rem] font-bold uppercase tracking-[0.3em] text-brand-600">
              consultores
            </span>
          </span>
        </a>

        <div className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => {
            const isActive = active === link.href.slice(1)
            return (
              <a
                key={link.href}
                href={link.href}
                className={`relative text-sm font-medium transition-colors ${
                  isActive ? 'text-brand-600' : 'text-ink-600 hover:text-brand-600'
                }`}
              >
                {link.label}
                <span
                  className={`absolute -bottom-1.5 left-0 h-0.5 rounded-full bg-brand-600 transition-all duration-300 ${
                    isActive ? 'w-full' : 'w-0'
                  }`}
                />
              </a>
            )
          })}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {portal.url ? (
            <a
              href={portal.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-900 transition-all hover:border-brand-600 hover:text-brand-700"
            >
              Portal clientes
            </a>
          ) : null}
          <a
            href="#contacto"
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-brand-700 to-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:brightness-105"
          >
            Agenda una cita
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-navy-900 lg:hidden"
          aria-label="Abrir menú"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-b border-navy-100 bg-white/95 backdrop-blur-md lg:hidden"
          >
            <div className="container-site flex flex-col gap-1 py-4">
              {navLinks.map((link) => {
            const isActive = active === link.href.slice(1)
            return (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-600 hover:bg-brand-100 hover:text-brand-700'
                }`}
              >
                {link.label}
              </a>
            )
          })}
              <a
                href="#contacto"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white"
              >
                Agenda una cita
              </a>
              {portal.url ? (
                <a
                  href={portal.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpen(false)}
                  className="mt-2 inline-flex items-center justify-center rounded-lg border border-navy-200 px-5 py-3 text-sm font-semibold text-navy-900"
                >
                  Portal clientes
                </a>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}