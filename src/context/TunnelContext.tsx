import React, { createContext, useContext, useState, ReactNode } from 'react'

interface TunnelContextType {
  refreshTrigger: number
  triggerRefresh: () => void
}

const TunnelContext = createContext<TunnelContextType | undefined>(undefined)

export const TunnelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <TunnelContext.Provider value={{
      refreshTrigger,
      triggerRefresh
    }}>
      {children}
    </TunnelContext.Provider>
  )
}

export const useTunnel = () => {
  const context = useContext(TunnelContext)
  if (context === undefined) {
    throw new Error('useTunnel must be used within a TunnelProvider')
  }
  return context
} 