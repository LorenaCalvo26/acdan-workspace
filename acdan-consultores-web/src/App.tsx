import { About } from './components/About'
import { Contact } from './components/Contact'
import { Faq } from './components/Faq'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { Navbar } from './components/Navbar'
import { Process } from './components/Process'
import { ScrollProgress } from './components/ScrollProgress'
import { Services } from './components/Services'
import { Testimonials } from './components/Testimonials'
import { WhatsAppButton } from './components/WhatsAppButton'

function App() {
  return (
    <>
      <ScrollProgress />
      <Navbar />
      <main>
        <Hero />
        <Marquee />
        <Services />
        <Process />
        <About />
        <Testimonials />
        <Faq />
        <Contact />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}

export default App