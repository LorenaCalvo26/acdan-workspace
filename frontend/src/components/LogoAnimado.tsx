import { useEffect, useState } from 'react'

/**
 * Logo de Pilli con su animación una sola vez: vuelta completa + 2s de la
 * segunda y corte seco al frame congelado. Sin bucles ni efectos.
 */
export default function LogoAnimado({ tamano = 'w-20 h-20' }: { tamano?: string }) {
  const [fijo, setFijo] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [cargado, setCargado] = useState(false)
  useEffect(() => {
    if (fijo || !cargado) return
    const t = setTimeout(() => setFijo(true), 12000)
    return () => clearTimeout(t)
  }, [fijo, cargado])
  if (fijo) {
    return <img src="/pilli-inicio.png" alt="Pilli" className={`${tamano} mx-auto drop-shadow-lg rounded-2xl`} />
  }
  return (
    <img
      src="/pilli-animated.gif"
      alt="Pilli"
      onLoad={() => setCargado(true)}
      className={`${tamano} mx-auto drop-shadow-lg rounded-2xl object-cover`}
    />
  )
}
