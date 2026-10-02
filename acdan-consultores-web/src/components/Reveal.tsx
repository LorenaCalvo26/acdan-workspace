import type { ReactNode } from 'react'

// El efecto de aparición al scrollear se desactivó a petición del cliente:
// el contenido se muestra directo, sin fundidos ni bandas intermedias.
export function Reveal({
  children,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return <div className={className}>{children}</div>
}
