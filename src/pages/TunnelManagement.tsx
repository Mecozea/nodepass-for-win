import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Tag, Modal, message, Card, Tooltip, Popconfirm, Row, Col, Statistic, List, Typography } from 'antd'
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
  PlusOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  StopOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { configManager, TunnelConfig } from '../utils/config'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useLog } from '../context/LogContext'

const { Text } = Typography

// 统计卡片组件
const StatCard: React.FC<{
  title: string
  value: number
  icon: React.ReactNode
  backgroundColor: string
  shadowColor: string
  textColor?: string
  iconBgColor?: string
}> = ({ title, value, icon, backgroundColor, shadowColor, textColor = '#fff', iconBgColor = 'rgba(255, 255, 255, 0.2)' }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <Card 
      style={{ 
        background: backgroundColor,
        border: 'none',
        borderRadius: '12px',
        boxShadow: `0 4px 20px ${shadowColor}`,
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      }}
      bodyStyle={{ padding: '20px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ 
            color: textColor === '#fff' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)', 
            fontSize: '14px', 
            marginBottom: '8px',
            fontWeight: '500'
          }}>
            {title}
          </div>
          <div style={{ 
            color: textColor, 
            fontSize: '32px', 
            fontWeight: 'bold',
            lineHeight: '1'
          }}>
            {value}
          </div>
        </div>
        <div style={{ 
          backgroundColor: iconBgColor,
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.3s ease'
        }}>
          {React.cloneElement(icon as React.ReactElement, { 
            style: { fontSize: '24px', color: textColor } 
          })}
        </div>
      </div>
    </Card>
  )
}

interface TunnelProcess {
  id: string
  processId: number
  status: 'running' | 'stopped' | 'error'
  logs: string[]
}

interface NodePassLogEvent {
  tunnel_id: string
  message: string
}

interface ProcessExitEvent {
  tunnel_id: string
  process_id: number
  exit_code: number
}

interface ProcessErrorEvent {
  tunnel_id: string
  process_id: number
  error: string
}

const TunnelManagement: React.FC = () => {
  const navigate = useNavigate()
  const { addLog } = useLog()
  const [tunnels, setTunnels] = useState<TunnelConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTunnel, setSelectedTunnel] = useState<TunnelConfig | null>(null)
  const [logModalVisible, setLogModalVisible] = useState(false)
  const [tunnelProcesses, setTunnelProcesses] = useState<Map<string, TunnelProcess>>(new Map())
  const [tunnelLogs, setTunnelLogs] = useState<string[]>([])
  const logContainerRef = React.useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState({
    total: 0,
    running: 0,
    stopped: 0,
    error: 0
  })
  const [tunnelStartTimes, setTunnelStartTimes] = useState<Map<string, number>>(new Map())

  // 自动滚动到日志底部
  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }

  // 监听日志变化，自动滚动到底部
  useEffect(() => {
    if (logModalVisible && tunnelLogs.length > 0) {
      setTimeout(scrollToBottom, 100)
    }
  }, [tunnelLogs, logModalVisible])

  // 监听NodePass日志
  useEffect(() => {
    const unlistenLog = listen<NodePassLogEvent>('nodepass-log', (event) => {
      const { tunnel_id, message } = event.payload
      console.log('NodePass日志:', tunnel_id, message)
      
      // 检测日志中的错误信息
      const isError = message.includes('[ERROR]') || message.includes('ERROR')
      
      // 检查隧道启动时间，避免在启动后立即检测错误（给5秒缓冲时间）
      const tunnelStartTime = tunnelStartTimes.get(tunnel_id)
      const currentTime = Date.now()
      const isWithinStartupPeriod = tunnelStartTime && (currentTime - tunnelStartTime) < 5000 // 5秒内
      
      // 检测是否为致命错误（会导致隧道无法正常工作的错误）
      const isFatalError = isError && !isWithinStartupPeriod && (
        message.includes('missing port in address') ||
        message.includes('dial tcp') ||
        message.includes('connection refused') ||
        message.includes('no such host') ||
        message.includes('Client error:') ||
        message.includes('Server error:') ||
        message.includes('bind: address already in use') ||
        message.includes('permission denied')
      )
      
      // 如果检测到致命错误，更新隧道状态为错误
      if (isFatalError) {
        console.log('检测到致命错误日志，停止隧道进程:', tunnel_id, message)
        
        // 异步处理停止进程和更新状态
        const handleFatalError = async () => {
          // 先获取当前隧道信息
          const currentTunnel = configManager.getTunnels().find(t => t.id === tunnel_id)
          
          // 如果隧道正在运行且有进程ID，先停止进程
          if (currentTunnel && currentTunnel.status === 'running' && currentTunnel.processId) {
            try {
              console.log('停止错误隧道进程:', currentTunnel.processId)
              await invoke('stop_nodepass_by_pid', { processId: currentTunnel.processId })
              addLog('info', `隧道 ${tunnel_id} 因致命错误已自动停止`, 'TunnelManagement')
            } catch (stopError) {
              console.error('停止错误隧道进程失败:', stopError)
              addLog('error', `停止错误隧道进程失败: ${stopError}`, 'TunnelManagement')
            }
          }
          
          // 更新隧道状态为错误
          try {
            await configManager.updateTunnel(tunnel_id, { 
              status: 'error',
              processId: undefined
            })
            loadTunnels()
            addLog('error', `隧道 ${tunnel_id} 检测到致命错误: ${message}`, 'TunnelManagement')
            // 清除启动时间记录
            setTunnelStartTimes(prev => {
              const newMap = new Map(prev)
              newMap.delete(tunnel_id)
              return newMap
            })
          } catch (err) {
            console.error('更新隧道状态失败:', err)
          }
        }
        
        // 执行异步处理
        handleFatalError()
      }
      
      // 如果有选中的隧道且日志模态框打开，更新日志
      if (selectedTunnel && selectedTunnel.id === tunnel_id && logModalVisible) {
        setTunnelLogs(prev => [...prev, message])
      }
    })

    const unlistenExit = listen<ProcessExitEvent>('nodepass-process-exit', (event) => {
      const { tunnel_id, process_id, exit_code } = event.payload
      console.log('进程退出:', tunnel_id, process_id, exit_code)
      
      // 清除启动时间记录
      setTunnelStartTimes(prev => {
        const newMap = new Map(prev)
        newMap.delete(tunnel_id)
        return newMap
      })
      
      // 更新隧道状态
      configManager.updateTunnel(tunnel_id, { 
        status: 'stopped',
        processId: undefined
      }).then(() => {
        loadTunnels()
        addLog('info', `隧道 ${tunnel_id} 进程已退出，状态码: ${exit_code}`, 'TunnelManagement')
      })
    })

    const unlistenError = listen<ProcessErrorEvent>('nodepass-process-error', (event) => {
      const { tunnel_id, process_id, error } = event.payload
      console.log('进程错误:', tunnel_id, process_id, error)
      
      // 清除启动时间记录
      setTunnelStartTimes(prev => {
        const newMap = new Map(prev)
        newMap.delete(tunnel_id)
        return newMap
      })
      
      // 更新隧道状态
      configManager.updateTunnel(tunnel_id, { 
        status: 'error',
        processId: undefined
      }).then(() => {
        loadTunnels()
        addLog('error', `隧道 ${tunnel_id} 进程错误: ${error}`, 'TunnelManagement')
      })
    })

    return () => {
      unlistenLog.then(fn => fn())
      unlistenExit.then(fn => fn())
      unlistenError.then(fn => fn())
    }
  }, [selectedTunnel, logModalVisible])

  // 加载隧道列表
  const loadTunnels = async () => {
    setLoading(true)
    try {
      const tunnelList = configManager.getTunnels()
      setTunnels(tunnelList)
      
      // 更新统计数据
      const newStats = {
        total: tunnelList.length,
        running: tunnelList.filter(t => t.status === 'running').length,
        stopped: tunnelList.filter(t => t.status === 'stopped').length,
        error: tunnelList.filter(t => t.status === 'error').length
      }
      setStats(newStats)
    } catch (error) {
      message.error(`加载隧道列表失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  // 组件挂载时加载数据
  useEffect(() => {
    loadTunnels()
  }, [])

  // 启动隧道
  const handleStart = async (tunnel: TunnelConfig) => {
    try {
      addLog('info', `开始启动隧道: ${tunnel.name}`, 'TunnelManagement')
      
      // 构建NodePass配置
      const nodePassConfig = {
        mode: tunnel.mode,
        tunnelAddr: tunnel.tunnelAddr,
        targetAddr: tunnel.targetAddr,
        logLevel: tunnel.logLevel,
        tlsMode: tunnel.tlsMode,
        certFile: tunnel.certFile || null,
        keyFile: tunnel.keyFile || null
      }

      // 调用Rust后端启动NodePass，传入隧道ID
      const processId = await invoke<number>('start_nodepass', { 
        config: nodePassConfig,
        tunnelId: tunnel.id
      })
      
      // 更新隧道状态
      await configManager.updateTunnel(tunnel.id, { 
        status: 'running',
        processId: processId,
        lastStarted: new Date().toISOString()
      })
      
      // 记录隧道启动时间
      setTunnelStartTimes(prev => new Map(prev.set(tunnel.id, Date.now())))
      
      // 更新本地进程状态
      setTunnelProcesses(prev => new Map(prev.set(tunnel.id, {
        id: tunnel.id,
        processId: processId,
        status: 'running',
        logs: []
      })))

      message.success(`隧道 ${tunnel.name} 启动成功，进程ID: ${processId}`)
      addLog('info', `隧道 ${tunnel.name} 启动成功，进程ID: ${processId}`, 'TunnelManagement')
      loadTunnels()
    } catch (error) {
      const errorMsg = `启动隧道失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'TunnelManagement')
      
      // 更新隧道状态为错误
      await configManager.updateTunnel(tunnel.id, { status: 'error' })
      loadTunnels()
    }
  }

  // 停止隧道
  const handleStop = async (tunnel: TunnelConfig) => {
    try {
      addLog('info', `开始停止隧道: ${tunnel.name}`, 'TunnelManagement')
      
      if (!tunnel.processId) {
        throw new Error('隧道进程ID不存在')
      }
      
      // 调用Rust后端按PID停止NodePass
      await invoke('stop_nodepass_by_pid', { processId: tunnel.processId })
      
      message.success(`隧道 ${tunnel.name} 已停止`)
      addLog('info', `隧道 ${tunnel.name} 已停止`, 'TunnelManagement')
    } catch (error) {
      const errorMsg = `停止隧道失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'TunnelManagement')
    } finally {
      // 无论停止成功还是失败，都将隧道状态设置为已停止
      try {
        await configManager.updateTunnel(tunnel.id, { 
          status: 'stopped',
          processId: undefined
        })
        
        // 移除本地进程状态
        setTunnelProcesses(prev => {
          const newMap = new Map(prev)
          newMap.delete(tunnel.id)
          return newMap
        })
        
        // 清除启动时间记录
        setTunnelStartTimes(prev => {
          const newMap = new Map(prev)
          newMap.delete(tunnel.id)
          return newMap
        })

        loadTunnels()
      } catch (updateError) {
        console.error('更新隧道状态失败:', updateError)
        addLog('error', `更新隧道状态失败: ${updateError}`, 'TunnelManagement')
      }
    }
  }

  // 删除隧道
  const handleDelete = async (tunnel: TunnelConfig) => {
    try {
      // 如果隧道正在运行，先停止
      if (tunnel.status === 'running' && tunnel.processId) {
        await handleStop(tunnel)
      }
      
      await configManager.deleteTunnel(tunnel.id)
      message.success(`隧道 ${tunnel.name} 已删除`)
      loadTunnels()
    } catch (error) {
      message.error(`删除隧道失败: ${error}`)
    }
  }

  // 查看日志
  const handleViewLogs = async (tunnel: TunnelConfig) => {
    setSelectedTunnel(tunnel)
    setTunnelLogs([]) // 清空之前的日志
    
    // 如果隧道正在运行，获取历史日志
    if (tunnel.status === 'running' && tunnel.processId) {
      try {
        const logs = await invoke<string[]>('get_tunnel_logs', { processId: tunnel.processId })
        setTunnelLogs(logs)
      } catch (error) {
        console.error('获取隧道日志失败:', error)
        addLog('error', `获取隧道日志失败: ${error}`, 'TunnelManagement')
      }
    }
    
    setLogModalVisible(true)
  }

  // 格式化时间
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-')
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

  const columns = [
    {
      title: '隧道名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (name: string, record: TunnelConfig) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 状态圆点 */}
          <div 
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: 
                record.status === 'running' ? '#52c41a' :
                record.status === 'error' ? '#ff4d4f' : '#d9d9d9',
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
              cursor: 'help',
              flexShrink: 0
            }}
            title={`状态: ${record.status === 'running' ? '运行中' : record.status === 'error' ? '错误' : '已停止'} | PID: ${record.processId || '-'}`}
          />
          {/* 隧道类型 */}
          {getModeTag(record.mode)}
          {/* 隧道名称 */}
          <span style={{ fontWeight: 'bold' }}>{name}</span>
        </div>
      ),
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 60,
      render: (protocol: string) => (
        <Tag color={protocol === 'tcp' ? 'blue' : 'orange'}>
          {protocol?.toUpperCase() || 'TCP'}
        </Tag>
      ),
    },
    {
      title: '隧道地址',
      dataIndex: 'tunnelAddr',
      key: 'tunnelAddr',
      width: 140,
    },
    {
      title: '目标地址',
      dataIndex: 'targetAddr',
      key: 'targetAddr',
      width: 140,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (createdAt: string) => formatDateTime(createdAt),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_: any, record: TunnelConfig) => (
        <Space size="small">
          <Tooltip title="查看日志">
            <Button
              size="small"
              type="primary"
              icon={<FileTextOutlined />}
              onClick={() => handleViewLogs(record)}
              style={{ backgroundColor: '#1890ff', borderColor: '#1890ff' }}
            />
          </Tooltip>
          
          {record.status === 'running' ? (
            <Tooltip title="停止隧道">
              <Button
                size="small"
                icon={<PauseCircleOutlined />}
                onClick={() => handleStop(record)}
                style={{ 
                  backgroundColor: '#faad14', 
                  borderColor: '#faad14',
                  color: '#fff'
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="启动隧道">
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleStart(record)}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              />
            </Tooltip>
          )}
          
          <Popconfirm
            title="确认删除"
            description={`确定要删除隧道 "${record.name}" 吗？此操作无法撤销。`}
            onConfirm={() => handleDelete(record)}
            okText="确认删除"
            cancelText="取消"
            okType="danger"
          >
            <Tooltip title="删除隧道">
              <Button
                size="small"
                icon={<DeleteOutlined />}
                style={{ 
                  backgroundColor: '#ff4d4f', 
                  borderColor: '#ff4d4f',
                  color: '#fff'
                }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>隧道管理</h1>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadTunnels}
            loading={loading}
            size="large"
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/create-tunnel')}
            size="large"
          >
            创建隧道
          </Button>
        </Space>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="总实例"
            value={stats.total}
            icon={<DatabaseOutlined />}
            backgroundColor="#667eea"
            shadowColor="rgba(102, 126, 234, 0.3)"
          />
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="运行中"
            value={stats.running}
            icon={<CheckCircleOutlined />}
            backgroundColor="#52c41a"
            shadowColor="rgba(82, 196, 26, 0.3)"
          />
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="已停止"
            value={stats.stopped}
            icon={<StopOutlined />}
            backgroundColor="#faad14"
            shadowColor="rgba(250, 173, 20, 0.3)"
          />
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="错误"
            value={stats.error}
            icon={<WarningOutlined />}
            backgroundColor="#ff4d4f"
            shadowColor="rgba(255, 77, 79, 0.3)"
          />
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={tunnels}
        loading={loading}
        rowKey="id"
        pagination={false}
        style={{
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      />

      {/* 日志查看模态框 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>隧道日志 - {selectedTunnel?.name}</span>
          </Space>
        }
        open={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        footer={[
          <Button key="clear" onClick={() => setTunnelLogs([])}>
            清空日志
          </Button>,
          <Button key="close" onClick={() => setLogModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
        style={{ top: 20 }}
        bodyStyle={{ 
          maxHeight: 'calc(100vh - 200px)', 
          overflowY: 'auto',
          padding: '16px'
        }}
      >
        <div 
          ref={logContainerRef}
          style={{ 
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: '12px',
            padding: '16px',
            borderRadius: '4px',
            minHeight: '400px',
            maxHeight: '500px',
            overflowY: 'auto'
          }}
        >
          {tunnelLogs.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#888',
              marginTop: '100px',
              fontSize: '14px'
            }}>
              暂无日志输出
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {selectedTunnel?.status === 'running' ? '等待日志输出...' : '启动隧道后将显示实时日志'}
              </Text>
            </div>
          ) : (
            <div>
              {tunnelLogs.map((log, index) => (
                <div 
                  key={index}
                  style={{ 
                    padding: '2px 0',
                    color: log.includes('[ERROR]') ? '#ff6b6b' : 
                          log.includes('[WARN]') ? '#ffa726' :
                          log.includes('[INFO]') ? '#66bb6a' : '#d4d4d4',
                    lineHeight: '1.4'
                  }}
                >
                  <span style={{ color: '#888', marginRight: '8px' }}>
                    [{String(index + 1).padStart(3, '0')}]
                  </span>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {selectedTunnel && selectedTunnel.status === 'running' && (
          <div style={{ 
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#0369a1'
          }}>
            💡 提示：隧道正在运行中，日志将实时更新
          </div>
        )}
      </Modal>
    </div>
  )
}

export default TunnelManagement 