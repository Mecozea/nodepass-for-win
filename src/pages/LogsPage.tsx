import React, { useState, useEffect } from 'react'
import { Card, List, Tag, Button, Select, Space, Typography, Empty, Input, message } from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFilter, faSearch, faDownload, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useLog, LogLevel, LogEntry } from '../context/LogContext'

const { Text, Title } = Typography
const { Search } = Input

interface LogsPageProps {
  // 移除 onRegisterRefresh 属性
}

const LogsPage: React.FC<LogsPageProps> = () => {
  const { filteredLogs, clearLogs, filterLevel, setFilterLevel, logs } = useLog()
  const [searchText, setSearchText] = useState('')

  // 刷新日志页面的函数
  const refreshLogs = () => {
    // 这里可以添加刷新日志的逻辑，比如重新获取日志等
    // 目前日志是实时更新的，所以刷新操作可以是清空搜索或重置筛选
    setSearchText('')
    setFilterLevel('all')
  }

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'red'
      case 'warn': return 'orange'
      case 'info': return 'blue'
      case 'debug': return 'gray'
      default: return 'default'
    }
  }

  const formatDateTime = (timestamp: Date) => {
    return timestamp.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-')
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 工具栏 */}
        <div style={{ 
          marginBottom: 16, 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          flexShrink: 0
        }}>
          <Space wrap>
            <FontAwesomeIcon icon={faFilter} />
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
              prefix={<FontAwesomeIcon icon={faSearch} />}
            />
          </Space>
          
          <Space>
            <Text type="secondary">
              显示 {displayLogs.length} / {logs.length} 条日志
            </Text>
            <Button 
              icon={<FontAwesomeIcon icon={faDownload} />} 
              onClick={exportLogs}
              size="small"
              disabled={displayLogs.length === 0}
            >
              导出
            </Button>
            <Button 
              icon={<FontAwesomeIcon icon={faTrash} />} 
              onClick={clearLogs}
              size="small"
              danger
            >
              清空日志
            </Button>
          </Space>
        </div>

        {/* 日志列表容器 */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
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
                      gap: 8,
                      flexWrap: 'wrap'
                    }}>
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
                      <Text 
                        type="secondary" 
                        style={{ 
                          fontSize: '11px',
                          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
                        }}
                      >
                        {formatDateTime(log.timestamp)}
                      </Text>
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
                      <span style={{ 
                        fontSize: '13px',
                        lineHeight: '1.5',
                        wordBreak: 'break-word',
                        fontFamily: log.level === 'error' ? 'Monaco, Menlo, "Ubuntu Mono", monospace' : 'inherit'
                      }}>
                        {log.message}
                      </span>
                    </div>
                  </div>
                </List.Item>
              )}
              style={{ 
                height: '100%', 
                overflowY: 'auto',
                paddingRight: '8px' // 为滚动条留出空间
              }}
            />
          )}
        </div>
      </Card>
    </div>
  )
}

export default LogsPage 