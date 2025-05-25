import React from 'react'
import { Modal, List, Tag, Button, Select, Space, Typography, Empty } from 'antd'
import { DeleteOutlined, FilterOutlined } from '@ant-design/icons'
import { useLog, LogLevel, LogEntry } from '../context/LogContext'

const { Text } = Typography

interface LogViewerProps {
  open: boolean
  onClose: () => void
}

const LogViewer: React.FC<LogViewerProps> = ({ open, onClose }) => {
  const { filteredLogs, clearLogs, filterLevel, setFilterLevel } = useLog()

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'red'
      case 'warn': return 'orange'
      case 'info': return 'blue'
      case 'debug': return 'gray'
      default: return 'default'
    }
  }

  const formatTime = (timestamp: Date) => {
    const timeStr = timestamp.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    const ms = timestamp.getMilliseconds().toString().padStart(3, '0')
    return `${timeStr}.${ms}`
  }

  return (
    <Modal
      title="应用日志"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      style={{ top: 20 }}
      bodyStyle={{ 
        maxHeight: 'calc(100vh - 200px)', 
        overflowY: 'auto',
        padding: '16px'
      }}
    >
      {/* 工具栏 */}
      <div style={{ 
        marginBottom: 16, 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Space>
          <FilterOutlined />
          <Text>级别筛选:</Text>
          <Select
            value={filterLevel}
            onChange={setFilterLevel}
            style={{ width: 120 }}
            size="small"
          >
            <Select.Option value="all">全部</Select.Option>
            <Select.Option value="error">错误</Select.Option>
            <Select.Option value="warn">警告</Select.Option>
            <Select.Option value="info">信息</Select.Option>
            <Select.Option value="debug">调试</Select.Option>
          </Select>
          <Text type="secondary">
            共 {filteredLogs.length} 条日志
          </Text>
        </Space>
        
        <Button 
          icon={<DeleteOutlined />} 
          onClick={clearLogs}
          size="small"
          danger
        >
          清空日志
        </Button>
      </div>

      {/* 日志列表 */}
      {filteredLogs.length === 0 ? (
        <Empty 
          description="暂无日志"
          style={{ margin: '40px 0' }}
        />
      ) : (
        <List
          dataSource={filteredLogs}
          renderItem={(log: LogEntry) => (
            <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ width: '100%' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: 4,
                  gap: 8
                }}>
                  <Text 
                    type="secondary" 
                    style={{ 
                      fontSize: '12px',
                      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                      minWidth: '80px'
                    }}
                  >
                    {formatTime(log.timestamp)}
                  </Text>
                  <Tag 
                    color={getLevelColor(log.level)}
                    style={{ 
                      fontSize: '11px',
                      minWidth: '50px',
                      textAlign: 'center',
                      margin: 0
                    }}
                  >
                    {log.level.toUpperCase()}
                  </Tag>
                  {log.source && (
                    <Tag 
                      color="default"
                      style={{ 
                        fontSize: '11px',
                        margin: 0
                      }}
                    >
                      {log.source}
                    </Tag>
                  )}
                </div>
                <div style={{ 
                  fontSize: '13px',
                  lineHeight: '1.4',
                  wordBreak: 'break-word',
                  fontFamily: log.level === 'error' ? 'Monaco, Menlo, "Ubuntu Mono", monospace' : 'inherit'
                }}>
                  {log.message}
                </div>
              </div>
            </List.Item>
          )}
          style={{ maxHeight: '400px', overflowY: 'auto' }}
        />
      )}
    </Modal>
  )
}

export default LogViewer 