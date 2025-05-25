import React, { useState } from 'react'
import { Card, List, Tag, Button, Select, Space, Typography, Empty, Input, message } from 'antd'
import { DeleteOutlined, FilterOutlined, FileTextOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useLog, LogLevel, LogEntry } from '../context/LogContext'

const { Text, Title } = Typography
const { Search } = Input

const LogsPage: React.FC = () => {
  const { filteredLogs, clearLogs, filterLevel, setFilterLevel, logs } = useLog()
  const [searchText, setSearchText] = useState('')

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

  const formatDate = (timestamp: Date) => {
    return timestamp.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  // 导出日志功能
  const exportLogs = () => {
    try {
      const logsToExport = searchText ? 
        filteredLogs.filter(log => 
          log.message.toLowerCase().includes(searchText.toLowerCase()) ||
          (log.source && log.source.toLowerCase().includes(searchText.toLowerCase()))
        ) : filteredLogs

      const logContent = logsToExport.map(log => 
        `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.source ? `[${log.source}] ` : ''}${log.message}`
      ).join('\n')

      const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `nodepass-logs-${new Date().toISOString().split('T')[0]}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      message.success(`已导出 ${logsToExport.length} 条日志`)
    } catch (error) {
      message.error('导出日志失败')
      console.error('导出日志错误:', error)
    }
  }

  // 搜索过滤
  const displayLogs = searchText ? 
    filteredLogs.filter(log => 
      log.message.toLowerCase().includes(searchText.toLowerCase()) ||
      (log.source && log.source.toLowerCase().includes(searchText.toLowerCase()))
    ) : filteredLogs

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        应用日志
      </Title>

      <Card>
        {/* 工具栏 */}
        <div style={{ 
          marginBottom: 16, 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <Space wrap>
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
            
            <Search
              placeholder="搜索日志内容..."
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              size="small"
              prefix={<SearchOutlined />}
            />
          </Space>
          
          <Space>
            <Text type="secondary">
              显示 {displayLogs.length} / {logs.length} 条日志
            </Text>
            <Button 
              icon={<DownloadOutlined />} 
              onClick={exportLogs}
              size="small"
              disabled={displayLogs.length === 0}
            >
              导出
            </Button>
            <Button 
              icon={<DeleteOutlined />} 
              onClick={clearLogs}
              size="small"
              danger
            >
              清空日志
            </Button>
          </Space>
        </div>

        {/* 日志列表 */}
        {displayLogs.length === 0 ? (
          <Empty 
            description={searchText ? "未找到匹配的日志" : "暂无日志"}
            style={{ margin: '40px 0' }}
          />
        ) : (
          <List
            dataSource={displayLogs}
            renderItem={(log: LogEntry) => (
              <List.Item style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ width: '100%' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: 6,
                    gap: 8
                  }}>
                    <Text 
                      type="secondary" 
                      style={{ 
                        fontSize: '11px',
                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                        minWidth: '70px'
                      }}
                    >
                      {formatDate(log.timestamp)}
                    </Text>
                    <Text 
                      type="secondary" 
                      style={{ 
                        fontSize: '12px',
                        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                        minWidth: '90px'
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
                    lineHeight: '1.5',
                    wordBreak: 'break-word',
                    fontFamily: log.level === 'error' ? 'Monaco, Menlo, "Ubuntu Mono", monospace' : 'inherit',
                    paddingLeft: '168px'
                  }}>
                    {log.message}
                  </div>
                </div>
              </List.Item>
            )}
            style={{ maxHeight: '70vh', overflowY: 'auto' }}
          />
        )}
      </Card>
    </div>
  )
}

export default LogsPage 