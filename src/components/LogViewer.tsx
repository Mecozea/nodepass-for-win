import React, { useEffect, useRef } from 'react'
import { Modal, Button } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import AnsiToHtml from 'ansi-to-html'
import { useLog } from '../context/LogContext'

interface LogViewerProps {
  open: boolean
  onClose: () => void
  logs: string[]
  containerRef?: React.RefObject<HTMLDivElement>
}

const LogViewer: React.FC<LogViewerProps> = ({ open, onClose, logs, containerRef }) => {
  const { clearLogs } = useLog()
  const logContainerRef = useRef<HTMLDivElement>(null)
  const ansiConverter = useRef(new AnsiToHtml({
    fg: '#d4d4d4',
    bg: '#1e1e1e',
    newline: true,
    escapeXML: true,
    colors: {
      0: '#000000',
      1: '#ff0000',
      2: '#00ff00',
      3: '#ffff00',
      4: '#0000ff',
      5: '#ff00ff',
      6: '#00ffff',
      7: '#ffffff',
      8: '#808080',
      9: '#ff8080',
      10: '#80ff80',
      11: '#ffff80',
      12: '#8080ff',
      13: '#ff80ff',
      14: '#80ffff',
      15: '#ffffff'
    }
  }))

  // 自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  return (
    <Modal
      title="应用日志"
      open={open}
      onCancel={onClose}
      footer={[
        <Button 
          key="clear" 
          icon={<DeleteOutlined />} 
          onClick={clearLogs}
          danger
        >
          清空日志
        </Button>,
        <Button key="close" onClick={onClose}>
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
          height: '500px',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: '12px',
          padding: '16px',
          borderRadius: '4px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}
      >
        {logs.map((log, index) => (
          <div 
            key={index}
            style={{ 
              padding: '2px 0',
              lineHeight: '1.4'
            }}
          >
            <span style={{ color: '#888', marginRight: '8px' }}>
              [{String(index + 1).padStart(3, '0')}]
            </span>
            <span dangerouslySetInnerHTML={{ 
              __html: ansiConverter.current.toHtml(log)
            }} />
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default LogViewer 