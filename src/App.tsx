import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, Modal, message } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import TitleBar from './components/TitleBar'
import Layout from './components/Layout'
import TunnelManagement from './pages/TunnelManagement'
import CreateTunnel from './pages/CreateTunnel'
import LogsPage from './pages/LogsPage'
import SystemSettings from './pages/SystemSettings'
import { SettingsProvider, useSettings } from './context/SettingsContext'
import { LogProvider } from './context/LogContext'
import { TunnelProvider } from './context/TunnelContext'
import { lightTheme, darkTheme } from './theme'
import { configManager } from './utils/config'
import './App.css'

const AppContent: React.FC = () => {
  const { isDarkMode, theme } = useSettings()

  useEffect(() => {
    // 监听关闭请求事件
    const unlistenClose = listen('close-requested', () => {
      Modal.confirm({
        title: '确认关闭应用',
        icon: <ExclamationCircleOutlined />,
        content: (
          <div>
            <p>检测到您正在尝试关闭应用程序。</p>
            <p>您希望如何处理？</p>
          </div>
        ),
        okText: '最小化到托盘',
        cancelText: '完全退出应用',
        okType: 'default',
        cancelButtonProps: { danger: true },
        onOk: async () => {
          try {
            await invoke('hide_window')
            message.success('应用已最小化到系统托盘，可通过托盘图标重新打开')
          } catch (error) {
            console.error('隐藏窗口失败:', error)
            message.error('最小化失败，请重试')
          }
        },
        onCancel: async () => {
          try {
            // 停止所有隧道进程并退出应用
            await invoke('exit_app')
          } catch (error) {
            console.error('退出应用失败:', error)
            message.error('退出失败，请重试')
          }
        },
      })
    })

    // 监听窗口主题初始化事件（新的事件）
    const unlistenWindowTheme = listen('window-theme-initialized', (event) => {
      const { theme: windowTheme, systemFrame } = event.payload as { theme: string, systemFrame: string }
      console.log('窗口主题已初始化:', { windowTheme, systemFrame })
      
      // 确保前端主题与后端窗口主题保持一致
      if (windowTheme === 'dark' && !isDarkMode) {
        console.log('后端设置为深色主题，前端将同步')
      }
    })

    // 监听初始主题设置事件（保持兼容性）
    const unlistenTheme = listen('set-initial-theme', async () => {
      try {
        await invoke('set_window_theme', { theme })
        console.log('初始窗口主题设置完成:', theme)
      } catch (error) {
        console.error('设置初始窗口主题失败:', error)
      }
    })

    return () => {
      unlistenClose.then(fn => fn())
      unlistenWindowTheme.then(fn => fn())
      unlistenTheme.then(fn => fn())
    }
  }, [theme, isDarkMode])

  return (
    <ConfigProvider 
      theme={isDarkMode ? darkTheme : lightTheme}
      componentSize="middle"
    >
      <div data-theme={isDarkMode ? 'dark' : 'light'}>
        <TitleBar />
        <div className="app-content-with-titlebar">
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/tunnels" replace />} />
                <Route 
                  path="/tunnels" 
                  element={<TunnelManagement />} 
                />
                <Route path="/create-tunnel" element={<CreateTunnel />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/settings" element={<SystemSettings />} />
              </Routes>
            </Layout>
          </Router>
        </div>
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
        <TunnelProvider>
          <AppContent />
        </TunnelProvider>
      </LogProvider>
    </SettingsProvider>
  )
}

export default App
