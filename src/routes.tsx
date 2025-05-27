import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import TunnelManagement from './pages/TunnelManagement'
import CreateTunnel from './pages/CreateTunnel'
import SystemSettings from './pages/SystemSettings'
import SystemLogsPage from './pages/LogsPage'
import TunnelDetail from './pages/TunnelDetail'

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tunnels" replace />} />
      <Route path="/tunnels">
        <Route index element={<TunnelManagement />} />
        <Route path="create" element={<CreateTunnel />} />
        <Route path=":id/details" element={<TunnelDetail />} />
      </Route>
      <Route path="/system-logs" element={<SystemLogsPage />} />
      <Route path="/settings" element={<SystemSettings />} />
      <Route path="*" element={<Navigate to="/tunnels" replace />} />
    </Routes>
  )
}

export default AppRoutes 