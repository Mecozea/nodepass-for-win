import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic } from 'antd'
import {
  DatabaseOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'

interface TunnelStats {
  total: number
  running: number
  stopped: number
  error: number
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<TunnelStats>({
    total: 0,
    running: 0,
    stopped: 0,
    error: 0,
  })

  useEffect(() => {
    // 模拟数据，后续可以从API获取
    setStats({
      total: 8,
      running: 3,
      stopped: 4,
      error: 1,
    })
  }, [])

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>仪表盘</h1>
      
      {/* 状态卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总实例"
              value={stats.total}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#131B2C' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="运行中"
              value={stats.running}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#28a745' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已停止"
              value={stats.stopped}
              prefix={<PauseCircleOutlined />}
              valueStyle={{ color: '#6c757d' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="错误"
              value={stats.error}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: '#dc3545' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard 