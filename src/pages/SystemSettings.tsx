import React, { useState, useEffect, useRef } from 'react'
import { Card, Button, Tag, Space, Modal, message, Alert, Switch, Radio, Divider } from 'antd'
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
  RightOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useSettings } from '../context/SettingsContext'
import { useLog } from '../context/LogContext'

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
  status: 'started' | 'downloading' | 'extracting' | 'completed' | 'error'
  progress?: number
  downloaded?: number
  total?: number
  message: string
  path?: string
}

// 设置项组件
const SettingItem: React.FC<{
  label: string
  children: React.ReactNode
  description?: string
}> = ({ label, children, description }) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #f0f0f0'
  }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 500, marginBottom: description ? 4 : 0 }}>
        {label}
      </div>
      {description && (
        <div style={{ fontSize: '12px', color: '#666' }}>
          {description}
        </div>
      )}
    </div>
    <div style={{ marginLeft: 16 }}>
      {children}
    </div>
  </div>
)

const SystemSettings: React.FC = () => {
  const [nodePassStatus, setNodePassStatus] = useState<NodePassStatus | null>(null)
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  
  // 从Context获取设置和日志
  const { settings, updateSettings, theme, setTheme, isTopNav, setIsTopNav } = useSettings()
  const { addLog } = useLog()

  // 瀑布流布局相关
  const containerRef = useRef<HTMLDivElement>(null)
  const [columnHeights, setColumnHeights] = useState([0, 0])

  useEffect(() => {
    // 监听下载进度
    const unlistenDownload = listen('download-progress', (event) => {
      const progress = event.payload as DownloadProgress
      setDownloadProgress(progress)
      
      if (progress.status === 'completed') {
        message.success('NodePass 安装完成！')
        addLog('info', 'NodePass 核心安装完成', 'SystemSettings')
        setTimeout(() => {
          checkNodePassStatus()
          setShowDownloadModal(false)
        }, 1000)
      } else if (progress.status === 'error') {
        // 错误信息只记录到日志，不显示在前端
        addLog('error', `NodePass 下载失败: ${progress.message}`, 'SystemSettings')
        console.error('下载失败:', progress.message)
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
      addLog('info', '开始获取 NodePass 最新版本信息', 'SystemSettings')
      const release = await invoke<GitHubRelease>('get_latest_release')
      setLatestRelease(release)
      setShowDownloadModal(true)
      addLog('info', `获取到最新版本: ${release.tag_name}`, 'SystemSettings')
    } catch (error) {
      const errorMsg = `获取最新版本失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'SystemSettings')
    }
  }

  const downloadNodePass = async (asset: GitHubAsset) => {
    try {
      addLog('info', `开始下载 NodePass: ${asset.name}`, 'SystemSettings')
      setDownloadProgress({
        status: 'started',
        message: '准备下载...'
      })
      
      console.log('调用下载函数，参数:', {
        downloadUrl: asset.browser_download_url,
        filename: asset.name
      })
      
      // 使用Promise包装invoke调用，确保错误被正确捕获
      const result = await new Promise((resolve, reject) => {
        invoke('download_nodepass', {
          downloadUrl: asset.browser_download_url,
          filename: asset.name
        })
        .then(resolve)
        .catch(reject)
      })
      
      console.log('下载函数调用成功:', result)
      addLog('info', '下载完成', 'SystemSettings')
      
      // 下载成功后重新检测核心状态
      setTimeout(() => {
        checkNodePassStatus()
      }, 1000)
      
    } catch (error: any) {
      const errorMsg = `下载失败: ${error?.message || error || '未知错误'}`
      console.error('下载函数调用失败:', error)
      addLog('error', errorMsg, 'SystemSettings')
      setDownloadProgress({
        status: 'error',
        message: errorMsg
      })
      
      // 确保错误不会导致应用崩溃
      try {
        message.error('下载失败，请查看日志获取详细信息')
      } catch (msgError) {
        console.error('显示错误消息失败:', msgError)
      }
    }
  }

  const getStatusTag = (status: NodePassStatus) => {
    if (status.installed) {
      return <Tag color="success" icon={<CheckCircleOutlined />}>已安装</Tag>
    } else {
      return <Tag color="error" icon={<ExclamationCircleOutlined />}>未安装</Tag>
    }
  }

  const handleThemeChange = async (value: 'light' | 'dark' | 'auto') => {
    try {
      await setTheme(value)
      message.success(`主题已切换为${value === 'light' ? '浅色' : value === 'dark' ? '深色' : '跟随系统'}模式`)
    } catch (error) {
      message.error('主题切换失败')
      console.error('主题切换失败:', error)
    }
  }

  const handleNavModeChange = (checked: boolean) => {
    setIsTopNav(checked)
    message.success(`导航栏模式已切换为${checked ? '顶部' : '侧边'}模式`)
  }

  // 瀑布流布局计算
  const getColumnStyle = (columnIndex: number) => ({
    width: 'calc(50% - 12px)',
    display: 'inline-block',
    verticalAlign: 'top',
    marginRight: columnIndex === 0 ? '24px' : '0'
  })

  // 检查核心状态时，如果未安装则自动获取最新版本信息
  const handleCoreStatusClick = async () => {
    if (!nodePassStatus?.installed) {
      await fetchLatestRelease()
    }
  }

  // 获取适合当前系统的下载包
  const getSystemAppropriateAsset = (assets: GitHubAsset[]) => {
    // 优先查找 windows amd64 版本
    const windowsAssets = assets.filter(asset => 
      asset.name.includes('windows') && asset.name.includes('amd64')
    );
    
    if (windowsAssets.length > 0) {
      return windowsAssets[0];
    }
    
    // 如果没找到，查找任何 windows 版本
    const anyWindowsAssets = assets.filter(asset => 
      asset.name.includes('windows') || asset.name.includes('win')
    );
    
    return anyWindowsAssets.length > 0 ? anyWindowsAssets[0] : null;
  }

  // 测试网络连接
  const testNetworkConnection = async () => {
    try {
      addLog('info', '开始测试网络连接', 'SystemSettings')
      message.loading('正在测试网络连接...', 2)
      
      const result = await invoke<string>('test_network_connection', {
        url: 'https://api.github.com/repos/yosebyte/nodepass/releases/latest'
      })
      
      message.success(`网络测试成功: ${result}`)
      addLog('info', `网络测试成功: ${result}`, 'SystemSettings')
    } catch (error) {
      const errorMsg = `网络测试失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'SystemSettings')
    }
  }

  // 下载适合系统的包
  const downloadSystemAppropriate = () => {
    try {
      if (!latestRelease) {
        console.error('没有最新版本信息')
        return
      }
      
      console.log('开始选择适合系统的下载包')
      const asset = getSystemAppropriateAsset(latestRelease.assets)
      
      if (asset) {
        console.log('找到适合的下载包:', asset)
        downloadNodePass(asset)
      } else {
        console.error('未找到适合当前系统的下载包')
        message.error('未找到适合当前系统的下载包')
      }
    } catch (error) {
      console.error('downloadSystemAppropriate 函数错误:', error)
      addLog('error', `选择下载包失败: ${error}`, 'SystemSettings')
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>系统设置</h1>

      <div ref={containerRef} style={{ position: 'relative' }}>
        {/* 左列 */}
        <div style={getColumnStyle(0)}>
          {/* NodePass 设置 */}
          <Card 
            title={
              <Space>
                <SettingOutlined />
                <span>NodePass 核心</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <div style={{ padding: '0 8px' }}>
              <SettingItem 
                label="核心状态"
                description="NodePass 核心执行文件状态"
              >
                <Space>
                  {nodePassStatus ? (
                    nodePassStatus.installed ? (
                      // 已安装：显示版本号按钮，点击跳转到目录
                      <Button 
                        type="text" 
                        size="small"
                        onClick={async () => {
                          try {
                            const path = nodePassStatus.path!;
                            const directory = path.substring(0, path.lastIndexOf('\\'));
                            await invoke('open_directory', { path: directory });
                          } catch (error) {
                            message.error('打开目录失败');
                            console.error('打开目录错误:', error);
                          }
                        }}
                        style={{ 
                          color: '#52c41a',
                          backgroundColor: '#f6ffed',
                          border: '1px solid #b7eb8f',
                          borderRadius: '4px',
                          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                          fontSize: '12px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          height: 'auto',
                          lineHeight: '1.2'
                        }}
                      >
                        {nodePassStatus.version || 'v?.?.?'}
                      </Button>
                    ) : (
                      // 未安装：显示未安装按钮，点击打开GitHub发布页面
                      <Button 
                        type="text" 
                        size="small"
                        onClick={handleCoreStatusClick}
                        style={{ color: '#ff4d4f' }}
                      >
                        未安装
                      </Button>
                    )
                  ) : (
                    <Tag>检测中...</Tag>
                  )}
                  <Button 
                    icon={<ReloadOutlined />} 
                    onClick={checkNodePassStatus}
                    loading={checkingStatus}
                    size="small"
                    type="text"
                  />
                </Space>
              </SettingItem>

              {nodePassStatus?.path && (
                <SettingItem 
                  label="文件路径"
                  description={
                    nodePassStatus.path.includes('resources') ? '应用资源目录' :
                    nodePassStatus.path.includes('nodepass-gui') ? '开发目录' : '系统PATH'
                  }
                >
                  <Button 
                    type="text" 
                    icon={<RightOutlined />}
                    size="small"
                    onClick={async () => {
                      try {
                        const path = nodePassStatus.path!;
                        const directory = path.substring(0, path.lastIndexOf('\\'));
                        // 使用系统命令打开目录
                        await invoke('open_directory', { path: directory });
                      } catch (error) {
                        message.error('打开目录失败');
                        console.error('打开目录错误:', error);
                      }
                    }}
                  >
                    打开目录
                  </Button>
                </SettingItem>
              )}

              {nodePassStatus?.error && (
                <div style={{ marginTop: 16 }}>
                  <Alert
                    type="error"
                    message="检测错误"
                    description={nodePassStatus.error}
                    showIcon
                  />
                </div>
              )}
            </div>
          </Card>

          {/* 主题设置 */}
          <Card 
            title={
              <Space>
                <BgColorsOutlined />
                <span>主题设置</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <div style={{ padding: '0 8px' }}>
              <SettingItem 
                label="主题模式"
                description={
                  theme === 'light' ? '使用浅色主题' :
                  theme === 'dark' ? '使用深色主题' : 
                  '根据系统设置自动切换主题'
                }
              >
                <Radio.Group 
                  value={theme} 
                  onChange={(e) => handleThemeChange(e.target.value)}
                  size="small"
                >
                  <Radio.Button value="light">
                    <SunOutlined />
                  </Radio.Button>
                  <Radio.Button value="dark">
                    <MoonOutlined />
                  </Radio.Button>
                  <Radio.Button value="auto">
                    <DesktopOutlined />
                  </Radio.Button>
                </Radio.Group>
              </SettingItem>

              <SettingItem 
                label="色彩方案"
                description="自定义应用配色主题"
              >
                <Button 
                  type="text" 
                  icon={<RightOutlined />}
                  size="small"
                >
                  自定义
                </Button>
              </SettingItem>

              <SettingItem 
                label="导航栏模式"
                description="调整应用导航栏显示选项"
              >
                <Radio.Group 
                  value={isTopNav ? 'top' : 'side'} 
                  onChange={(e) => handleNavModeChange(e.target.value === 'top')}
                  size="small"
                >
                  <Radio.Button value="side">
                    侧边导航
                  </Radio.Button>
                  <Radio.Button value="top">
                    顶部导航
                  </Radio.Button>
                </Radio.Group>
              </SettingItem>
            </div>
          </Card>
        </div>

        {/* 右列 */}
        <div style={getColumnStyle(1)}>
          {/* 高级设置 */}
          <Card 
            title={
              <Space>
                <SettingOutlined />
                <span>高级设置</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <div style={{ padding: '0 8px' }}>
              <SettingItem 
                label="开机自启"
                description="系统启动时自动运行 NodePass GUI"
              >
                <Switch size="small" />
              </SettingItem>

              <SettingItem 
                label="最小化到托盘"
                description="关闭窗口时最小化到系统托盘"
              >
                <Switch size="small" />
              </SettingItem>

              <SettingItem 
                label="日志级别"
                description="设置应用日志记录详细程度"
              >
                <Button 
                  type="text" 
                  icon={<RightOutlined />}
                  size="small"
                >
                  配置
                </Button>
              </SettingItem>

              <SettingItem 
                label="数据导出"
                description="导出隧道配置和应用设置"
              >
                <Button 
                  type="text" 
                  icon={<RightOutlined />}
                  size="small"
                >
                  导出
                </Button>
              </SettingItem>

              <SettingItem 
                label="网络测试"
                description="测试GitHub连接状态，诊断下载问题"
              >
                <Button 
                  type="text" 
                  icon={<RightOutlined />}
                  size="small"
                  onClick={testNetworkConnection}
                >
                  测试连接
                </Button>
              </SettingItem>
            </div>
          </Card>
        </div>
      </div>

      {/* 核心下载/更新对话框 */}
      <Modal
        title={
          <Space>
            <GithubOutlined />
            <span>NodePass 核心 {latestRelease?.tag_name || ''}</span>
          </Space>
        }
        open={showDownloadModal}
        onCancel={() => setShowDownloadModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* 左侧：状态消息 */}
            <div style={{ flex: 1, marginRight: 16 }}>
              {downloadProgress ? (
                <div style={{ 
                  fontSize: '13px', 
                  color: downloadProgress.status === 'completed' ? '#52c41a' : 
                         downloadProgress.status === 'error' ? '#ff4d4f' : '#666'
                }}>
                  {downloadProgress.status === 'completed' && '✅ 安装完成！请重新检测核心状态'}
                  {downloadProgress.status === 'error' && '❌ 下载失败，请查看日志'}
                  {downloadProgress.status === 'downloading' && '⬇️ 正在下载...'}
                  {downloadProgress.status === 'extracting' && '📦 正在安装...'}
                  {downloadProgress.status === 'started' && '🚀 准备下载...'}
                </div>
              ) : (
                <div style={{ 
                  color: '#999',
                  fontSize: '12px'
                }}>
                  点击下载按钮开始安装 NodePass 核心
                </div>
              )}
            </div>
            
            {/* 右侧：按钮 */}
            <Space>
              <Button onClick={() => setShowDownloadModal(false)}>
                取消
              </Button>
              <Button 
                type="primary"
                icon={downloadProgress?.status === 'downloading' || downloadProgress?.status === 'extracting' ? undefined : <DownloadOutlined />}
                onClick={downloadSystemAppropriate}
                disabled={downloadProgress?.status === 'downloading' || downloadProgress?.status === 'extracting' || downloadProgress?.status === 'completed'}
                loading={downloadProgress?.status === 'downloading' || downloadProgress?.status === 'extracting'}
              >
                {downloadProgress?.status === 'downloading' ? '下载中...' :
                 downloadProgress?.status === 'extracting' ? '安装中...' :
                 downloadProgress?.status === 'completed' ? '已完成' :
                 downloadProgress?.status === 'error' ? '重新下载' : '下载安装'}
              </Button>
            </Space>
          </div>
        }
        width={700}
        style={{ top: 20 }}
        bodyStyle={{ 
          maxHeight: 'calc(100vh - 200px)', 
          overflowY: 'auto',
          padding: '20px'
        }}
      >
        {latestRelease && (
          <div>
            {/* 版本信息卡片 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: 4 }}>
                    {latestRelease.name}
                  </div>
                  <div style={{ color: '#666', fontSize: '12px' }}>
                    发布时间: {new Date(latestRelease.published_at).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>
                <Button 
                  type="link" 
                  icon={<GithubOutlined />}
                  href={latestRelease.html_url}
                  target="_blank"
                  size="small"
                >
                  查看详情
                </Button>
              </div>
            </Card>

            {/* 更新日志 */}
            <Card 
              title="更新日志" 
              size="small" 
              style={{ marginBottom: 16 }}
            >
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                {/* 这里可以显示从GitHub API获取的发布说明 */}
                <div style={{ color: '#666' }}>
                  • 紧急修复了server自动重启后隧道端口被占用的问题<br/>
                  • 重构了部分代码，提高复用程度和可读性<br/>
                  • 优化了连接池管理机制<br/>
                  • 增强了错误处理和日志记录
                </div>
              </div>
            </Card>

            {/* 安装说明 */}
            <Alert
              type="info"
              message="安装说明"
              description={
                <div style={{ fontSize: '12px' }}>
                  下载完成后，文件将保存在项目根目录。详细的安装和部署说明请参考 
                  <Button type="link" size="small" style={{ padding: 0, marginLeft: 4, fontSize: '12px' }}>
                    INSTALL.md
                  </Button>
                </div>
              }
              style={{ marginBottom: 16 }}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

export default SystemSettings 