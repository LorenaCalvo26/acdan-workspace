import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import LogoAnimado from '../components/LogoAnimado'

const PASOS = [
  {
    n: '1',
    titulo: 'Te registran una vez',
    texto: 'Tu contador da de alta tu RFC y guarda tu Contraseña SAT cifrada. Tú no haces nada más.'
  },
  {
    n: '2',
    titulo: 'Pilli descarga todo',
    texto: 'Tu Opinión 32-D y tu Constancia llegan directo del SAT y quedan custodiadas.'
  },
  {
    n: '3',
    titulo: 'Siempre vigente',
    texto: 'Cada vencimiento se vigila y se te avisa antes de que sea tarde. Tú solo revisas tu estatus.'
  }
]

const DOCUMENTOS = [
  { nombre: 'Opinión 32-D', desc: 'Cumplimiento de obligaciones fiscales, renovada cada 30 días.' },
  { nombre: 'Constancia de Situación Fiscal', desc: 'Tus datos fiscales siempre a la mano.' }
]

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      <div className="w-full max-w-3xl mx-auto px-6 flex justify-end pt-5">
        {user ? (
          <Link to="/resumen" className="text-xs font-semibold text-marino/55 hover:text-marino transition-colors">
            Ir a mi panel →
          </Link>
        ) : (
          <Link to="/login" className="text-xs font-semibold text-marino/55 hover:text-marino transition-colors">
            Iniciar sesión →
          </Link>
        )}
      </div>
      <main className="flex-1 w-full max-w-3xl mx-auto px-6">
        <section className="pt-8 sm:pt-12 pb-10 text-center anim-in">
          <LogoAnimado tamano="w-24 h-24 sm:w-28 sm:h-28" />
          <h1 className="font-pilli font-extrabold tracking-tight mt-5 text-5xl sm:text-6xl leading-none">
            pilli <span className="text-dorado">Contable</span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-marino/45 mt-3">
            Tu situación fiscal en orden
          </p>
          <p className="text-marino/60 mt-5 text-lg leading-relaxed max-w-xl mx-auto">
            Descarga tu Opinión 32-D y tu Constancia directo del SAT,
            las custodia y te avisa antes de cada vencimiento.
          </p>
          <div className="mt-7">
            {user ? (
              <Link to="/resumen" className="btn-gold text-base px-8 py-3.5">Ir a mi panel</Link>
            ) : (
              <Link to="/login" className="btn-gold text-base px-8 py-3.5">Iniciar sesión</Link>
            )}
          </div>
          {!user && (
            <p className="text-xs text-marino/45 mt-4">
              ¿Aún no tienes cuenta? Tu contador te da acceso a la plataforma.
            </p>
          )}
          <p className="text-[11px] text-marino/40 mt-5">
            Un producto de <span className="font-semibold text-marino/60">ACDAN Consultores</span>
          </p>
        </section>

        <div className="relative isolate">
          <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-[#C9A86A]/30 via-[#C9A86A]/10 to-transparent blur-xl" />
          <section className="card p-5 anim-in">
            <div className="text-xs font-bold uppercase tracking-wider text-marino/45 mb-3">
              Lo que Pilli monitorea por ti
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {DOCUMENTOS.map(d => (
                <div key={d.nombre} className="rounded-xl border border-line bg-hueso/60 p-4 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{d.nombre}</span>
                    <span className="badge bg-emerald-100 text-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Automático
                    </span>
                  </div>
                  <p className="text-sm text-marino/60 mt-1">{d.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-marino/40 mt-4">
              Tus contraseñas se guardan cifradas y nunca salen del servidor.
            </p>
          </section>
        </div>

        <section className="py-14">
          <h2 className="font-pilli text-2xl font-bold tracking-tight text-center">Cómo funciona</h2>
          <p className="text-marino/60 mt-1 text-center">Tres pasos y te olvidas del SAT.</p>
          <div className="grid gap-4 sm:grid-cols-3 mt-6">
            {PASOS.map(p => (
              <div key={p.n} className="relative isolate rounded-3xl">
                <div aria-hidden="true" className="tech-spectrum tech-glow absolute -inset-8 -z-10 rounded-[3rem]" />
                <div className="relative overflow-hidden rounded-[1.4rem] bg-white p-5 text-left">
                  <div className="w-9 h-9 rounded-xl bg-marino text-dorado grid place-items-center font-bold font-pilli text-lg">{p.n}</div>
                  <h3 className="font-bold mt-3">{p.titulo}</h3>
                  <p className="text-sm text-marino/60 mt-1.5 leading-relaxed">{p.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-4">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-xs text-marino/40">
          <span>ACDAN Consultores · Clarity Fiscal</span>
          <span className="font-pilli font-bold">Pilli Contable</span>
        </div>
      </footer>
    </div>
  )
}
