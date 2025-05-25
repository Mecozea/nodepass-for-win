import React, { createContext, useContext, useState, ReactNode } from 'react'

interface SettingsContextType {
  // 导航设置
  isTopNav: boolean
  setIsTopNav: (value: boolean) => void
  
  // 主题设置
  theme: 'light' | 'dark' | 'system'
  setTheme: (value: 'light' | 'dark' | 'system') => void
  
  // 侧边栏折叠状态
  collapsed: boolean
  setCollapsed: (value: boolean) => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

interface SettingsProviderProps {
  children: ReactNode
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [isTopNav, setIsTopNav] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light')
  const [collapsed, setCollapsed] = useState(false)

  const value = {
    isTopNav,
    setIsTopNav,
    theme,
    setTheme,
    collapsed,
    setCollapsed,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
} 