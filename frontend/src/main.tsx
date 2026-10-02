import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { AuthProvider, RequireAuth, RequireAdmin } from './lib/auth'
import { PortalProvider, RequirePortal } from './lib/portal'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import ClienteDetalle from './pages/ClienteDetalle'
import Config from './pages/Config'
import Login from './pages/Login'
import Usuarios from './pages/Usuarios'
import Landing from './pages/Landing'
import PortalAcceso from './pages/PortalAcceso'
import PortalResumen from './pages/PortalResumen'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/c/:rfc" element={<PortalProvider><PortalAcceso /></PortalProvider>} />
          <Route path="/c/:rfc/resumen" element={<PortalProvider><RequirePortal><PortalResumen /></RequirePortal></PortalProvider>} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/resumen" element={<Dashboard />} />
            <Route path="/dashboard" element={<Navigate to="/resumen" replace />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:rfc" element={<ClienteDetalle />} />
            <Route path="/config" element={<Config />} />
            <Route path="/usuarios" element={<RequireAdmin><Usuarios /></RequireAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
