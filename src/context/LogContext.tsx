import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  id: string
  timestamp: Date
  level: LogLevel
  message: string
  source?: string
}

interface LogContextType {
  logs: LogEntry[]
  filteredLogs: LogEntry[]
  filterLevel: LogLevel | 'all'
  setFilterLevel: (level: LogLevel | 'all') => void
  addLog: (level: LogLevel, message: string, source?: string) => void
  clearLogs: () => void
}

const LogContext = createContext<LogContextType | undefined>(undefined)

const MAX_LOGS = 2000 // 增加日志数量限制
const STORAGE_KEY = 'nodepass-gui-logs'

export const LogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all')

  // 从本地存储加载日志
  useEffect(() => {
    try {
      const savedLogs = localStorage.getItem(STORAGE_KEY)
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs).map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }))
        setLogs(parsedLogs)
      }
    } catch (error) {
      console.error('加载日志历史失败:', error)
    }
  }, [])

  // 保存日志到本地存储
  const saveLogs = (newLogs: LogEntry[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newLogs))
    } catch (error) {
      console.error('保存日志失败:', error)
    }
  }

  const addLog = (level: LogLevel, message: string, source?: string) => {
    const newLog: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message,
      source
    }

    setLogs(prevLogs => {
      const updatedLogs = [newLog, ...prevLogs]
      
      // 限制日志数量
      const trimmedLogs = updatedLogs.slice(0, MAX_LOGS)
      
      // 保存到本地存储
      saveLogs(trimmedLogs)
      
      return trimmedLogs
    })
  }

  const clearLogs = () => {
    setLogs([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('清除日志存储失败:', error)
    }
  }

  const filteredLogs = logs.filter(log => {
    if (filterLevel === 'all') return true
    return log.level === filterLevel
  })

  return (
    <LogContext.Provider value={{
      logs,
      filteredLogs,
      filterLevel,
      setFilterLevel,
      addLog,
      clearLogs
    }}>
      {children}
    </LogContext.Provider>
  )
}

export const useLog = () => {
  const context = useContext(LogContext)
  if (context === undefined) {
    throw new Error('useLog must be used within a LogProvider')
  }
  return context
} 