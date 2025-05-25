import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import TunnelManagement from './pages/TunnelManagement'
import CreateTunnel from './pages/CreateTunnel'
import SystemSettings from './pages/SystemSettings'

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/tunnels" element={<TunnelManagement />} />
      <Route path="/tunnels/create" element={<CreateTunnel />} />
      <Route path="/settings" element={<SystemSettings />} />
    </Routes>
  )
}

export default AppRoutes 