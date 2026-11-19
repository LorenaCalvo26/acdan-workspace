import { useEffect, useState } from 'react'
import { Spinner } from './ui'

/**
 * staticFiles sirve el PDF como application/octet-stream, y con ese Content-Type el
 * navegador lo descarga en vez de mostrarlo. Aqui se traen los bytes y se montan en un
 * Blob con el MIME correcto, que si pinta el visor nativo dentro del <iframe>.
 */
export default function PdfViewer({ url, nombre, className = 'h-[520px]' }: { url: string; nombre: string; className?: string }) {
  const [href, setHref] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    let objUrl = ''
    let cancelado = false
    setHref(''); setError('')

    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const buf = await r.arrayBuffer()
        // Verifica la firma antes de montar: si el backend devolviera un HTML de error
        // en vez del PDF, el visor lo mostraría como documento en blanco.
        const magic = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)))
        if (magic !== '%PDF-') throw new Error('El archivo no es un PDF válido')
        objUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
        if (!cancelado) setHref(objUrl)
      })
      .catch(e => { if (!cancelado) setError(String(e?.message || e)) })

    return () => { cancelado = true; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [url])

  if (error) {
    return (
      <div className={`${className} grid place-items-center rounded-xl border border-line bg-hueso p-6 text-center`}>
        <div>
          <div className="text-sm font-semibold text-red-700">No se pudo mostrar el PDF</div>
          <div className="text-xs text-marino/50 mt-1">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2.5">
      {!href
        ? (
          <div className={`${className} grid place-items-center rounded-xl border border-line bg-hueso`}>
            <div className="flex items-center gap-2 text-sm text-marino/50"><Spinner small /> Cargando PDF…</div>
          </div>
        )
        : (
          <>
            <iframe
              title={`Vista previa ${nombre}`}
              src={`${href}#toolbar=1&view=FitH`}
              className={`${className} w-full rounded-xl border border-line bg-white`}
            />
            <div className="flex gap-2">
              <a href={href} target="_blank" rel="noreferrer" className="btn-ghost btn-sm flex-1">Abrir en pestaña</a>
              <a href={href} download={`${nombre}.pdf`} className="btn-ghost btn-sm flex-1">Descargar</a>
            </div>
          </>
        )}
    </div>
  )
}
