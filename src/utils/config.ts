// 隧道配置接口
export interface TunnelConfig {
  id: string
  name: string
  mode: 'server' | 'client'
  protocol: 'TCP' | 'UDP'
  tunnelAddr: string
  targetAddr: string
  tlsMode: '0' | '1' | '2'
  logLevel: 'error' | 'info' | 'debug'
  certFile?: string
  keyFile?: string
  status: 'stopped' | 'running' | 'error'
  processId?: number
  createdAt: string
  lastStarted?: string
}

// 系统设置接口
export interface SystemSettings {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh' | 'en'
  autoStart: boolean
  minimizeToTray: boolean
  startMinimized: boolean
  checkUpdates: boolean
  logLevel: 'error' | 'info' | 'debug'
  maxLogFiles: number
  logRetentionDays: number
  // 导航设置
  isTopNav: boolean
  sidebarCollapsed: boolean
}

// 应用配置接口
export interface AppConfig {
  tunnels: TunnelConfig[]
  settings: SystemSettings
  version: string
  lastUpdated: string
}

// 默认配置
const DEFAULT_CONFIG: AppConfig = {
  tunnels: [],
  settings: {
    theme: 'dark',
    language: 'zh',
    autoStart: false,
    minimizeToTray: true,
    startMinimized: false,
    checkUpdates: true,
    logLevel: 'info',
    maxLogFiles: 10,
    logRetentionDays: 30,
    isTopNav: true,
    sidebarCollapsed: false
  },
  version: '1.0.0',
  lastUpdated: new Date().toISOString()
}

const CONFIG_KEY = 'nodepass-config'

export class ConfigManager {
  private static instance: ConfigManager
  private config: AppConfig = DEFAULT_CONFIG

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  // 初始化配置，程序启动时调用
  public async initialize(): Promise<void> {
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY)
      
      if (savedConfig) {
        await this.loadConfig(savedConfig)
      } else {
        await this.saveConfig()
      }
    } catch (error) {
      console.error('配置初始化失败:', error)
      // 如果读取失败，使用默认配置
      this.config = { ...DEFAULT_CONFIG }
      await this.saveConfig()
    }
  }

  // 加载配置
  private async loadConfig(configContent: string): Promise<void> {
    try {
      const loadedConfig = JSON.parse(configContent) as AppConfig
      
      // 合并配置，确保新增的字段有默认值
      this.config = {
        ...DEFAULT_CONFIG,
        ...loadedConfig,
        settings: {
          ...DEFAULT_CONFIG.settings,
          ...loadedConfig.settings
        }
      }
    } catch (error) {
      console.error('加载配置失败:', error)
      throw error
    }
  }

  // 保存配置
  private async saveConfig(): Promise<void> {
    try {
      this.config.lastUpdated = new Date().toISOString()
      const configContent = JSON.stringify(this.config, null, 2)
      localStorage.setItem(CONFIG_KEY, configContent)
    } catch (error) {
      console.error('保存配置失败:', error)
      throw error
    }
  }

  // 获取所有隧道
  public getTunnels(): TunnelConfig[] {
    return this.config.tunnels
  }

  // 添加隧道
  public async addTunnel(tunnel: Omit<TunnelConfig, 'id' | 'status' | 'createdAt'>): Promise<string> {
    const newTunnel: TunnelConfig = {
      ...tunnel,
      id: this.generateId(),
      status: 'stopped',
      createdAt: new Date().toISOString()
    }
    
    this.config.tunnels.push(newTunnel)
    await this.saveConfig()
    return newTunnel.id
  }

  // 更新隧道
  public async updateTunnel(id: string, updates: Partial<TunnelConfig>): Promise<void> {
    const index = this.config.tunnels.findIndex(t => t.id === id)
    if (index === -1) {
      throw new Error(`隧道 ${id} 不存在`)
    }
    
    this.config.tunnels[index] = {
      ...this.config.tunnels[index],
      ...updates
    }
    
    await this.saveConfig()
  }

  // 删除隧道
  public async deleteTunnel(id: string): Promise<void> {
    const index = this.config.tunnels.findIndex(t => t.id === id)
    if (index === -1) {
      throw new Error(`隧道 ${id} 不存在`)
    }
    
    this.config.tunnels.splice(index, 1)
    await this.saveConfig()
  }

  // 获取隧道详情
  public getTunnel(id: string): TunnelConfig | undefined {
    return this.config.tunnels.find(t => t.id === id)
  }

  // 获取系统设置
  public getSettings(): SystemSettings {
    return this.config.settings
  }

  // 更新系统设置
  public async updateSettings(settings: Partial<SystemSettings>): Promise<void> {
    this.config.settings = {
      ...this.config.settings,
      ...settings
    }
    await this.saveConfig()
  }

  // 获取完整配置
  public getConfig(): AppConfig {
    return this.config
  }

  // 生成唯一ID
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // 导出配置
  public async exportConfig(): Promise<string> {
    return JSON.stringify(this.config, null, 2)
  }

  // 导入配置
  public async importConfig(configJson: string): Promise<void> {
    try {
      const importedConfig = JSON.parse(configJson) as AppConfig
      
      // 验证配置格式
      if (!importedConfig.tunnels || !importedConfig.settings) {
        throw new Error('配置文件格式无效')
      }
      
      this.config = {
        ...DEFAULT_CONFIG,
        ...importedConfig,
        settings: {
          ...DEFAULT_CONFIG.settings,
          ...importedConfig.settings
        }
      }
      
      await this.saveConfig()
    } catch (error) {
      console.error('导入配置失败:', error)
      throw error
    }
  }

  // 重置配置
  public async resetConfig(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG }
    await this.saveConfig()
  }
}

// 导出单例实例
export const configManager = ConfigManager.getInstance() 