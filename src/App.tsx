import React from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { customTheme } from './theme'
import { SettingsProvider } from './context/SettingsContext'
import AppLayout from './components/Layout'
import AppRoutes from './routes'
import './App.css'

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={customTheme}
    >
      <SettingsProvider>
        <Router>
          <AppLayout>
            <AppRoutes />
          </AppLayout>
        </Router>
      </SettingsProvider>
    </ConfigProvider>
  )
}

export default App
