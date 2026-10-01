import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Clock, Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { brand, sectionNum, services } from '../data/content'
import { CustomSelect } from './CustomSelect'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'

type FieldName = keyof FormValues

interface FormValues {
  nombre: string
  email: string
  telefono: string
  rfc: string
  interes: string
  mensaje: string
}

type FormErrors = Partial<Record<FieldName, string>>
type Touched = Partial<Record<FieldName, boolean>>

const emptyValues: FormValues = {
  nombre: '',
  email: '',
  telefono: '',
  rfc: '',
  interes: '',
  mensaje: '',
}

const validators: Record<FieldName, (value: string) => string | null> = {
  nombre: (value) => {
    if (!value.trim()) return 'No dimos con tu nombre. Cuéntanos con quién hablamos para personalizar la respuesta.'
    if (!/^[a-zA-ZÁÉÍÓÚÑÜáéíóúñü\s.'-]{3,}$/.test(value.trim()))
      return 'Ese parece alias de cancha. Tu nombre completo nos ayuda a conocerte mejor.'
    return null
  },
  email: (value) => {
    if (!value.trim()) return 'Falta el lugar donde te responderemos: tu correo.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()))
      return 'Algo no cuadra en ese correo. Busca el formato usual: nombre@dominio.com'
    return null
  },
  telefono: (value) => {
    if (!value.trim()) return null
    const digits = value.replace(/[\s\-()]/g, '')
    if (!/^\+?\d{10,13}$/.test(digits))
      return 'Revisa el número: un teléfono mexicano tiene 10 dígitos (con o sin lada).'
    return null
  },
  rfc: (value) => {
    if (!value.trim()) return null
    const clean = value.toUpperCase().replace(/[\s-]/g, '')
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}$/.test(clean))
      return 'Ese RFC no pasó el filtro. Son 12 o 13 caracteres, ej. GARC880101ABC'
    return null
  },
  interes: () => null,
  mensaje: (value) => {
    if (!value.trim()) return 'Parece que el mensaje se quedó en el tintero. Escríbenos tu caso en unas líneas.'
    if (value.trim().length < 20)
      return 'Con tan poquito aún no alcanzamos a ayudarte. Danos el contexto: qué necesitas y en qué plazo.'
    return null
  },
}

const contactItems = [
  { icon: Mail, label: 'Correo', value: brand.email, href: null },
  { icon: Phone, label: 'Teléfono', value: brand.phone, href: `tel:${brand.phone.replace(/[^0-9]/g, '')}` },
  { icon: MessageCircle, label: 'WhatsApp', value: brand.whatsapp, href: `https://wa.me/${brand.whatsapp.replace(/[^0-9]/g, '')}` },
  { icon: MapPin, label: 'Ubicación', value: brand.address },
  { icon: Clock, label: 'Horario', value: brand.schedule },
]

function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.p
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="mt-2 flex items-start gap-1.5 text-sm leading-snug text-brand-600"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </motion.p>
      ) : null}
    </AnimatePresence>
  )
}

function Label({
  name,
  children,
  optional = false,
}: {
  name: string
  children: ReactNode
  optional?: boolean
}) {
  return (
    <label
      htmlFor={`campo-${name}`}
      className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-navy-900"
    >
      {children}
      {optional ? (
        <span className="px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-400">
          Opcional
        </span>
      ) : (
        <span aria-hidden="true" className="text-brand-600">
          *
        </span>
      )}
    </label>
  )
}

function baseFieldClass(valid: boolean | null) {
  if (valid === false) return 'border-brand-400 focus:border-brand-600'
  if (valid === true) return 'border-green-300 focus:border-green-500'
  return 'border-navy-200 focus:border-brand-600'
}

export function Contact() {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Touched>({})
  const [sent, setSent] = useState(false)

  // Las CTAs de la plataforma ("Solicitar acceso" / "Pedir una demo") llegan
  // como #contacto/acceso o #contacto/demo: preseleccionan el motivo para que
  // el aviso que recibe el admin ya venga etiquetado y pueda dar de alta al
  // usuario en la plataforma.
  useEffect(() => {
    function presetDesdeHash() {
      const h = window.location.hash
      const motivo =
        h === '#contacto/acceso' ? 'Acceso a la plataforma'
        : h === '#contacto/demo' ? 'Demo del monitoreo'
        : null
      if (motivo) {
        document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' })
        setValues((prev) => (prev.interes ? prev : { ...prev, interes: motivo }))
      }
    }
    presetDesdeHash()
    window.addEventListener('hashchange', presetDesdeHash)
    return () => window.removeEventListener('hashchange', presetDesdeHash)
  }, [])

  function fieldState(field: FieldName): boolean | null {
    if (!touched[field]) return null
    if (!values[field].trim()) return null
    return !errors[field]
  }

  function handleChange(field: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (touched[field]) {
      setErrors((prev) => ({ ...prev, [field]: validators[field](value) }))
    }
  }

  function handleBlur(field: FieldName) {
    setTouched((prev) => ({ ...prev, [field]: true }))
    setErrors((prev) => ({ ...prev, [field]: validators[field](values[field]) }))
  }

  async function submitLead(payload: FormValues) {
    const apiUrl = import.meta.env.VITE_API_URL || ''
    try {
      await fetch(`${apiUrl}/api/v1/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: payload.nombre,
          email: payload.email,
          telefono: payload.telefono || null,
          rfc: payload.rfc || null,
          interes: payload.interes || null,
          mensaje: payload.mensaje,
        }),
      })
    } catch (err) {
      console.error('Error enviando contacto a la API:', err)
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const nextErrors: FormErrors = {}
    for (const field of Object.keys(validators) as FieldName[]) {
      const error = validators[field](values[field])
      if (error) nextErrors[field] = error
    }
    setTouched({
      nombre: true,
      email: true,
      telefono: true,
      rfc: true,
      interes: true,
      mensaje: true,
    })
    setErrors(nextErrors)

    const firstInvalid = (Object.keys(nextErrors) as FieldName[]).find(
      (field) => nextErrors[field],
    )
    if (firstInvalid) {
      document.getElementById(`campo-${firstInvalid}`)?.focus()
      return
    }
    submitLead(values)
    setSent(true)
  }

  return (
    <section id="contacto" className="scroll-mt-24 bg-white py-20 sm:py-28">
      <div className="container-site">
        <SectionHeading
          index={sectionNum('contacto')}
          eyebrow="Contacto"
          title="Agenda una cita con nosotros"
          description="Cuéntanos tu caso y te contactamos para diseñar la mejor estrategia contable y fiscal para tu negocio."
        />

        <div className="grid gap-10 lg:grid-cols-5 lg:gap-12">
          <Reveal className="lg:col-span-2">
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-navy-900 bg-gradient-to-br from-navy-900 via-navy-800 to-brand-900 p-8 text-white">
              <div aria-hidden="true" className="bg-grid-dark pointer-events-none absolute inset-0" />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-600/30 blur-3xl"
              />
              <div className="relative">
                <h3 className="font-display text-2xl font-bold">¿Hablamos?</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-100/80">
                  Cuéntanos tu caso y te contactamos para diseñar la mejor
                  estrategia contable y fiscal para tu negocio.
                </p>
                <div className="mt-8 space-y-3">
                  {contactItems.map((item) => {
                    const content = (
                      <span className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm transition-colors hover:bg-white/10">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/90">
                          <item.icon className="h-5 w-5" />
                        </span>
                        <span className="flex flex-col">
                          <span className="text-xs uppercase tracking-wider text-navy-200/70">
                            {item.label}
                          </span>
                          <span className="text-sm font-semibold">
                            {item.value}
                          </span>
                        </span>
                      </span>
                    )
                    return item.href ? (
                      <a key={item.label} href={item.href} className="block">
                        {content}
                      </a>
                    ) : (
                      <div key={item.label}>{content}</div>
                    )
                  })}
                </div>
              </div>
              <p className="relative mt-8 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-relaxed text-navy-100/80">
                Respuesta rápida en horario laboral.{' '}
                <span className="font-semibold text-white">
                  Somos tu guía en contabilidad y finanzas.
                </span>
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-3">
            <form
              onSubmit={handleSubmit}
              noValidate
              className="rounded-3xl border border-navy-100 bg-slate-50 p-7 sm:p-9"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="block">
                  <Label name="nombre">Nombre completo</Label>
                  <div className="relative">
                    <input
                      id="campo-nombre"
                      name="nombre"
                      value={values.nombre}
                      onChange={(e) => handleChange('nombre', e.target.value)}
                      onBlur={() => handleBlur('nombre')}
                      aria-invalid={touched.nombre && !!errors.nombre}
                      className={`w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-colors ${baseFieldClass(fieldState('nombre'))}`}
                      placeholder="Tu nombre"
                    />
                    <FieldStatus valid={fieldState('nombre')} />
                  </div>
                  <FieldError message={errors.nombre} />
                </div>

                <div className="block">
                  <Label name="email">Correo electrónico</Label>
                  <div className="relative">
                    <input
                      id="campo-email"
                      name="email"
                      value={values.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      onBlur={() => handleBlur('email')}
                      aria-invalid={touched.email && !!errors.email}
                      className={`w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-colors ${baseFieldClass(fieldState('email'))}`}
                      placeholder="nombre@dominio.com"
                    />
                    <FieldStatus valid={fieldState('email')} />
                  </div>
                  <FieldError message={errors.email} />
                </div>

                <div className="block">
                  <Label name="telefono" optional>
                    Teléfono
                  </Label>
                  <div className="relative">
                    <input
                      id="campo-telefono"
                      name="telefono"
                      value={values.telefono}
                      onChange={(e) => handleChange('telefono', e.target.value)}
                      onBlur={() => handleBlur('telefono')}
                      aria-invalid={touched.telefono && !!errors.telefono}
                      className={`w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-colors ${baseFieldClass(fieldState('telefono'))}`}
                      placeholder="00 0000 0000"
                    />
                    <FieldStatus valid={fieldState('telefono')} />
                  </div>
                  <FieldError message={errors.telefono} />
                </div>

                <div className="block">
                  <Label name="rfc" optional>
                    RFC
                  </Label>
                  <div className="relative">
                    <input
                      id="campo-rfc"
                      name="rfc"
                      value={values.rfc}
                      onChange={(e) => handleChange('rfc', e.target.value.toUpperCase())}
                      onBlur={() => handleBlur('rfc')}
                      aria-invalid={touched.rfc && !!errors.rfc}
                      className={`w-full rounded-xl border bg-white px-4 py-3 text-sm uppercase outline-none transition-colors ${baseFieldClass(fieldState('rfc'))}`}
                      placeholder="GARC880101ABC"
                    />
                    <FieldStatus valid={fieldState('rfc')} />
                  </div>
                  <FieldError message={errors.rfc} />
                </div>

                <div className="sm:col-span-2">
                  <Label name="interes" optional>
                    ¿En qué te ayudamos?
                  </Label>
                  <CustomSelect
                    id="campo-interes"
                    name="interes"
                    value={values.interes}
                    placeholder="Selecciona un servicio"
                    options={[
                      { value: 'Acceso a la plataforma', label: 'Quiero acceso a la plataforma' },
                      { value: 'Demo del monitoreo', label: 'Quiero una demo del monitoreo' },
                      ...services.map((s) => ({ value: s.title, label: s.title })),
                      { value: 'Otro', label: 'Otro' },
                    ]}
                    onChange={(value) => handleChange('interes', value)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label name="mensaje">Mensaje</Label>
                  <div className="relative">
                    <textarea
                      id="campo-mensaje"
                      name="mensaje"
                      rows={4}
                      value={values.mensaje}
                      onChange={(e) => handleChange('mensaje', e.target.value)}
                      onBlur={() => handleBlur('mensaje')}
                      aria-invalid={touched.mensaje && !!errors.mensaje}
                      className={`w-full resize-y rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-colors ${baseFieldClass(fieldState('mensaje'))}`}
                      placeholder="Cuéntanos brevemente tu caso y qué necesitas..."
                    />
                    <FieldStatus valid={fieldState('mensaje')} />
                  </div>
                  <FieldError message={errors.mensaje} />
                </div>
              </div>

              <AnimatePresence>
                {sent ? (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mt-6 flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Listo, tu mensaje va en camino. Te respondemos a la
                      brevedad; si el correo no se abrió, escríbenos a{' '}
                      {brand.email}.
                    </span>
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <div className="mt-7 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 to-brand-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:brightness-105 sm:w-auto"
                >
                  <Send className="h-4 w-4" />
                  Enviar mensaje
                </button>
                <p className="text-xs text-ink-500">
                  <span className="font-semibold text-brand-600">*</span> Campos
                  obligatorios
                </p>
              </div>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function FieldStatus({ valid }: { valid: boolean | null }) {
  return (
    <AnimatePresence>
      {valid ? (
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-green-500"
          aria-hidden="true"
        >
          <CheckCircle2 className="h-5 w-5" />
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}