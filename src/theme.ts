import { ThemeConfig } from 'antd'

// 浅色主题
export const lightTheme: ThemeConfig = {
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
    colorBgElevated: '#ffffff',
    
    // 文字颜色
    colorText: '#131B2C',
    colorTextSecondary: '#6c757d',
    colorTextTertiary: '#adb5bd',
    
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
      headerBg: '#ffffff',
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

// 深色主题
export const darkTheme: ThemeConfig = {
  token: {
    // 主色调
    colorPrimary: '#1890ff',
    colorPrimaryBg: '#111b26',
    
    // 成功、警告、错误状态
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    
    // 背景色 - 深色主题的关键配置
    colorBgContainer: '#1f1f1f',        // Card、Modal等容器背景
    colorBgLayout: '#141414',           // Layout背景
    colorBgBase: '#1f1f1f',            // 基础背景
    colorBgElevated: '#262626',         // 悬浮元素背景
    colorBgSpotlight: '#262626',        // 聚光灯背景
    
    // 文字颜色
    colorText: '#ffffff',
    colorTextSecondary: '#a6a6a6',
    colorTextTertiary: '#737373',
    colorTextQuaternary: '#595959',
    
    // 边框
    colorBorder: '#303030',
    colorBorderSecondary: '#404040',
    
    // 字体
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    
    // 间距
    borderRadius: 6,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: '#001529',
      bodyBg: '#141414',
      siderBg: '#001529',
    },
    Card: {
      colorBgContainer: '#1f1f1f',
      colorBorderSecondary: '#303030',
    },
    Table: {
      colorBgContainer: '#1f1f1f',
      headerBg: '#262626',
      rowHoverBg: '#262626',
    },
    Button: {
      colorBgContainer: '#1f1f1f',
      colorBorder: '#404040',
    },
    Input: {
      colorBgContainer: '#1f1f1f',
      colorBorder: '#404040',
    },
    Select: {
      colorBgContainer: '#1f1f1f',
      colorBgElevated: '#262626',
    },
    Menu: {
      colorBgContainer: '#001529',
      colorItemBg: 'transparent',
      colorItemBgSelected: '#1890ff',
      colorItemBgHover: 'rgba(24, 144, 255, 0.1)',
    },
    Modal: {
      colorBgElevated: '#1f1f1f',
      contentBg: '#1f1f1f',
    },
    Drawer: {
      colorBgElevated: '#1f1f1f',
    },
    Tooltip: {
      colorBgSpotlight: '#262626',
    },
    Tag: {
      colorBgContainer: '#262626',
    },
    Statistic: {
      colorTextHeading: '#ffffff',
    },
  },
}

// 默认使用浅色主题
export const customTheme = lightTheme 