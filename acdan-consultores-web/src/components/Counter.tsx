import { animate, useInView } from 'framer-motion'
import { useEffect, useRef } from 'react'

export function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, to, {
      duration: 1.4,
      ease: 'easeOut',
      onUpdate: (value) => {
        if (ref.current) ref.current.textContent = `${Math.round(value)}${suffix}`
      },
    })
    return () => controls.stop()
  }, [inView, to, suffix])

  return <span ref={ref}>0{suffix}</span>
}