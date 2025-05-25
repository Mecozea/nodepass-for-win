import React, { useState, useEffect } from 'react'
import { Table, Button, Tag, Space, Modal, message, Card } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

interface TunnelItem {
  id: string
  name: string
  mode: 'server' | 'client' | 'master'
  command: string
  status: 'running' | 'stopped' | 'error'
  protocol: 'TCP' | 'UDP'
  tunnelAddr: string
  targetAddr: string
  createdAt: string
  processId?: number
}

const TunnelManagement: React.FC = () => {
  const navigate = useNavigate()
  const [tunnels, setTunnels] = useState<TunnelItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTunnels()
  }, [])

  const loadTunnels = async () => {
    setLoading(true)
    try {
      // 模拟数据，后续从API获取
      const mockData: TunnelItem[] = [
        {
          id: '1',
          name: 'web-server-tunnel',
          mode: 'server',
          command: 'server://0.0.0.0:10101/127.0.0.1:8080?tls=1&log=info',
          status: 'running',
          protocol: 'TCP',
          tunnelAddr: '0.0.0.0:10101',
          targetAddr: '127.0.0.1:8080',
          createdAt: '2024-01-15 10:30:00',
          processId: 12345,
        },
        {
          id: '2',
          name: 'api-tunnel',
          mode: 'client',
          command: 'client://api.example.com:10101/127.0.0.1:3000?log=info',
          status: 'running',
          protocol: 'TCP',
          tunnelAddr: 'api.example.com:10101',
          targetAddr: '127.0.0.1:3000',
          createdAt: '2024-01-15 09:15:00',
          processId: 12346,
        },
        {
          id: '3',
          name: 'db-tunnel',
          mode: 'client',
          command: 'client://db.example.com:10101/127.0.0.1:5432?log=debug',
          status: 'error',
          protocol: 'TCP',
          tunnelAddr: 'db.example.com:10101',
          targetAddr: '127.0.0.1:5432',
          createdAt: '2024-01-15 08:45:00',
        },
        {
          id: '4',
          name: 'test-tunnel',
          mode: 'server',
          command: 'server://0.0.0.0:10102/127.0.0.1:9000?tls=0&log=info',
          status: 'stopped',
          protocol: 'TCP',
          tunnelAddr: '0.0.0.0:10102',
          targetAddr: '127.0.0.1:9000',
          createdAt: '2024-01-14 16:20:00',
        },
      ]
      setTunnels(mockData)
    } catch (error) {
      message.error('加载隧道列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async (tunnel: TunnelItem) => {
    try {
      message.loading(`正在启动隧道 ${tunnel.name}...`, 1)
      // 调用后端API启动隧道
      // await invoke('start_tunnel', { tunnelId: tunnel.id })
      
      // 更新本地状态
      setTunnels(prev => prev.map(item => 
        item.id === tunnel.id 
          ? { ...item, status: 'running', processId: Math.floor(Math.random() * 99999) }
          : item
      ))
      message.success(`隧道 ${tunnel.name} 启动成功`)
    } catch (error) {
      message.error(`启动隧道失败: ${error}`)
    }
  }

  const handleStop = async (tunnel: TunnelItem) => {
    try {
      message.loading(`正在停止隧道 ${tunnel.name}...`, 1)
      // 调用后端API停止隧道
      // await invoke('stop_tunnel', { tunnelId: tunnel.id })
      
      // 更新本地状态
      setTunnels(prev => prev.map(item => 
        item.id === tunnel.id 
          ? { ...item, status: 'stopped', processId: undefined }
          : item
      ))
      message.success(`隧道 ${tunnel.name} 已停止`)
    } catch (error) {
      message.error(`停止隧道失败: ${error}`)
    }
  }

  const handleDelete = (tunnel: TunnelItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除隧道 "${tunnel.name}" 吗？此操作无法撤销。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          // 如果隧道正在运行，先停止
          if (tunnel.status === 'running') {
            await handleStop(tunnel)
          }
          
          // 删除隧道
          setTunnels(prev => prev.filter(item => item.id !== tunnel.id))
          message.success(`隧道 ${tunnel.name} 已删除`)
        } catch (error) {
          message.error(`删除隧道失败: ${error}`)
        }
      },
    })
  }

  const showLogs = (tunnel: TunnelItem) => {
    // TODO: 实现日志查看功能
    message.info(`查看隧道 ${tunnel.name} 的日志`)
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

  const columns: ColumnsType<TunnelItem> = [
    {
      title: '隧道名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (mode) => getModeTag(mode),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => getStatusTag(status),
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 80,
    },
    {
      title: '隧道地址',
      dataIndex: 'tunnelAddr',
      key: 'tunnelAddr',
      width: 150,
    },
    {
      title: '目标地址',
      dataIndex: 'targetAddr',
      key: 'targetAddr',
      width: 150,
    },
    {
      title: '进程ID',
      dataIndex: 'processId',
      key: 'processId',
      width: 100,
      render: (processId) => processId || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => showLogs(record)}
          >
            日志
          </Button>
          
          {record.status === 'running' ? (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => handleStop(record)}
            >
              停止
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleStart(record)}
            >
              启动
            </Button>
          )}
          
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>隧道管理</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/tunnels/create')}
        >
          创建隧道
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={tunnels}
          loading={loading}
          rowKey="id"
          pagination={{
            total: tunnels.length,
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  )
}

export default TunnelManagement 