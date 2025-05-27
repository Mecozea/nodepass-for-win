import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Tag, message, Card, Tooltip, Popconfirm, Row, Col, Input, Radio } from 'antd'
import { 
  DatabaseOutlined,
  CheckCircleOutlined,
  StopOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlay, faEye, faPause, faTrash, faTh, faList, faSync, faSearch, faPlus } from '@fortawesome/free-solid-svg-icons'
import { useNavigate } from 'react-router-dom'
import { configManager, TunnelConfig } from '../utils/config'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useLog } from '../context/LogContext'
import { useSettings } from '../context/SettingsContext'
import { useTunnel } from '../context/TunnelContext'

// const { Text } = Typography // 暂时不需要

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
      bodyStyle={{ padding: '16px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ 
            color: textColor === '#fff' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)', 
            fontSize: '13px', 
            marginBottom: '6px',
            fontWeight: '500'
          }}>
            {title}
          </div>
          <div style={{ 
            color: textColor, 
            fontSize: '28px', 
            fontWeight: 'bold',
            lineHeight: '1'
          }}>
            {value}
          </div>
        </div>
        <div style={{ 
          backgroundColor: iconBgColor,
          borderRadius: '50%',
          width: '42px',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.3s ease'
        }}>
          {React.cloneElement(icon as React.ReactElement, { 
            style: { fontSize: '20px', color: textColor } 
          })}
        </div>
      </div>
    </Card>
  )
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

interface TunnelManagementProps {
  // 移除 onRegisterRefresh 属性
}

const TunnelManagement: React.FC<TunnelManagementProps> = () => {
  const navigate = useNavigate()
  const { addLog } = useLog()
  const { isDarkMode } = useSettings()
  const { refreshTrigger } = useTunnel()
  const [tunnels, setTunnels] = useState<TunnelConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    running: 0,
    stopped: 0,
    error: 0
  })
  const [tunnelStartTimes, setTunnelStartTimes] = useState<Map<string, number>>(new Map())
  const [searchText, setSearchText] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')

  // 过滤隧道列表
  const filteredTunnels = tunnels.filter(tunnel => 
    tunnel.name.toLowerCase().includes(searchText.toLowerCase()) ||
    tunnel.tunnelAddr.toLowerCase().includes(searchText.toLowerCase()) ||
    tunnel.targetAddr.toLowerCase().includes(searchText.toLowerCase()) ||
    tunnel.mode.toLowerCase().includes(searchText.toLowerCase())
  )

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
      
      // 检测是否为致命错误 - 只检测 "ERROR Resolve failed"
      const isFatalError = isError && !isWithinStartupPeriod && (
        message.toLowerCase().includes('resolve failed')
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
  }, [])

  // 监听隧道状态变化
  useEffect(() => {
    let unlistenStatus: () => void;
    let unlistenAppLog: () => void;
    let unlistenAllStopped: () => void;
    let unlistenFatalError: () => void;

    // 监听致命错误事件
    listen('fatal-error-detected', async (event) => {
      const { tunnel_id, pid, error } = event.payload as any;
      console.log(`检测到致命错误: 隧道 ${tunnel_id} (PID: ${pid}) - ${error}`);
      
      try {
        // 调用后端处理致命错误
        await invoke('handle_fatal_error', {
          tunnelId: tunnel_id,
          processId: pid,
          errorMessage: error
        });
        
        addLog('error', `隧道 ${tunnel_id} 检测到致命错误并已自动停止: ${error}`, 'FatalErrorHandler');
      } catch (handleError) {
        console.error('处理致命错误失败:', handleError);
        addLog('error', `处理致命错误失败: ${handleError}`, 'FatalErrorHandler');
      }
    }).then(fn => {
      unlistenFatalError = fn;
    });

    // 监听隧道状态变化
    listen('tunnel-status-changed', async (event) => {
      const { tunnel_id, status, process_id, exit_code, error } = event.payload as any;
      console.log(`隧道状态变化: ${tunnel_id} -> ${status}`, { process_id, exit_code, error });
      
      try {
        // 更新配置文件中的隧道状态
        await configManager.updateTunnel(tunnel_id, { 
          status: status,
          processId: process_id || undefined
        });
        
        // 更新前端状态
        setTunnels(prev => prev.map(t => 
          t.id === tunnel_id 
            ? { ...t, status, processId: process_id || undefined }
            : t
        ));
        
        // 记录日志
        if (status === 'stopped') {
          if (exit_code !== undefined) {
            addLog('info', `隧道 ${tunnel_id} 已停止，退出码: ${exit_code}`, 'TunnelManagement');
          } else {
            addLog('info', `隧道 ${tunnel_id} 已停止`, 'TunnelManagement');
          }
        } else if (status === 'error') {
          addLog('error', `隧道 ${tunnel_id} 发生错误: ${error || '未知错误'}`, 'TunnelManagement');
        }
        
        // 重新加载隧道列表以确保状态同步
        loadTunnels();
      } catch (updateError) {
        console.error('更新隧道状态失败:', updateError);
        addLog('error', `更新隧道状态失败: ${updateError}`, 'TunnelManagement');
      }
    }).then(fn => {
      unlistenStatus = fn;
    });

    // 监听应用日志事件
    listen('app-log', (event) => {
      const { level, message, source } = event.payload as any;
      console.log(`[${source}] ${level.toUpperCase()}: ${message}`);
      addLog(level, message, source);
    }).then(fn => {
      unlistenAppLog = fn;
    });

    // 监听所有隧道停止事件
    listen('all-tunnels-stopped', async (event) => {
      const { message: logMessage, stopped_count } = event.payload as any;
      console.log(`所有隧道已停止: ${logMessage}, 停止数量: ${stopped_count}`);
      addLog('info', `${logMessage}, 停止数量: ${stopped_count}`, 'ExitHandler');
      
      // 更新所有隧道状态为已停止
      try {
        const currentTunnels = configManager.getTunnels();
        for (const tunnel of currentTunnels) {
          if (tunnel.status === 'running') {
            await configManager.updateTunnel(tunnel.id, { 
              status: 'stopped',
              processId: undefined
            });
          }
        }
        // 重新加载隧道列表以反映状态变化
        loadTunnels();
        addLog('info', '所有隧道状态已更新为已停止', 'TunnelManagement');
      } catch (error) {
        console.error('更新隧道状态失败:', error);
        addLog('error', `更新隧道状态失败: ${error}`, 'TunnelManagement');
      }
    }).then(fn => {
      unlistenAllStopped = fn;
    });

    return () => {
      unlistenStatus?.();
      unlistenAppLog?.();
      unlistenAllStopped?.();
      unlistenFatalError?.();
    };
  }, [addLog]);

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

    return () => {
      // 清理函数，如果有其他监听器需要清理，可以在这里添加
    }
  }, [tunnels])

  // 监听刷新触发器
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadTunnels()
    }
  }, [refreshTrigger])

  // 刷新隧道列表（带反馈）
  const handleRefresh = async () => {
    try {
      await loadTunnels()
      message.success('隧道列表已刷新')
    } catch (error) {
      message.error(`刷新失败: ${error}`)
    }
  }

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



  const getModeTag = (mode: string) => {
    switch (mode) {
      case 'server':
        return <Tag color="blue" style={{ margin: 0 }}>服务器</Tag>
      case 'client':
        return <Tag color="green" style={{ margin: 0 }}>客户端</Tag>
      case 'master':
        return <Tag color="purple" style={{ margin: 0 }}>主控</Tag>
      default:
        return <Tag style={{ margin: 0 }}>未知</Tag>
    }
  }

  // 添加查看日志的处理函数
  const handleViewLogs = (tunnel: TunnelConfig) => {
    console.log('导航到隧道详情页面:', `/tunnels/${tunnel.id}/details`)
    navigate(`/tunnels/${tunnel.id}/details`)
  }

  // 添加隧道 - 已在按钮中直接使用 navigate
  // const handleCreateTunnel = () => {
  //   console.log('导航到创建隧道页面')
  //   navigate('/tunnels/create')
  // }

  // 表格列配置
  const columns = [
    {
      title: (
        <div style={{ marginLeft: '8px' }}>
          隧道名称
        </div>
      ),
      dataIndex: 'name',
      key: 'name',
      width: 180,
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
              flexShrink: 0,
              marginLeft: '8px'
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
      title: '隧道地址',
      dataIndex: 'tunnelAddr',
      key: 'tunnelAddr',
      width: 160,
    },
    {
      title: '目标地址',
      dataIndex: 'targetAddr',
      key: 'targetAddr',
      width: 160,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (createdAt: string) => formatDateTime(createdAt),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, record: TunnelConfig) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              size="small"
              type="default"
              icon={<FontAwesomeIcon icon={faEye} />}
              onClick={() => handleViewLogs(record)}
              style={{ color: '#1890ff', borderColor: '#1890ff' }}
            />
          </Tooltip>
          
          {record.status === 'running' ? (
            <Tooltip title="停止隧道">
              <Button
                size="small"
                type="default"
                icon={<FontAwesomeIcon icon={faPause} />}
                onClick={() => handleStop(record)}
                style={{ 
                  color: '#faad14', 
                  borderColor: '#faad14'
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="启动隧道">
              <Button
                size="small"
                type="default"
                icon={<FontAwesomeIcon icon={faPlay} />}
                onClick={() => handleStart(record)}
                style={{ color: '#52c41a', borderColor: '#52c41a' }}
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
                type="default"
                icon={<FontAwesomeIcon icon={faTrash} />}
                style={{ 
                  color: '#ff4d4f', 
                  borderColor: '#ff4d4f'
                }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 统计卡片 - 减少间距 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
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

      {/* 搜索框和视图切换 */}
      <div style={{ 
        marginBottom: 16, 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        gap: 16
      }}>
        <Input
          placeholder="搜索隧道..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          prefix={<FontAwesomeIcon icon={faSearch} />}
          allowClear
          style={{ maxWidth: 400 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tooltip title="刷新隧道列表">
            <Button
              icon={<FontAwesomeIcon icon={faSync} />}
              onClick={handleRefresh}
              loading={loading}
            >
              刷新
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => navigate('/tunnels/create')}
            style={{
              backgroundColor: '#1890ff',
              borderColor: '#1890ff',
            }}
          >
            创建
          </Button>
          <Radio.Group 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="card">
              <FontAwesomeIcon icon={faTh} /> 
            </Radio.Button>
            <Radio.Button value="table">
              <FontAwesomeIcon icon={faList} /> 
            </Radio.Button>
          </Radio.Group>
        </div>
      </div>

      {/* 隧道列表 */}
      {viewMode === 'card' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <span>加载中...</span>
            </div>
          ) : filteredTunnels.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px',
              backgroundColor: isDarkMode ? '#1f1f1f' : '#fff',
              borderRadius: '8px',
              border: isDarkMode ? '1px solid #303030' : '1px solid #f0f0f0',
              color: isDarkMode ? '#d9d9d9' : '#000'
            }}>
              {searchText ? '未找到匹配的隧道' : '暂无隧道，点击右上角创建隧道'}
            </div>
          ) : (
            filteredTunnels.map((tunnel) => (
              <div
                key={tunnel.id}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '16px',
                  backgroundColor: isDarkMode ? '#1f1f1f' : '#fff',
                  borderRadius: '8px',
                  border: isDarkMode ? '1px solid #303030' : '1px solid #f0f0f0',
                  boxShadow: isDarkMode ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.15)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = isDarkMode ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {/* 左侧：隧道信息 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  {/* 状态圆点和隧道类型 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div 
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: 
                          tunnel.status === 'running' ? '#52c41a' :
                          tunnel.status === 'error' ? '#ff4d4f' : '#d9d9d9',
                        border: '2px solid #fff',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
                        cursor: 'help',
                        flexShrink: 0
                      }}
                      title={`状态: ${tunnel.status === 'running' ? '运行中' : tunnel.status === 'error' ? '错误' : '已停止'} | PID: ${tunnel.processId || '-'}`}
                    />
                    {getModeTag(tunnel.mode)}
                  </div>
                  
                  {/* 隧道信息 */}
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: 'bold', 
                      fontSize: '14px', 
                      marginBottom: '2px',
                      color: isDarkMode ? '#fff' : '#000'
                    }}>
                      {tunnel.name}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: isDarkMode ? '#999' : '#666'
                    }}>
                      {tunnel.mode}://{tunnel.tunnelAddr}/{tunnel.targetAddr}
                    </div>
                  </div>
                </div>

                {/* 右侧：操作按钮 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tooltip title="查看详情">
                    <Button
                      size="small"
                      type="default"
                      icon={<FontAwesomeIcon icon={faEye} />}
                      onClick={() => handleViewLogs(tunnel)}
                      style={{ color: '#1890ff', borderColor: '#1890ff' }}
                    />
                  </Tooltip>
                  
                  {tunnel.status === 'running' ? (
                    <Tooltip title="停止隧道">
                      <Button
                        size="small"
                        type="default"
                        icon={<FontAwesomeIcon icon={faPause} />}
                        onClick={() => handleStop(tunnel)}
                        style={{ 
                          color: '#faad14', 
                          borderColor: '#faad14'
                        }}
                      />
                    </Tooltip>
                  ) : (
                    <Tooltip title="启动隧道">
                      <Button
                        size="small"
                        type="default"
                        icon={<FontAwesomeIcon icon={faPlay} />}
                        onClick={() => handleStart(tunnel)}
                        style={{ color: '#52c41a', borderColor: '#52c41a' }}
                      />
                    </Tooltip>
                  )}
                  
                  <Popconfirm
                    title="确认删除"
                    description={`确定要删除隧道 "${tunnel.name}" 吗？此操作无法撤销。`}
                    onConfirm={() => handleDelete(tunnel)}
                    okText="确认删除"
                    cancelText="取消"
                    okType="danger"
                  >
                    <Tooltip title="删除隧道">
                      <Button
                        size="small"
                        type="default"
                        icon={<FontAwesomeIcon icon={faTrash} />}
                        style={{ 
                          color: '#ff4d4f', 
                          borderColor: '#ff4d4f'
                        }}
                      />
                    </Tooltip>
                  </Popconfirm>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={filteredTunnels}
          loading={loading}
          rowKey="id"
          pagination={false}
          size="middle"
          showHeader={true}
          style={{
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
          }}
        />
      )}
    </div>
  )
}

export default TunnelManagement 