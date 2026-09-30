import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  id: string
  name: string
  value: string
  placeholder: string
  options: Option[]
  onChange: (value: string) => void
}

export function CustomSelect({
  id,
  name,
  value,
  placeholder,
  options,
  onChange,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef(new Array<HTMLButtonElement | null>())

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  useEffect(() => {
    if (open) {
      optionRefs.current[activeIdx]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx, open])

  function openList() {
    const idx = options.findIndex((o) => o.value === value)
    setActiveIdx(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  function selectOption(option: Option) {
    onChange(option.value)
    setOpen(false)
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % options.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + options.length) % options.length)
        break
      case 'Home':
        e.preventDefault()
        setActiveIdx(0)
        break
      case 'End':
        e.preventDefault()
        setActiveIdx(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (options[activeIdx]) selectOption(options[activeIdx])
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        name={name}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-4 rounded-xl border bg-white px-4 py-3 text-sm transition-colors ${
          open
            ? 'border-brand-600'
            : 'border-navy-200 hover:border-navy-300 focus:border-brand-600'
        }`}
      >
        <span
          className={`truncate text-left ${value ? 'text-ink-900' : 'text-ink-400'}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="shrink-0 text-ink-500"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            id={`${id}-listbox`}
            role="listbox"
            aria-label="Selecciona un servicio"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-60 overflow-y-auto rounded-xl border border-navy-100 bg-white py-1 shadow-xl shadow-navy-900/10"
          >
            {options.map((opt, i) => (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  ref={(el) => {
                    optionRefs.current[i] = el
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectOption(opt)
                  }}
                  onClick={() => selectOption(opt)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                    i === activeIdx
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-700 hover:bg-slate-50'
                  } ${opt.value === value ? 'font-semibold' : ''}`}
                >
                  {opt.label}
                  {opt.value === value ? (
                    <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}