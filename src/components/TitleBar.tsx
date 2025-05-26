import React, { useState, useEffect } from 'react'
import { Button, message } from 'antd'
import { MinusOutlined, BorderOutlined, CloseOutlined, CopyOutlined, PushpinOutlined } from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './TitleBar.css'

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

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

    // 监听窗口状态变化事件
    const window = getCurrentWindow()
    const unlisten = window.listen('tauri://resize', () => {
      checkMaximized()
    })

    return () => {
      unlisten.then((fn: () => void) => fn())
    }
  }, [])

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow()
      await window.minimize()
    } catch (error) {
      console.error('最小化窗口失败:', error)
      message.error('最小化窗口失败')
    }
  }

  const handleMaximize = async () => {
    try {
      const window = getCurrentWindow()
      if (isMaximized) {
        await window.unmaximize()
      } else {
        await window.maximize()
      }
      setIsMaximized(!isMaximized)
    } catch (error) {
      console.error('最大化/还原窗口失败:', error)
      message.error('最大化/还原窗口失败')
    }
  }

  const handleClose = async () => {
    try {
      await invoke('request_close')
    } catch (error) {
      console.error('请求关闭失败:', error)
      message.error('请求关闭失败')
    }
  }

  const handlePin = async () => {
    try {
      const window = getCurrentWindow()
      await window.setAlwaysOnTop(!isPinned)
      setIsPinned(!isPinned)
      message.success(isPinned ? '已取消置顶' : '已置顶窗口')
    } catch (error) {
      console.error('设置窗口置顶失败:', error)
      message.error('设置窗口置顶失败')
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
            icon={<PushpinOutlined />}
            className={`titlebar-button pin-button ${isPinned ? 'active' : ''}`}
            onClick={handlePin}
            title={isPinned ? "取消置顶" : "置顶窗口"}
          />
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