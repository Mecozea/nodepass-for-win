import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Typography, Space, message, Card, Descriptions, Tag } from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faTrash, faPlay, faPause } from '@fortawesome/free-solid-svg-icons'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { configManager } from '../utils/config'
import { useLog } from '../context/LogContext'
import { useSettings } from '../context/SettingsContext'

const { Text } = Typography

interface TunnelConfig {
  id: string
  name: string
  mode: string
  tunnelAddr: string
  targetAddr: string
  status: string
  processId?: number
  createdAt: string
  lastStarted?: string
  logLevel?: string
  tlsMode?: string
  certFile?: string
  keyFile?: string
}

const TunnelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isDarkMode } = useSettings()
  const { addLog } = useLog()
  const [tunnel, setTunnel] = useState<TunnelConfig | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logContainerRef = useRef<HTMLDivElement>(null)

  console.log('TunnelDetail 组件渲染，ID:', id)
  console.log('当前路由参数:', useParams())

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
        setLogs(prevLogs => {
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
    const cleanText = text.replace(/^\[\d+\]\[.*?\]\s*/, '')
      .replace(/\[(INFO|ERROR|WARN|DEBUG)\]\s*/g, '')
    
    return cleanText
      .replace(/\x1b\[32m/g, '<span style="color: #52c41a">')
      .replace(/\x1b\[31m/g, '<span style="color: #ff4d4f">')
      .replace(/\x1b\[33m/g, '<span style="color: #faad14">')
      .replace(/\x1b\[0m/g, '</span>')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  }

  // 加载隧道信息和历史日志
  useEffect(() => {
    const loadTunnelAndLogs = async () => {
      try {
        console.log('正在加载隧道信息，ID:', id)
        const currentTunnel = configManager.getTunnel(id || '')
        console.log('获取到的隧道信息:', currentTunnel)
        
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
            addLog('error', `获取隧道日志失败: ${error}`, 'TunnelDetail')
          }
        }
      } catch (error) {
        console.error('加载隧道信息失败:', error)
        message.error(`加载隧道信息失败: ${error}`)
        navigate('/tunnels')
      }
    }

    if (id) {
      loadTunnelAndLogs()
    }
  }, [id, navigate, addLog])

  // 启动隧道
  const handleStart = async () => {
    if (!tunnel) return
    try {
      addLog('info', `开始启动隧道: ${tunnel.name}`, 'TunnelDetail')
      
      const nodePassConfig = {
        mode: tunnel.mode,
        tunnelAddr: tunnel.tunnelAddr,
        targetAddr: tunnel.targetAddr,
        logLevel: tunnel.logLevel,
        tlsMode: tunnel.tlsMode,
        certFile: tunnel.certFile || null,
        keyFile: tunnel.keyFile || null
      }

      const processId = await invoke<number>('start_nodepass', { 
        config: nodePassConfig,
        tunnelId: tunnel.id
      })
      
      await configManager.updateTunnel(tunnel.id, { 
        status: 'running',
        processId: processId,
        lastStarted: new Date().toISOString()
      })
      
      message.success(`隧道 ${tunnel.name} 启动成功`)
      addLog('info', `隧道 ${tunnel.name} 启动成功，进程ID: ${processId}`, 'TunnelDetail')
      setTunnel((prev: TunnelConfig | null) => prev ? { ...prev, status: 'running', processId } : null)
    } catch (error) {
      const errorMsg = `启动隧道失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'TunnelDetail')
    }
  }

  // 停止隧道
  const handleStop = async () => {
    if (!tunnel || !tunnel.processId) return
    try {
      addLog('info', `开始停止隧道: ${tunnel.name}`, 'TunnelDetail')
      await invoke('stop_nodepass_by_pid', { processId: tunnel.processId })
      
      await configManager.updateTunnel(tunnel.id, { 
        status: 'stopped',
        processId: undefined
      })
      
      message.success(`隧道 ${tunnel.name} 已停止`)
      addLog('info', `隧道 ${tunnel.name} 已停止`, 'TunnelDetail')
      setTunnel((prev: TunnelConfig | null) => prev ? { ...prev, status: 'stopped', processId: undefined } : null)
    } catch (error) {
      const errorMsg = `停止隧道失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'TunnelDetail')
    }
  }

  const getModeTag = (mode: string) => {
    switch (mode) {
      case 'server':
        return <Tag color="blue">服务器</Tag>
      case 'client':
        return <Tag color="green">客户端</Tag>
      case 'master':
        return <Tag color="purple">主控</Tag>
      default:
        return <Tag>未知</Tag>
    }
  }

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'running':
        return <Tag color="success">运行中</Tag>
      case 'stopped':
        return <Tag color="default">已停止</Tag>
      case 'error':
        return <Tag color="error">错误</Tag>
      default:
        return <Tag>未知</Tag>
    }
  }

  if (!tunnel) {
    return (
      <div style={{ 
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Text type="secondary">加载中...</Text>
      </div>
    )
  }

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
            {tunnel.name} - 隧道详情
          </Typography.Title>
        </Space>
        
        <Space>
          {tunnel.status === 'running' ? (
            <Button 
              icon={<FontAwesomeIcon icon={faPause} />}
              onClick={handleStop}
              style={{ color: '#faad14', borderColor: '#faad14' }}
            >
              停止隧道
            </Button>
          ) : (
            <Button 
              icon={<FontAwesomeIcon icon={faPlay} />}
              onClick={handleStart}
              style={{ color: '#52c41a', borderColor: '#52c41a' }}
            >
              启动隧道
            </Button>
          )}
        </Space>
      </div>

      {/* 隧道信息卡片 */}
      <Card style={{ marginBottom: '16px' }}>
        <Descriptions title="基本信息" bordered>
          <Descriptions.Item label="隧道名称">{tunnel.name}</Descriptions.Item>
          <Descriptions.Item label="运行模式">{getModeTag(tunnel.mode)}</Descriptions.Item>
          <Descriptions.Item label="运行状态">{getStatusTag(tunnel.status)}</Descriptions.Item>
          <Descriptions.Item label="隧道地址">{tunnel.tunnelAddr}</Descriptions.Item>
          <Descriptions.Item label="目标地址">{tunnel.targetAddr}</Descriptions.Item>
          <Descriptions.Item label="进程ID">{tunnel.processId || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{tunnel.createdAt}</Descriptions.Item>
          <Descriptions.Item label="最后启动">{tunnel.lastStarted || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 日志内容 */}
      <Card 
        title="运行日志"
        extra={
          <Button 
            icon={<FontAwesomeIcon icon={faTrash} />}
            onClick={() => setLogs([])}
          >
            清空日志
          </Button>
        }
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        bodyStyle={{ flex: 1, padding: 0, overflow: 'hidden' }}
      >
        <div 
          ref={logContainerRef}
          style={{ 
            backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
            color: isDarkMode ? '#d4d4d4' : '#000',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: '12px',
            padding: '16px',
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
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
                {tunnel.status === 'running' ? '等待日志输出...' : '启动隧道后将显示实时日志'}
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
      </Card>
    </div>
  )
}

export default TunnelDetail 