import React from 'react'
import { Layout, Menu, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined,
  DatabaseOutlined,
  SettingOutlined,
  PlusOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'

const { Header, Sider, Content } = Layout
const { Title } = Typography

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { isTopNav, collapsed, setCollapsed } = useSettings()
  const navigate = useNavigate()
  const location = useLocation()

  // 菜单项配置
  const menuItems: MenuProps['items'] = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
      onClick: () => navigate('/dashboard'),
    },
    {
      key: '/tunnels',
      icon: <DatabaseOutlined />,
      label: '隧道管理',
      onClick: () => navigate('/tunnels'),
    },
    {
      key: '/tunnels/create',
      icon: <PlusOutlined />,
      label: '创建隧道',
      onClick: () => navigate('/tunnels/create'),
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
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
            background: '#131B2C',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Title level={4} style={{ color: 'white', margin: '0 32px 0 0' }}>
            🚀 NodePass
          </Title>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={menuItems}
            style={{
              background: '#131B2C',
              border: 'none',
              flex: 1,
            }}
          />
        </Header>

        {/* 主要内容 */}
        <Content
          style={{
            margin: '16px',
            padding: '16px',
            background: '#fff',
            borderRadius: '8px',
            minHeight: 280,
            overflow: 'auto',
            height: 'calc(100vh - 112px)', // 减去header高度和margin
          }}
        >
          {children}
        </Content>
      </Layout>
    )
  }

  // 侧边导航布局（默认）
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
          background: '#131B2C',
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
            background: '#131B2C',
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
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
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
            background: '#fff',
            borderRadius: '8px',
            minHeight: 280,
            overflow: 'auto',
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