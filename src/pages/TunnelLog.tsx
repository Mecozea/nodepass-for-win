import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Typography, Space, message } from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faTrash } from '@fortawesome/free-solid-svg-icons'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { configManager, TunnelConfig } from '../utils/config'
import { useLog } from '../context/LogContext'
import { useSettings } from '../context/SettingsContext'

const { Text } = Typography

const TunnelLog: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isDarkMode } = useSettings()
  const { addLog } = useLog()
  const [tunnel, setTunnel] = useState<TunnelConfig | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logContainerRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }

  // 监听日志变化，自动滚动到底部
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(scrollToBottom, 100)
    }
  }, [logs])

  // 监听日志事件
  useEffect(() => {
    let unlisten: () => void;

    // 监听隧道日志
    listen('tunnel-log', (event) => {
      const { tunnel_id, message } = event.payload as any;
      if (tunnel_id === id) {
        // 使用函数式更新，确保使用最新的状态
        setLogs(prevLogs => {
          // 检查是否已经存在相同的日志
          const lastLog = prevLogs[prevLogs.length - 1];
          if (lastLog === message) {
            return prevLogs;
          }
          return [...prevLogs, message];
        });
      }
    }).then(fn => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [id]);

  // 处理 ANSI 转义序列
  const processAnsiEscape = (text: string) => {
    // 移除日志前缀 [001][INFO] 等
    const cleanText = text.replace(/^\[\d+\]\[.*?\]\s*/, '')
      // 移除 [INFO]、[ERROR]、[WARN] 等标签
      .replace(/\[(INFO|ERROR|WARN|DEBUG)\]\s*/g, '')
    
    // 处理 ANSI 颜色代码
    return cleanText
      .replace(/\x1b\[32m/g, '<span style="color: #52c41a">') // 绿色
      .replace(/\x1b\[31m/g, '<span style="color: #ff4d4f">') // 红色
      .replace(/\x1b\[33m/g, '<span style="color: #faad14">') // 黄色
      .replace(/\x1b\[0m/g, '</span>') // 重置颜色
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // 移除其他 ANSI 转义序列
  }

  // 加载隧道信息和历史日志
  useEffect(() => {
    const loadTunnelAndLogs = async () => {
      try {
        const tunnelList = configManager.getTunnels()
        const currentTunnel = tunnelList.find(t => t.id === id)
        
        if (!currentTunnel) {
          message.error('隧道不存在')
          navigate('/tunnels')
          return
        }

        setTunnel(currentTunnel)

        // 如果隧道正在运行，获取历史日志
        if (currentTunnel.status === 'running' && currentTunnel.processId) {
          try {
            const historyLogs = await invoke<string[]>('get_tunnel_logs', { 
              processId: currentTunnel.processId 
            })
            setLogs(historyLogs)
          } catch (error) {
            console.error('获取隧道日志失败:', error)
            addLog('error', `获取隧道日志失败: ${error}`, 'TunnelLog')
          }
        }
      } catch (error) {
        message.error(`加载隧道信息失败: ${error}`)
        navigate('/tunnels')
      }
    }

    loadTunnelAndLogs()
  }, [id])

  return (
    <div style={{ 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* 顶部导航栏 */}
      <div style={{ 
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <Space>
          <Button 
            icon={<FontAwesomeIcon icon={faArrowLeft} />}
            onClick={() => navigate('/tunnels')}
          >
            返回
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {tunnel?.name} - 日志
          </Typography.Title>
        </Space>
        
        <Button 
          icon={<FontAwesomeIcon icon={faTrash} />}
          onClick={() => setLogs([])}
        >
          清空日志
        </Button>
      </div>

      {/* 日志内容 */}
      <div 
        ref={logContainerRef}
        style={{ 
          backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
          color: isDarkMode ? '#d4d4d4' : '#000',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: '12px',
          padding: '16px',
          borderRadius: '8px',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {logs.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: isDarkMode ? '#888' : '#666',
            marginTop: '100px',
            fontSize: '14px'
          }}>
            暂无日志输出
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {tunnel?.status === 'running' ? '等待日志输出...' : '启动隧道后将显示实时日志'}
            </Text>
          </div>
        ) : (
          <div>
            {logs.map((log, index) => (
              <div 
                key={index}
                style={{ 
                  padding: '2px 0',
                  lineHeight: '1.4'
                }}
                dangerouslySetInnerHTML={{ 
                  __html: processAnsiEscape(log)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TunnelLog 