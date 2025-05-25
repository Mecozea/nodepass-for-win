import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { configManager, SystemSettings } from '../utils/config'
import { invoke } from '@tauri-apps/api/core'

export type ThemeMode = 'light' | 'dark' | 'auto'

interface SettingsContextType {
  settings: SystemSettings
  updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  isDarkMode: boolean
  // 导航相关状态
  isTopNav: boolean
  setIsTopNav: (isTopNav: boolean) => void
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettings>(() => configManager.getSettings())
  const [theme, setThemeState] = useState<ThemeMode>(() => configManager.getSettings().theme)
  const [isDarkMode, setIsDarkMode] = useState(false)
  
  // 导航相关状态 - 从设置中读取
  const [isTopNav, setIsTopNavState] = useState(() => configManager.getSettings().isTopNav)
  const [collapsed, setCollapsedState] = useState(() => configManager.getSettings().sidebarCollapsed)

  // 检测系统主题
  const detectSystemTheme = () => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  // 计算当前是否应该使用深色模式
  const calculateDarkMode = (themeMode: ThemeMode) => {
    switch (themeMode) {
      case 'dark':
        return true
      case 'light':
        return false
      case 'auto':
        return detectSystemTheme()
      default:
        return false
    }
  }

  // 监听系统主题变化和初始化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleChange = () => {
      if (theme === 'auto') {
        setIsDarkMode(detectSystemTheme())
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    
    // 初始化时计算主题
    setIsDarkMode(calculateDarkMode(theme))

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  // 监听配置管理器的变化，确保状态同步
  useEffect(() => {
    const currentSettings = configManager.getSettings()
    setSettings(currentSettings)
    setThemeState(currentSettings.theme)
    setIsTopNavState(currentSettings.isTopNav)
    setCollapsedState(currentSettings.sidebarCollapsed)
    setIsDarkMode(calculateDarkMode(currentSettings.theme))
  }, [])

  const updateSettings = async (newSettings: Partial<SystemSettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings }
      await configManager.updateSettings(updatedSettings)
      setSettings(updatedSettings)
      
      // 如果更新了主题设置，同步更新主题状态
      if (newSettings.theme) {
        setThemeState(newSettings.theme)
        setIsDarkMode(calculateDarkMode(newSettings.theme))
      }
      
      // 如果更新了导航设置，同步更新状态
      if (newSettings.isTopNav !== undefined) {
        setIsTopNavState(newSettings.isTopNav)
      }
      
      if (newSettings.sidebarCollapsed !== undefined) {
        setCollapsedState(newSettings.sidebarCollapsed)
      }
    } catch (error) {
      console.error('更新设置失败:', error)
      throw error
    }
  }

  const setTheme = async (newTheme: ThemeMode) => {
    setThemeState(newTheme)
    const calculatedDarkMode = calculateDarkMode(newTheme)
    setIsDarkMode(calculatedDarkMode)
    
    // 调用Tauri命令设置窗口主题
    try {
      await invoke('set_window_theme', { theme: newTheme })
    } catch (error) {
      console.error('设置窗口主题失败:', error)
    }
    
    await updateSettings({ theme: newTheme })
  }

  const setIsTopNav = async (value: boolean) => {
    setIsTopNavState(value)
    await updateSettings({ isTopNav: value })
  }

  const setCollapsed = async (value: boolean) => {
    setCollapsedState(value)
    await updateSettings({ sidebarCollapsed: value })
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      theme,
      setTheme,
      isDarkMode,
      isTopNav,
      setIsTopNav,
      collapsed,
      setCollapsed
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
} 