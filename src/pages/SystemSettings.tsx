import React, { useState, useEffect } from 'react'
import { Card, Button, Tag, Space, Progress, Modal, message, Descriptions, Alert, Switch, Radio, Row, Col, Divider } from 'antd'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  GithubOutlined,
  SettingOutlined,
  BgColorsOutlined,
  AppstoreOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useSettings } from '../context/SettingsContext'

interface NodePassStatus {
  installed: boolean
  version?: string
  path?: string
  error?: string
}

interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  html_url: string
  assets: GitHubAsset[]
}

interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface DownloadProgress {
  status: 'started' | 'downloading' | 'completed' | 'error'
  progress?: number
  downloaded?: number
  total?: number
  message: string
  path?: string
}

const SystemSettings: React.FC = () => {
  const [nodePassStatus, setNodePassStatus] = useState<NodePassStatus | null>(null)
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  
  // 从Context获取设置
  const { isTopNav, setIsTopNav, theme, setTheme } = useSettings()

  useEffect(() => {
    // 监听下载进度
    const unlistenDownload = listen('download-progress', (event) => {
      const progress = event.payload as DownloadProgress
      setDownloadProgress(progress)
      
      if (progress.status === 'completed') {
        message.success('NodePass 下载完成！')
        setTimeout(() => {
          checkNodePassStatus()
          setShowDownloadModal(false)
        }, 1000)
      } else if (progress.status === 'error') {
        message.error(`下载失败: ${progress.message}`)
      }
    })

    // 初始检查状态
    checkNodePassStatus()

    return () => {
      unlistenDownload.then(fn => fn())
    }
  }, [])

  const checkNodePassStatus = async () => {
    setCheckingStatus(true)
    try {
      const status = await invoke<NodePassStatus>('check_nodepass_status')
      setNodePassStatus(status)
    } catch (error) {
      console.error('检查NodePass状态失败:', error)
      setNodePassStatus({
        installed: false,
        error: `检查失败: ${error}`
      })
    } finally {
      setCheckingStatus(false)
    }
  }

  const fetchLatestRelease = async () => {
    try {
      message.loading('正在获取最新版本信息...', 1)
      const release = await invoke<GitHubRelease>('get_latest_release')
      setLatestRelease(release)
      setShowDownloadModal(true)
    } catch (error) {
      message.error(`获取最新版本失败: ${error}`)
    }
  }

  const downloadNodePass = async (asset: GitHubAsset) => {
    try {
      setDownloadProgress({
        status: 'started',
        message: '准备下载...'
      })
      
      await invoke('download_nodepass', {
        downloadUrl: asset.browser_download_url,
        filename: asset.name
      })
    } catch (error) {
      setDownloadProgress({
        status: 'error',
        message: `下载失败: ${error}`
      })
    }
  }

  const getStatusTag = (status: NodePassStatus) => {
    if (status.installed) {
      return <Tag color="success" icon={<CheckCircleOutlined />}>已安装</Tag>
    } else {
      return <Tag color="error" icon={<ExclamationCircleOutlined />}>未安装</Tag>
    }
  }

  const handleNavModeChange = (checked: boolean) => {
    setIsTopNav(checked)
    message.success(`已切换为${checked ? '顶部' : '侧边'}导航模式`)
  }

  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    setTheme(value)
    message.success(`主题已切换为${value === 'light' ? '浅色' : value === 'dark' ? '深色' : '跟随系统'}模式`)
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>系统设置</h1>

      <Row gutter={[24, 24]}>
        {/* 左侧：NodePass 设置 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <SettingOutlined />
                <span>NodePass 设置</span>
              </Space>
            }
            extra={
              <Button 
                icon={<ReloadOutlined />} 
                onClick={checkNodePassStatus}
                loading={checkingStatus}
                size="small"
              >
                刷新状态
              </Button>
            }
          >
            {nodePassStatus ? (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <Space>
                    <span>安装状态:</span>
                    {getStatusTag(nodePassStatus)}
                  </Space>
                </div>

                {nodePassStatus.installed && (
                  <Descriptions column={1} bordered size="small">
                    {nodePassStatus.version && (
                      <Descriptions.Item label="版本">
                        <code>{nodePassStatus.version}</code>
                      </Descriptions.Item>
                    )}
                    {nodePassStatus.path && (
                      <Descriptions.Item label="路径">
                        <code style={{ fontSize: '12px' }}>{nodePassStatus.path}</code>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                )}

                {nodePassStatus.error && (
                  <Alert
                    type="error"
                    message="错误信息"
                    description={nodePassStatus.error}
                    style={{ marginTop: 16 }}
                  />
                )}

                {!nodePassStatus.installed && (
                  <div style={{ marginTop: 16 }}>
                    <Alert
                      type="warning"
                      message="NodePass 未安装"
                      description="请下载并安装 NodePass 以使用隧道功能。"
                      action={
                        <Button 
                          type="primary" 
                          icon={<DownloadOutlined />}
                          onClick={fetchLatestRelease}
                          size="small"
                        >
                          获取最新版本
                        </Button>
                      }
                    />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <span>正在检查 NodePass 状态...</span>
              </div>
            )}
          </Card>
        </Col>

        {/* 右侧：主题设置 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <BgColorsOutlined />
                <span>主题设置</span>
              </Space>
            }
          >
            <div>
              {/* 导航栏模式设置 */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 12, fontWeight: 'bold' }}>
                  <Space>
                    <AppstoreOutlined />
                    <span>导航栏模式</span>
                  </Space>
                </div>
                <div style={{ marginLeft: 20 }}>
                  <Space align="center">
                    <span>侧边导航</span>
                    <Switch
                      checked={isTopNav}
                      onChange={handleNavModeChange}
                      checkedChildren="顶部"
                      unCheckedChildren="侧边"
                    />
                    <span>顶部导航</span>
                  </Space>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: 8 }}>
                    {isTopNav ? '使用顶部横向导航栏' : '使用左侧垂直导航栏'}
                  </div>
                </div>
              </div>

              <Divider style={{ margin: '16px 0' }} />

              {/* 主题模式设置 */}
              <div>
                <div style={{ marginBottom: 12, fontWeight: 'bold' }}>
                  <Space>
                    <BgColorsOutlined />
                    <span>主题模式</span>
                  </Space>
                </div>
                <div style={{ marginLeft: 20 }}>
                  <Radio.Group 
                    value={theme} 
                    onChange={(e) => handleThemeChange(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Radio value="light">
                        <Space>
                          <SunOutlined style={{ color: '#faad14' }} />
                          <span>浅色主题</span>
                        </Space>
                      </Radio>
                      <Radio value="dark">
                        <Space>
                          <MoonOutlined style={{ color: '#1890ff' }} />
                          <span>深色主题</span>
                        </Space>
                      </Radio>
                      <Radio value="system">
                        <Space>
                          <DesktopOutlined style={{ color: '#52c41a' }} />
                          <span>跟随系统</span>
                        </Space>
                      </Radio>
                    </Space>
                  </Radio.Group>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: 8 }}>
                    {theme === 'light' && '使用浅色主题'}
                    {theme === 'dark' && '使用深色主题（开发中）'}
                    {theme === 'system' && '根据系统设置自动切换主题（开发中）'}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 下载对话框 */}
      <Modal
        title={`下载 NodePass ${latestRelease?.tag_name || ''}`}
        open={showDownloadModal}
        onCancel={() => setShowDownloadModal(false)}
        footer={null}
        width={600}
      >
        {latestRelease && (
          <div>
            <Descriptions column={1} bordered style={{ marginBottom: 20 }}>
              <Descriptions.Item label="版本">{latestRelease.name}</Descriptions.Item>
              <Descriptions.Item label="发布时间">
                {new Date(latestRelease.published_at).toLocaleDateString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="GitHub 页面">
                <Button 
                  type="link" 
                  icon={<GithubOutlined />}
                  href={latestRelease.html_url}
                  target="_blank"
                >
                  查看发布页面
                </Button>
              </Descriptions.Item>
            </Descriptions>

            <div>
              <h4>可用下载:</h4>
              {latestRelease.assets
                .filter(asset => asset.name.includes('windows') || asset.name.includes('win'))
                .map((asset, index) => (
                  <Card 
                    key={index} 
                    size="small" 
                    style={{ marginBottom: 10 }}
                    extra={
                      <Button 
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={() => downloadNodePass(asset)}
                        disabled={downloadProgress?.status === 'downloading'}
                      >
                        下载
                      </Button>
                    }
                  >
                    <div>
                      <strong>{asset.name}</strong>
                      <br />
                      <small>大小: {(asset.size / 1024 / 1024).toFixed(2)} MB</small>
                    </div>
                  </Card>
                ))}
            </div>

            {/* 下载进度 */}
            {downloadProgress && (
              <Card title="下载进度" style={{ marginTop: 20 }}>
                <div style={{ marginBottom: 10 }}>
                  <span>{downloadProgress.message}</span>
                  {downloadProgress.status === 'downloading' && downloadProgress.progress && (
                    <span style={{ float: 'right' }}>{downloadProgress.progress}%</span>
                  )}
                </div>
                
                {downloadProgress.status === 'downloading' && downloadProgress.progress && (
                  <Progress 
                    percent={downloadProgress.progress} 
                    status="active"
                    strokeColor="#131B2C"
                  />
                )}
                
                {downloadProgress.downloaded && downloadProgress.total && (
                  <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                    {(downloadProgress.downloaded / 1024 / 1024).toFixed(2)} MB / 
                    {(downloadProgress.total / 1024 / 1024).toFixed(2)} MB
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default SystemSettings 