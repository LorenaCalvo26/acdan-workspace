import { useEffect, useState } from 'react'

/**
 * Logo de Pilli con su animación una sola vez: vuelta completa del gif y
 * freeze a los ~2s de la segunda vuelta. Sin bucles; respeta movimiento
 * reducido (frame fijo directo).
 */
export default function LogoAnimado({ tamano = 'w-20 h-20' }: { tamano?: string }) {
  const [fase, setFase] = useState<'gif' | 'cierre' | 'fijo'>(() =>
    typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'gif' : 'fijo'
  )
  const [cargado, setCargado] = useState(false)
  useEffect(() => {
    if (fase !== 'gif' || !cargado) return
    const sale = setTimeout(() => setFase('cierre'), 7000)
    const fija = setTimeout(() => setFase('fijo'), 7400)
    return () => { clearTimeout(sale); clearTimeout(fija) }
  }, [fase, cargado])
  if (fase === 'fijo') {
    return <img src="/pilli-inicio.png" alt="Pilli" className={`${tamano} mx-auto drop-shadow-lg rounded-2xl`} />
  }
  return (
    <div className={`relative ${tamano} mx-auto`}>
      {fase === 'cierre' && (
        <img src="/pilli-inicio.png" alt="" aria-hidden="true" className={`absolute inset-0 ${tamano} drop-shadow-lg rounded-2xl animate-[fadeUp_0.4s_ease-out_both]`} />
      )}
      <img
        src="/pilli-animated.gif"
        alt="Pilli"
        onLoad={() => setCargado(true)}
        className={`absolute inset-0 ${tamano} drop-shadow-lg rounded-2xl object-cover transition-opacity duration-500 ${fase === 'cierre' ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  )
}
