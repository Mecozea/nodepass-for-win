import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import TunnelManagement from './pages/TunnelManagement'
import CreateTunnel from './pages/CreateTunnel'
import SystemSettings from './pages/SystemSettings'
import LogsPage from './pages/LogsPage'

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tunnels" replace />} />
      <Route path="/tunnels" element={<TunnelManagement />} />
      <Route path="/tunnels/create" element={<CreateTunnel />} />
      <Route path="/logs" element={<LogsPage />} />
      <Route path="/settings" element={<SystemSettings />} />
    </Routes>
  )
}

export default AppRoutes 