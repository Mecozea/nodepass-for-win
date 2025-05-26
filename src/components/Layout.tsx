import React from 'react'
import { Layout, Menu, Typography, Button, Space } from 'antd'
import type { MenuProps } from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faNetworkWired, faCog, faServer, faFileAlt, faBook } from '@fortawesome/free-solid-svg-icons'
import { faGithub, faTelegram } from '@fortawesome/free-brands-svg-icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { invoke } from '@tauri-apps/api/core'

const { Header, Sider, Content } = Layout
const { Title } = Typography

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { isTopNav, isDarkMode } = useSettings()
  const navigate = useNavigate()
  const location = useLocation()

  // 使用默认浏览器打开链接
  const openInDefaultBrowser = async (url: string) => {
    try {
      await invoke('open_url_in_default_browser', { url })
    } catch (error) {
      console.error('打开链接失败:', error)
      // 如果Tauri方法失败，回退到window.open
      window.open(url, '_blank')
    }
  }

  // 菜单项配置
  const menuItems: MenuProps['items'] = [
    {
      key: '/tunnels',
      icon: <FontAwesomeIcon icon={faServer} />,
      label: '隧道',
      onClick: () => navigate('/tunnels'),
    },
    {
      key: '/logs',
      icon: <FontAwesomeIcon icon={faFileAlt} />,
      label: '日志',
      onClick: () => navigate('/logs'),
    },
    {
      key: '/settings',
      icon: <FontAwesomeIcon icon={faCog} />,
      label: '设置',
      onClick: () => navigate('/settings'),
    },
  ]

  // 顶部导航布局
  if (isTopNav) {
    return (
      <Layout style={{ minHeight: '100vh', overflow: 'hidden' }}>
        {/* 顶部导航栏 - 始终使用 #131B2C 颜色 */}
        <Header
          style={{
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#131B2C',
            boxShadow: 'none', // 移除阴影，避免分割线效果
            position: 'relative',
          }}
        >
          {/* Logo - 绝对定位在左侧 */}
          <div style={{ 
            position: 'absolute', 
            left: '24px',
            top: '50%',
            transform: 'translateY(-50%)'
          }}>
            <Title level={4} style={{ color: 'white', margin: 0 }}>
              <FontAwesomeIcon icon={faNetworkWired} style={{ marginRight: 8 }} />
              NodePass
            </Title>
          </div>

          {/* 顶部菜单 - 居中显示 */}
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
            }}
          />

          {/* 右侧按钮组 - 绝对定位在右侧 */}
          <div style={{ 
            position: 'absolute', 
            right: '24px',
            top: '50%',
            transform: 'translateY(-50%)'
          }}>
            <Space>
              {/* 链接图标组 */}
              <Button
                type="text"
                icon={<FontAwesomeIcon icon={faBook} style={{ fontSize: '20px' }} />}
                onClick={() => openInDefaultBrowser('https://nodepass.eu/')}
                style={{ color: 'rgba(255, 255, 255, 0.85)' }}
                title="文档"
                size="large"
              />
              <Button
                type="text"
                icon={<FontAwesomeIcon icon={faTelegram} style={{ fontSize: '20px' }} />}
                onClick={() => openInDefaultBrowser('https://t.me/NodePassChannel')}
                style={{ color: 'rgba(255, 255, 255, 0.85)' }}
                title="Telegram"
                size="large"
              />
              <Button
                type="text"
                icon={<FontAwesomeIcon icon={faGithub} style={{ fontSize: '20px' }} />}
                onClick={() => openInDefaultBrowser('https://github.com/yosebyte/nodepass')}
                style={{ color: 'rgba(255, 255, 255, 0.85)' }}
                title="GitHub"
                size="large"
              />
            </Space>
          </div>
        </Header>

        {/* 主要内容 */}
        <Content
          style={{
            margin: '16px',
            padding: '16px',
            borderRadius: '8px',
            minHeight: 'calc(100vh - 128px)', // 精确计算：自定义标题栏(32px) + header(64px) + margin(32px)
            maxHeight: 'calc(100vh - 128px)',
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    )
  }

  // 侧边导航布局 - 调整为顶部导航在上，侧边导航在下
  return (
    <Layout style={{ minHeight: '100vh', overflow: 'hidden' }}>
      {/* 顶部导航栏 - 始终撑开页面宽度，始终使用 #131B2C 颜色 */}
      <Header
        style={{
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#131B2C',
          boxShadow: 'none', // 移除阴影，避免分割线效果
          width: '100%',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <Title level={4} style={{ color: 'white', margin: 0 }}>
          <FontAwesomeIcon icon={faNetworkWired} style={{ marginRight: 8 }} />
          NodePass
        </Title>

        {/* 右侧按钮组 - 侧边导航模式下也显示 */}
        <Space>
          {/* 链接图标组 */}
          <Button
            type="text"
            icon={<FontAwesomeIcon icon={faBook} style={{ fontSize: '20px' }} />}
            onClick={() => openInDefaultBrowser('https://nodepass.eu/')}
            style={{ color: 'rgba(255, 255, 255, 0.85)' }}
            title="文档"
            size="large"
          />
          <Button
            type="text"
            icon={<FontAwesomeIcon icon={faTelegram} style={{ fontSize: '20px' }} />}
            onClick={() => openInDefaultBrowser('https://t.me/NodePassChannel')}
            style={{ color: 'rgba(255, 255, 255, 0.85)' }}
            title="Telegram"
            size="large"
          />
          <Button
            type="text"
            icon={<FontAwesomeIcon icon={faGithub} style={{ fontSize: '20px' }} />}
            onClick={() => openInDefaultBrowser('https://github.com/yosebyte/nodepass')}
            style={{ color: 'rgba(255, 255, 255, 0.85)' }}
            title="GitHub"
            size="large"
          />
        </Space>
      </Header>

      {/* 下方布局：侧边栏 + 主要内容 */}
      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* 侧边栏 - 根据主题模式调整背景色，移除折叠功能 */}
        <Sider
          trigger={null}
          collapsible={false}
          theme="light"
          width={200}
          style={{
            backgroundColor: isDarkMode ? '#1f1f1f' : '#F8F9FA',
            borderRight: isDarkMode ? '1px solid #303030' : '1px solid #e8e8e8',
            overflow: 'hidden',
          }}
        >
          {/* 菜单 - 恢复默认样式 */}
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{
              backgroundColor: isDarkMode ? '#1f1f1f' : '#F8F9FA',
              border: 'none',
              marginTop: '16px',
              height: 'calc(100vh - 128px)', // 精确计算：自定义标题栏(32px) + header(64px) + margin(32px)
              maxHeight: 'calc(100vh - 128px)',
              overflow: 'auto',
              width: '100%',
            }}
            className="custom-sidebar-menu"
          />
        </Sider>

        {/* 主要内容 */}
        <Content
          style={{
            margin: '16px',
            padding: '16px',
            borderRadius: '8px',
            minHeight: 'calc(100vh - 128px)', // 精确计算：自定义标题栏(32px) + header(64px) + margin(32px)
            maxHeight: 'calc(100vh - 128px)',
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout 