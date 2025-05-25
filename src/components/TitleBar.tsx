import React, { useState, useEffect } from 'react'
import { Button } from 'antd'
import { MinusOutlined, BorderOutlined, CloseOutlined, CopyOutlined } from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './TitleBar.css'

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 监听窗口状态变化
    const checkMaximized = async () => {
      try {
        const window = getCurrentWindow()
        const maximized = await window.isMaximized()
        setIsMaximized(maximized)
      } catch (error) {
        console.error('检查窗口状态失败:', error)
      }
    }

    checkMaximized()
  }, [])

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow()
      await window.minimize()
    } catch (error) {
      console.error('最小化窗口失败:', error)
    }
  }

  const handleMaximize = async () => {
    try {
      const window = getCurrentWindow()
      const maximized = await window.isMaximized()
      if (maximized) {
        await window.unmaximize()
        setIsMaximized(false)
      } else {
        await window.maximize()
        setIsMaximized(true)
      }
    } catch (error) {
      console.error('最大化/还原窗口失败:', error)
    }
  }

  const handleClose = async () => {
    try {
      // 触发关闭确认对话框，通过调用后端函数
      await invoke('request_close')
    } catch (error) {
      console.error('关闭窗口失败:', error)
    }
  }

  const handleDoubleClick = async () => {
    // 双击标题栏切换最大化状态
    await handleMaximize()
  }

  return (
    <div className="custom-titlebar" onDoubleClick={handleDoubleClick}>
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