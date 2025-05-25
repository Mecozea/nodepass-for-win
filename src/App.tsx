import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, Modal, message } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import Layout from './components/Layout'
import TunnelManagement from './pages/TunnelManagement'
import CreateTunnel from './pages/CreateTunnel'
import LogsPage from './pages/LogsPage'
import SystemSettings from './pages/SystemSettings'
import { SettingsProvider, useSettings } from './context/SettingsContext'
import { LogProvider } from './context/LogContext'
import { lightTheme, darkTheme } from './theme'
import { configManager } from './utils/config'
import './App.css'

const AppContent: React.FC = () => {
  const { isDarkMode, theme } = useSettings()

  useEffect(() => {
    // 监听关闭请求事件
    const unlistenClose = listen('close-requested', () => {
      Modal.confirm({
        title: '确认关闭',
        icon: <ExclamationCircleOutlined />,
        content: '您希望如何处理应用程序？',
        okText: '最小化到托盘',
        cancelText: '完全退出',
        onOk: async () => {
          try {
            await invoke('hide_window')
            message.success('应用已最小化到系统托盘')
          } catch (error) {
            console.error('隐藏窗口失败:', error)
          }
        },
        onCancel: async () => {
          try {
            // 停止所有隧道进程并退出应用
            await invoke('exit_app')
          } catch (error) {
            console.error('退出应用失败:', error)
          }
        },
      })
    })

    return () => {
      unlistenClose.then(fn => fn())
    }
  }, [])

  // 设置窗口主题
  useEffect(() => {
    const setWindowTheme = async () => {
      try {
        await invoke('set_window_theme', { theme })
      } catch (error) {
        console.error('设置窗口主题失败:', error)
      }
    }
    
    setWindowTheme()
  }, [theme])

  return (
    <ConfigProvider 
      theme={isDarkMode ? darkTheme : lightTheme}
      componentSize="middle"
    >
      <div data-theme={isDarkMode ? 'dark' : 'light'}>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/tunnels" replace />} />
              <Route path="/tunnels" element={<TunnelManagement />} />
              <Route path="/create-tunnel" element={<CreateTunnel />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/settings" element={<SystemSettings />} />
            </Routes>
          </Layout>
        </Router>
      </div>
    </ConfigProvider>
  )
}

const App: React.FC = () => {
  useEffect(() => {
    // 初始化配置管理器
    const initConfig = async () => {
      try {
        await configManager.initialize()
        console.log('配置管理器初始化成功')
      } catch (error) {
        console.error('配置管理器初始化失败:', error)
      }
    }
    
    initConfig()
  }, [])

  return (
    <SettingsProvider>
      <LogProvider>
        <AppContent />
      </LogProvider>
    </SettingsProvider>
  )
}

export default App
