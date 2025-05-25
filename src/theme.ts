import { ThemeConfig } from 'antd'

export const customTheme: ThemeConfig = {
  token: {
    // 主色调
    colorPrimary: '#131B2C',
    colorPrimaryBg: '#1c2942',
    
    // 成功、警告、错误状态
    colorSuccess: '#28a745',
    colorWarning: '#ffc107',
    colorError: '#dc3545',
    
    // 背景色
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f8f9fa',
    colorBgBase: '#ffffff',
    
    // 文字颜色
    colorText: '#131B2C',
    colorTextSecondary: '#6c757d',
    
    // 边框
    colorBorder: '#e9ecef',
    colorBorderSecondary: '#dee2e6',
    
    // 字体
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    
    // 间距
    borderRadius: 6,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: '#131B2C',
      siderBg: '#131B2C',
      bodyBg: '#f8f9fa',
    },
    Menu: {
      darkItemBg: '#131B2C',
      darkItemSelectedBg: '#1c2942',
      darkItemHoverBg: '#1c2942',
    },
    Card: {
      headerBg: '#ffffff',
    },
    Button: {
      primaryShadow: '0 2px 4px rgba(19, 27, 44, 0.1)',
    },
  },
} 