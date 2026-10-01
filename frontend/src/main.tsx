import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { AuthProvider, RequireAuth, RequireAdmin } from './lib/auth'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import ClienteDetalle from './pages/ClienteDetalle'
import Config from './pages/Config'
import Login from './pages/Login'
import Usuarios from './pages/Usuarios'
import Landing from './pages/Landing'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
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
