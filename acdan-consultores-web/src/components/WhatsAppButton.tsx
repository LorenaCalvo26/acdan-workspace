import { MessageCircle } from 'lucide-react'
import { brand } from '../data/content'

export function WhatsAppButton() {
  const url = `https://wa.me/${brand.whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
    'Hola, me gustaría agendar una consultoría con ACDAN Consultores.',
  )}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 transition-transform hover:scale-110"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  )
}