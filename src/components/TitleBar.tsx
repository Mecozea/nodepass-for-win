import React, { useState, useEffect } from 'react'
import { Button } from 'antd'
import { MinusOutlined, BorderOutlined, CloseOutlined, CopyOutlined } from '@ant-design/icons'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './TitleBar.css'

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  const appWindow = getCurrentWindow()

  useEffect(() => {
    let unlistenResize: (() => void) | null = null

    const setupListeners = async () => {
      try {
        // 监听窗口调整大小事件
        unlistenResize = await appWindow.onResized(() => {
          checkMaximized()
        })
        
        // 初始检查
        await checkMaximized()
      } catch (error) {
        console.error('设置监听器失败:', error)
      }
    }

    setupListeners()

    return () => {
      if (unlistenResize) {
        unlistenResize()
      }
    }
  }, [])

  const checkMaximized = async () => {
    try {
      const maximized = await appWindow.isMaximized()
      setIsMaximized(maximized)
    } catch (error) {
      console.error('检查最大化状态失败:', error)
    }
  }

  const handleMinimize = async () => {
    try {
      await appWindow.minimize()
    } catch (error) {
      console.error('最小化失败:', error)
    }
  }

  const handleMaximize = async () => {
    try {
      if (isMaximized) {
        await appWindow.unmaximize()
      } else {
        await appWindow.maximize()
      }
      // 状态会通过 onResized 事件自动更新
    } catch (error) {
      console.error('最大化/还原失败:', error)
    }
  }

  const handleClose = async () => {
    try {
      await appWindow.close()
    } catch (error) {
      console.error('关闭失败:', error)
    }
  }

  const handleDoubleClick = async () => {
    await handleMaximize()
  }

  return (
    <div className="custom-titlebar" data-tauri-drag-region onDoubleClick={handleDoubleClick}>
      <div className="titlebar-content">
        <div className="titlebar-title">
          <span>NodePass For Windows</span>
        </div>
        <div className="titlebar-controls">
      
          <Button
            type="text"
            size="small"
            icon={<MinusOutlined />}
            className="titlebar-button minimize-button"
            onClick={handleMinimize}
            title="最小化"
          />
          <Button
            type="text"
            size="small"
            icon={isMaximized ? <CopyOutlined /> : <BorderOutlined />}
            className="titlebar-button maximize-button"
            onClick={handleMaximize}
            title={isMaximized ? "还原" : "最大化"}
          />
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            className="titlebar-button close-button"
            onClick={handleClose}
            title="关闭"
          />
        </div>
      </div>
    </div>
  )
}

export default TitleBar 