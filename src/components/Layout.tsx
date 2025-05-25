import React from 'react'
import { Layout, Menu, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  DatabaseOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'

const { Header, Sider, Content } = Layout
const { Title } = Typography

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { collapsed, setCollapsed, isTopNav, isDarkMode } = useSettings()
  const navigate = useNavigate()
  const location = useLocation()

  // 菜单项配置
  const menuItems: MenuProps['items'] = [
    {
      key: '/tunnels',
      icon: <DatabaseOutlined />,
      label: '隧道',
      onClick: () => navigate('/tunnels'),
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: '日志',
      onClick: () => navigate('/logs'),
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
      onClick: () => navigate('/settings'),
    },
  ]

  // 顶部导航布局
  if (isTopNav) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        {/* 顶部导航栏 */}
        <Header
          style={{
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isDarkMode ? '#001529' : '#131B2C',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          }}
        >
          {/* Logo */}
          <Title level={4} style={{ color: 'white', margin: 0 }}>
            🚀 NodePass
          </Title>

          {/* 顶部菜单 */}
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              flex: 1,
              justifyContent: 'center',
            }}
          />

          {/* 占位符，保持布局平衡 */}
          <div style={{ width: '120px' }} />
        </Header>

        {/* 主要内容 */}
        <Content
          style={{
            margin: '16px',
            padding: '16px',
            borderRadius: '8px',
            minHeight: 280,
            overflow: 'hidden',
            height: 'calc(100vh - 80px)', // 减去header高度
          }}
        >
          {children}
        </Content>
      </Layout>
    )
  }

  // 侧边导航布局
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="dark"
        width={250}
        style={{
          backgroundColor: isDarkMode ? '#001529' : '#131B2C',
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 24px',
            borderBottom: '1px solid #1c2942',
          }}
        >
          {!collapsed && (
            <Title level={4} style={{ color: 'white', margin: 0 }}>
              🚀 NodePass
            </Title>
          )}
          {collapsed && (
            <Title level={4} style={{ color: 'white', margin: 0 }}>
              🚀
            </Title>
          )}
        </div>

        {/* 菜单 */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{
            backgroundColor: isDarkMode ? '#001529' : '#131B2C',
            border: 'none',
          }}
        />
      </Sider>

      {/* 主要内容区域 */}
      <Layout>
        {/* 顶部导航栏 */}
        <Header
          style={{
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            backgroundColor: isDarkMode ? '#1f1f1f' : '#ffffff',
          }}
        >
          {/* 折叠按钮 */}
          {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
            className: 'trigger',
            onClick: () => setCollapsed(!collapsed),
            style: { fontSize: '18px', cursor: 'pointer' },
          })}
        </Header>

        {/* 主要内容 */}
        <Content
          style={{
            margin: '16px',
            padding: '16px',
            borderRadius: '8px',
            minHeight: 280,
            overflow: 'hidden',
            height: 'calc(100vh - 112px)', // 减去header高度和margin
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout 