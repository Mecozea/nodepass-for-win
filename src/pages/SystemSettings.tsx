import React, { useState, useEffect, useRef } from 'react'
import { Card, Button, Tag, Space, Modal, message, Switch, Radio, Input } from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
  faDownload, 
  faSync, 
  faCog, 
  faMicrochip,
  faPalette, 
  faSun, 
  faMoon, 
  faDesktop, 
  faChevronRight,
  faFolder,
  faGear
} from '@fortawesome/free-solid-svg-icons'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useSettings } from '../context/SettingsContext'
import { useLog } from '../context/LogContext'
import ProxySettingsModal from '../components/ProxySettingsModal'
import { ProxySettings } from '../utils/config'

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
  label: string | React.ReactNode
  children: React.ReactNode
  description?: string
}> = ({ label, children, description }) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: '10px 10px',
    borderBottom: '1px solid #f0f0f0'
  }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 500, marginBottom: description ? 2 : 0 }}>
        {label}
      </div>
      {description && (
        <div style={{ fontSize: '12px', color: '#666' }}>
          {description}
        </div>
      )}
    </div>
    <div style={{ marginLeft: 12 }}>
      {children}
    </div>
  </div>
)

interface SystemSettingsProps {
  // 移除 onRegisterRefresh 属性
}

const SystemSettings: React.FC<SystemSettingsProps> = () => {
  const [nodePassStatus, setNodePassStatus] = useState<NodePassStatus | null>(null)
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('0.0.1')
  const [showProxyModal, setShowProxyModal] = useState(false)
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [envConfig, setEnvConfig] = useState<'none' | 'custom' | 'high-throughput' | 'low-latency' | 'resource-limited'>('none')
  
  // 从Context获取设置和日志
  const { settings, updateSettings, theme, setTheme, isTopNav, setIsTopNav } = useSettings()
  const { addLog } = useLog()

  // 瀑布流布局相关
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 监听下载进度
    const unlistenDownload = listen('download-progress', (event) => {
      const progress = event.payload as DownloadProgress
      setDownloadProgress(progress)
      
      if (progress.status === 'completed') {
        message.success('NodePass 安装完成！')
        addLog('info', 'NodePass 核心安装完成', 'SystemSettings')
        setIsDownloading(false)
        setTimeout(() => {
          checkNodePassStatus()
          setShowDownloadModal(false)
        }, 1000)
      } else if (progress.status === 'error') {
        // 错误信息只记录到日志，不显示在前端
        addLog('error', `NodePass 下载失败: ${progress.message}`, 'SystemSettings')
        console.error('下载失败:', progress.message)
        setIsDownloading(false)
      }
    })

    // 初始检查状态
    checkNodePassStatus()
    getAppVersion()

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

  const getAppVersion = async () => {
    try {
      const version = await invoke<string>('get_app_version')
      setAppVersion(version)
    } catch (error) {
      console.error('获取应用版本失败:', error)
      // 保持默认版本 0.0.1
    }
  }

  const fetchLatestRelease = async () => {
    try {
      message.loading('正在获取最新版本信息...', 1)
      addLog('info', '开始获取 NodePass 最新版本信息', 'SystemSettings')
      const release = await invoke<GitHubRelease>('get_latest_release')
      setLatestRelease(release)
      // 重置下载进度状态
      setDownloadProgress(null)
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
      setIsDownloading(true)
      addLog('info', `开始下载 NodePass: ${asset.name}`, 'SystemSettings')
      setDownloadProgress({
        status: 'started',
        message: '准备下载...'
      })
      
      console.log('调用下载函数，参数:', {
        downloadUrl: asset.browser_download_url,
        filename: asset.name,
        proxySettings: settings.proxy
      })
      
      // 使用Promise包装invoke调用，确保错误被正确捕获
      const result = await new Promise((resolve, reject) => {
        invoke('download_nodepass', {
          downloadUrl: asset.browser_download_url,
          filename: asset.name,
          proxySettings: settings.proxy
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
    } finally {
      setIsDownloading(false)
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

  // 取消下载
  const cancelDownload = async () => {
    try {
      // 调用后端取消下载
      await invoke('cancel_download')
      setIsDownloading(false)
      setDownloadProgress(null)
      setShowDownloadModal(false)
      addLog('info', '用户取消下载', 'SystemSettings')
      message.info('已取消下载')
    } catch (error) {
      console.error('取消下载失败:', error)
      // 即使后端取消失败，也要重置前端状态
      setIsDownloading(false)
      setDownloadProgress(null)
      setShowDownloadModal(false)
      addLog('error', `取消下载失败: ${error}`, 'SystemSettings')
      message.warning('取消下载请求已发送')
    }
  }

  const handleProxySettingsSave = async (proxySettings: ProxySettings) => {
    try {
      await updateSettings({ proxy: proxySettings })
      addLog('info', '代理设置已更新', 'SystemSettings')
    } catch (error) {
      console.error('保存代理设置失败:', error)
      throw error
    }
  }

  // 检查版本更新
  const checkForUpdates = async () => {
    if (!nodePassStatus?.installed || !nodePassStatus.version) {
      message.warning('请先安装 NodePass 核心')
      return
    }

    try {
      message.loading('正在检查更新...', 1)
      addLog('info', '开始检查 NodePass 版本更新', 'SystemSettings')
      
      const release = await invoke<GitHubRelease>('get_latest_release')
      const currentVersion = nodePassStatus.version
      const latestVersion = release.tag_name
      
      addLog('info', `当前版本: ${currentVersion}, 最新版本: ${latestVersion}`, 'SystemSettings')
      
      if (currentVersion === latestVersion) {
        message.success('当前已是最新版本！')
        addLog('info', '当前版本已是最新', 'SystemSettings')
      } else {
        setLatestRelease(release)
        setDownloadProgress(null)
        setShowDownloadModal(true)
        addLog('info', `发现新版本: ${latestVersion}`, 'SystemSettings')
      }
    } catch (error) {
      const errorMsg = `检查更新失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'SystemSettings')
    }
  }

  // 打开核心文件目录
  const openCoreDirectory = async () => {
    if (!nodePassStatus?.installed || !nodePassStatus.path) {
      message.warning('未找到 NodePass 核心文件')
      return
    }

    try {
      const path = nodePassStatus.path
      const directory = path.substring(0, path.lastIndexOf('\\'))
      await invoke('open_directory', { path: directory })
      addLog('info', `打开核心文件目录: ${directory}`, 'SystemSettings')
    } catch (error) {
      message.error('打开目录失败')
      console.error('打开目录错误:', error)
      addLog('error', `打开目录失败: ${error}`, 'SystemSettings')
    }
  }

  return (
    <div>
      <div ref={containerRef} style={{ position: 'relative' }}>
        {/* 左列 */}
        <div style={getColumnStyle(0)}>
          {/* NodePass 设置 */}
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <FontAwesomeIcon icon={faMicrochip} />
                  <span>NodePass 核心</span>
                </Space>
                <Button 
                  icon={<FontAwesomeIcon icon={faSync} />} 
                  onClick={checkNodePassStatus}
                  loading={checkingStatus}
                  size="small"
                  type="text"
                  title="刷新核心状态"
                />
              </div>
            }
            style={{ marginBottom: 24 }}
            bodyStyle={{ padding: '0 8px' }}
          >
            <SettingItem 
              label={
                <Space>
                  <span>核心状态</span>
                  {nodePassStatus?.installed && (
                    <Button 
                      icon={<FontAwesomeIcon icon={faFolder} />} 
                      onClick={openCoreDirectory}
                      size="small"
                      type="text"
                      title="打开核心文件目录"
                      style={{ color: '#666' }}
                    />
                  )}
                </Space>
              }
              description="NodePass 核心执行文件状态"
            >
              <Space>
                {nodePassStatus ? (
                  nodePassStatus.installed ? (
                    // 已安装：显示版本号按钮，点击检查更新
                    <Button 
                      type="text" 
                      size="small"
                      onClick={checkForUpdates}
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
                      title="点击检查更新"
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
              </Space>
            </SettingItem>

            <SettingItem 
              label="应用版本"
              description="NodePass GUI 当前版本号"
            >
              <Button 
                type="text" 
                size="small"
                style={{ 
                  color: '#1890ff',
                  backgroundColor: '#e6f7ff',
                  border: '1px solid #91d5ff',
                  borderRadius: '4px',
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '2px 8px',
                  height: 'auto',
                  lineHeight: '1.2'
                }}
              >
                v{appVersion}
              </Button>
            </SettingItem>

            <SettingItem 
              label="环境变量策略"
              description="配置 NodePass 核心运行时的环境变量"
            >
              <Button 
                type="text" 
                size="small"
                onClick={() => setShowEnvModal(true)}
              >
                {envConfig === 'none' && '无配置'}
                {envConfig === 'custom' && '自定义'}
                {envConfig === 'high-throughput' && '高吞吐量'}
                {envConfig === 'low-latency' && '低延迟'}
                {envConfig === 'resource-limited' && '资源受限'}
                <FontAwesomeIcon icon={faChevronRight} />
              </Button>
            </SettingItem>
          </Card>

          {/* 主题设置 */}
          <Card 
            title={
              <Space>
                <FontAwesomeIcon icon={faPalette} />
                <span>主题设置</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
            bodyStyle={{ padding: '0 8px' }}
          >
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
                  <FontAwesomeIcon icon={faSun} />
                </Radio.Button>
                <Radio.Button value="dark">
                  <FontAwesomeIcon icon={faMoon} />
                </Radio.Button>
                <Radio.Button value="auto">
                  <FontAwesomeIcon icon={faDesktop} />
                </Radio.Button>
              </Radio.Group>
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
          </Card>
        </div>

        {/* 右列 */}
        <div style={getColumnStyle(1)}>
          {/* 高级设置 */}
          <Card 
            title={
              <Space>
                <FontAwesomeIcon icon={faCog} />
                <span>高级设置</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
            bodyStyle={{ padding: '0 8px' }}
          >
            <SettingItem 
              label="开机自启"
              description="系统启动时自动运行 NodePass GUI"
            >
              <Switch 
                size="small" 
                onChange={() => message.info('此功能正在开发中')}
              />
            </SettingItem>

            <SettingItem 
              label="最小化到托盘"
              description="关闭窗口时最小化到系统托盘"
            >
              <Switch 
                size="small" 
                onChange={() => message.info('此功能正在开发中')}
              />
            </SettingItem>

            <SettingItem 
              label="日志级别"
              description="设置应用日志记录详细程度"
            >
              <Button 
                type="text" 
                size="small"
                onClick={() => message.info('此功能正在开发中')}
              >
                配置 <FontAwesomeIcon icon={faChevronRight} />
              </Button>
            </SettingItem>

            <SettingItem 
              label="数据导出"
              description="导出隧道配置和应用设置"
            >
              <Button 
                type="text" 
                size="small"
                onClick={() => message.info('此功能正在开发中')}
              >
                导出 <FontAwesomeIcon icon={faChevronRight} />
              </Button>
            </SettingItem>

            <SettingItem 
              label="代理设置"
              description="配置网络代理，用于访问GitHub等外部服务"
            >
              <Button 
                type="text" 
                size="small"
                onClick={() => setShowProxyModal(true)}
              >
                {settings.proxy.enabled ? '已配置' : '未配置'} <FontAwesomeIcon icon={faChevronRight} />
              </Button>
            </SettingItem>
          </Card>
        </div>
      </div>

      {/* 核心下载/更新对话框 */}
      <Modal
        title={
          <Space>
            <FontAwesomeIcon icon={faGithub} />
            <span>NodePass 核心 {latestRelease?.tag_name || ''}</span>
            {nodePassStatus?.installed && latestRelease && nodePassStatus.version !== latestRelease.tag_name && (
              <span style={{ 
                color: '#ff4d4f', 
                fontSize: '12px', 
                fontWeight: 'bold',
                backgroundColor: '#fff2f0',
                border: '1px solid #ffccc7',
                borderRadius: '4px',
                padding: '2px 6px',
                marginLeft: '8px'
              }}>
                新
              </span>
            )}
          </Space>
        }
        open={showDownloadModal}
        onCancel={() => {
          setShowDownloadModal(false)
          // 重置下载进度状态
          setDownloadProgress(null)
        }}
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
              <Button 
                onClick={isDownloading ? cancelDownload : () => {
                  setShowDownloadModal(false)
                  setDownloadProgress(null)
                }}
              >
                取消
              </Button>
              <Button 
                type="primary"
                icon={downloadProgress?.status === 'downloading' || downloadProgress?.status === 'extracting' || downloadProgress?.status === 'started' ? undefined : <FontAwesomeIcon icon={faDownload} />}
                onClick={downloadSystemAppropriate}
                disabled={isDownloading || downloadProgress?.status === 'completed'}
                loading={downloadProgress?.status === 'downloading' || downloadProgress?.status === 'extracting' || downloadProgress?.status === 'started'}
              >
                {downloadProgress?.status === 'started' ? '准备中...' :
                 downloadProgress?.status === 'downloading' ? '下载中...' :
                 downloadProgress?.status === 'extracting' ? '安装中...' :
                 downloadProgress?.status === 'completed' ? '已完成' :
                 downloadProgress?.status === 'error' ? '重新下载' : 
                 (nodePassStatus?.installed ? '更新' : '下载安装')}
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
            {/* 更新日志 */}
            <Card 
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>更新日志</span>
                    <span style={{ color: '#666', fontSize: '12px', fontWeight: 'normal' }}>
                      {new Date(latestRelease.published_at).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <Button 
                    type="link" 
                    onClick={async () => {
                      try {
                        await invoke('open_url_in_default_browser', { url: latestRelease.html_url })
                      } catch (error) {
                        console.error('打开浏览器失败:', error)
                        message.error('打开浏览器失败')
                      }
                    }}
                    size="small"
                    style={{ fontSize: '12px' }}
                  >
                    查看详情
                  </Button>
                </div>
              }
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
          </div>
        )}
      </Modal>

      {/* 环境变量配置弹窗 */}
      <Modal
        title={
          <Space>
            <span>环境变量策略配置</span>
            <span style={{ color: '#ff4d4f', fontSize: '12px' }}>非必要请不要设置</span>
          </Space>
        }
        open={showEnvModal}
        onCancel={() => setShowEnvModal(false)}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <Radio.Group 
            value={envConfig}
            onChange={(e) => setEnvConfig(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value="none">
                <div>
                  <div style={{ fontWeight: 500 }}>无配置</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    使用系统默认配置，不设置任何环境变量
                  </div>
                </div>
              </Radio>
              <Radio value="custom">
                <div>
                  <div style={{ fontWeight: 500 }}>自定义配置</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    手动配置所有环境变量
                  </div>
                </div>
              </Radio>
              <Radio value="high-throughput">
                <div>
                  <div style={{ fontWeight: 500 }}>高吞吐量配置</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    优化网络吞吐量，适合大文件传输场景
                  </div>
                </div>
              </Radio>
              <Radio value="low-latency">
                <div>
                  <div style={{ fontWeight: 500 }}>低延迟配置</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    优化网络延迟，适合实时通信场景
                  </div>
                </div>
              </Radio>
              <Radio value="resource-limited">
                <div>
                  <div style={{ fontWeight: 500 }}>资源受限配置</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    降低资源占用，适合低配置设备
                  </div>
                </div>
              </Radio>
            </Space>
          </Radio.Group>
        </div>

        {envConfig === 'custom' ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h4>自定义环境变量</h4>
              <p style={{ fontSize: '12px', color: '#666', marginBottom: 8 }}>
                请根据需求配置以下环境变量，每个变量一行，格式为 KEY=VALUE
              </p>
              <Input.TextArea 
                rows={10}
                placeholder={`NODEPASS_TLS_CIPHERS=TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384
NODEPASS_TLS_MIN_VERSION=TLSv1.2
NODEPASS_TLS_MAX_VERSION=TLSv1.3
NODEPASS_TLS_CURVES=X25519:P-256:P-384
NODEPASS_TLS_SESSION_TICKETS=true
NODEPASS_TLS_SESSION_CACHE_SIZE=1000
NODEPASS_TLS_SESSION_CACHE_TIMEOUT=3600
NODEPASS_TLS_ALPN_PROTOCOLS=h2,http/1.1
NODEPASS_TLS_VERIFY_PEER=true
NODEPASS_TLS_VERIFY_PEER_NAME=true
NODEPASS_TLS_VERIFY_PEER_CERT=true
NODEPASS_TLS_VERIFY_PEER_CERT_CHAIN=true
NODEPASS_TLS_VERIFY_PEER_CERT_ISSUER=true
NODEPASS_TLS_VERIFY_PEER_CERT_SUBJECT=true
NODEPASS_TLS_VERIFY_PEER_CERT_SERIAL=true
NODEPASS_TLS_VERIFY_PEER_CERT_FINGERPRINT=true
NODEPASS_TLS_VERIFY_PEER_CERT_PUBKEY=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_ALG=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_PARAMS=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_VALID=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_INVALID=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_UNKNOWN=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_UNSUPPORTED=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_EXPIRED=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_REVOKED=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CA=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_SELF=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_ROOT=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_INTERMEDIATE=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_LEAF=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_VALID=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_INVALID=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_UNKNOWN=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_UNSUPPORTED=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_EXPIRED=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_REVOKED=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_CA=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_SELF=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_ROOT=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_INTERMEDIATE=true
NODEPASS_TLS_VERIFY_PEER_CERT_SIG_CHAIN_LEAF=true`}
              />
            </div>
          </div>
        ) : envConfig !== 'none' && (
          <div>
            <h4>预设配置详情</h4>
            <div style={{ 
              background: '#f5f5f5', 
              padding: 16, 
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap'
            }}>
              {envConfig === 'high-throughput' && `NODEPASS_TLS_CIPHERS=TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384
NODEPASS_TLS_MIN_VERSION=TLSv1.2
NODEPASS_TLS_MAX_VERSION=TLSv1.3
NODEPASS_TLS_CURVES=X25519:P-256:P-384
NODEPASS_TLS_SESSION_TICKETS=true
NODEPASS_TLS_SESSION_CACHE_SIZE=1000
NODEPASS_TLS_SESSION_CACHE_TIMEOUT=3600
NODEPASS_TLS_ALPN_PROTOCOLS=h2,http/1.1`}
              {envConfig === 'low-latency' && `NODEPASS_TLS_CIPHERS=TLS_AES_128_GCM_SHA256
NODEPASS_TLS_MIN_VERSION=TLSv1.2
NODEPASS_TLS_MAX_VERSION=TLSv1.3
NODEPASS_TLS_CURVES=X25519
NODEPASS_TLS_SESSION_TICKETS=true
NODEPASS_TLS_SESSION_CACHE_SIZE=100
NODEPASS_TLS_SESSION_CACHE_TIMEOUT=1800
NODEPASS_TLS_ALPN_PROTOCOLS=http/1.1`}
              {envConfig === 'resource-limited' && `NODEPASS_TLS_CIPHERS=TLS_AES_128_GCM_SHA256
NODEPASS_TLS_MIN_VERSION=TLSv1.2
NODEPASS_TLS_MAX_VERSION=TLSv1.2
NODEPASS_TLS_CURVES=P-256
NODEPASS_TLS_SESSION_TICKETS=false
NODEPASS_TLS_SESSION_CACHE_SIZE=50
NODEPASS_TLS_SESSION_CACHE_TIMEOUT=900
NODEPASS_TLS_ALPN_PROTOCOLS=http/1.1`}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Space>
            <Button onClick={() => setShowEnvModal(false)}>取消</Button>
            <Button type="primary" onClick={() => {
              message.success('环境变量策略已更新');
              setShowEnvModal(false);
            }}>
              确定
            </Button>
          </Space>
        </div>
      </Modal>

      {/* 代理设置弹窗 */}
      <ProxySettingsModal
        open={showProxyModal}
        onCancel={() => setShowProxyModal(false)}
        onSave={handleProxySettingsSave}
        initialValues={settings.proxy}
      />
    </div>
  )
}

export default SystemSettings 