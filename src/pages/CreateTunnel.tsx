import React, { useState } from 'react'
import { Card, Button, Form, Input, Select, Space, message, Row, Col, Modal, Descriptions } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faServer, faDesktop } from '@fortawesome/free-solid-svg-icons'
import { configManager } from '../utils/config'
import { invoke } from '@tauri-apps/api/core'
import { useLog } from '../context/LogContext'
import { useTunnel } from '../context/TunnelContext'

const { Option } = Select
const { TextArea } = Input

// 创建隧道时的表单数据接口
interface CreateTunnelForm {
  mode: 'server' | 'client'
  name: string
  protocol: 'TCP' | 'UDP'
  tunnelAddr: string
  targetAddr: string
  tlsMode: '0' | '1' | '2'
  logLevel: 'error' | 'info' | 'debug'
  certFile?: string
  keyFile?: string
}

const CreateTunnel: React.FC = () => {
  const navigate = useNavigate()
  const { addLog } = useLog()
  const { triggerRefresh } = useTunnel()
  const [form] = Form.useForm()
  const [selectedMode, setSelectedMode] = useState<'server' | 'client'>('server')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [config, setConfig] = useState<CreateTunnelForm>({
    mode: 'server',
    name: '',
    protocol: 'TCP',
    tunnelAddr: '',
    targetAddr: '',
    tlsMode: '1',
    logLevel: 'info',
  })

  const handleSubmit = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      const finalConfig = { ...config, ...values }
      setConfig(finalConfig)
      setShowConfirmModal(true)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleDeploy = async () => {
    try {
      // 使用配置管理器保存隧道
      const tunnelId = await configManager.addTunnel(config)
      console.log('隧道创建成功，ID:', tunnelId)
      addLog('info', `隧道创建成功: ${config.name}`, 'CreateTunnel')
      message.success('隧道创建成功！')
      setShowConfirmModal(false)
      
      // 询问用户是否立即启动隧道
      Modal.confirm({
        title: '启动隧道',
        content: `隧道 "${config.name}" 创建成功！是否立即启动？`,
        okText: '立即启动',
        cancelText: '稍后启动',
        onOk: async () => {
          try {
            addLog('info', `开始启动隧道: ${config.name}`, 'CreateTunnel')
            
            // 构建NodePass配置
            const nodePassConfig = {
              mode: config.mode,
              tunnelAddr: config.tunnelAddr,
              targetAddr: config.targetAddr,
              logLevel: config.logLevel,
              tlsMode: config.tlsMode,
              certFile: config.certFile || null,
              keyFile: config.keyFile || null
            }

            // 调用Rust后端启动NodePass
            const processId = await invoke<number>('start_nodepass', { 
              config: nodePassConfig,
              tunnelId: tunnelId
            })
            
            // 更新隧道状态
            await configManager.updateTunnel(tunnelId, { 
              status: 'running',
              processId: processId,
              lastStarted: new Date().toISOString()
            })

            message.success(`隧道启动成功，进程ID: ${processId}`)
            addLog('info', `隧道 ${config.name} 启动成功，进程ID: ${processId}`, 'CreateTunnel')
            
            // 触发隧道管理页面刷新
            triggerRefresh()
          } catch (error) {
            const errorMsg = `启动隧道失败: ${error}`
            message.error(errorMsg)
            addLog('error', errorMsg, 'CreateTunnel')
            
            // 更新隧道状态为错误
            await configManager.updateTunnel(tunnelId, { status: 'error' })
            
            // 触发隧道管理页面刷新以更新错误状态
            triggerRefresh()
          }
        },
        onCancel: () => {
          addLog('info', `隧道 ${config.name} 创建完成，未启动`, 'CreateTunnel')
          // 即使未启动也要触发刷新，更新总实例数量
          triggerRefresh()
        }
      })
      
      navigate('/tunnels')
    } catch (error) {
      const errorMsg = `创建隧道失败: ${error}`
      message.error(errorMsg)
      addLog('error', errorMsg, 'CreateTunnel')
    }
  }

  const handleCancel = () => {
    setShowConfirmModal(false)
  }

  const handleCopyCommand = () => {
    const command = buildCommand()
    navigator.clipboard.writeText(command).then(() => {
      message.success('命令已复制到剪贴板')
    }).catch(() => {
      message.error('复制失败')
    })
  }

  const buildCommand = () => {
    const { mode, tunnelAddr, targetAddr, tlsMode, logLevel, certFile, keyFile } = config
    let cmd = `nodepass ${mode}://${tunnelAddr}/${targetAddr}`
    const params = new URLSearchParams()
    
    params.set('log', logLevel)
    
    if (mode === 'server') {
      params.set('tls', tlsMode)
      if (tlsMode === '2') {
        if (certFile) params.set('crt', certFile)
        if (keyFile) params.set('key', keyFile)
      }
    }
    
    return `${cmd}?${params.toString()}`
  }

  const renderStepContent = () => {
    // 网络和安全配置内容
    const currentMode = form.getFieldValue('mode') || selectedMode
    
    return (
      <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => 
        prevValues.tlsMode !== currentValues.tlsMode || prevValues.mode !== currentValues.mode
      }>
        {({ getFieldValue }) => {
          const tlsMode = getFieldValue('tlsMode') || config.tlsMode
          const currentMode = getFieldValue('mode') || selectedMode
          
          return (
            <>
              <Row gutter={[24, 0]}>
                <Col span={12}>
                  <Form.Item
                    name="name"
                    label="隧道名称"
                    rules={[
                      { required: true, message: '请输入隧道名称' },
                      { pattern: /^[a-zA-Z0-9-_]+$/, message: '只能包含字母、数字、连字符和下划线' }
                    ]}
                  >
                    <Input placeholder="例如: web-server-tunnel" />
                  </Form.Item>
                </Col>
                
                <Col span={12}>
                  <Form.Item
                    name="protocol"
                    label="协议"
                    rules={[{ required: true, message: '请选择协议' }]}
                  >
                    <Select 
                      placeholder="选择协议"
                      style={{ width: '100%' }}
                    >
                      <Option value="TCP">
                        <Space>
                          <span>🔗</span>
                          <span>TCP</span>
                        </Space>
                      </Option>
                      <Option value="UDP">
                        <Space>
                          <span>📡</span>
                          <span>UDP</span>
                        </Space>
                      </Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={[24, 0]} style={{ marginTop: -8 }}>
                <Col span={12}>
                  <Form.Item
                    name="tunnelAddr"
                    label="隧道地址"
                    rules={[{ required: true, message: '请输入隧道地址' }]}
                  >
                    <Input 
                      placeholder="例如: 0.0.0.0:10101"
                      addonBefore={<span>🌐</span>}
                    />
                  </Form.Item>
                </Col>
                
                <Col span={12}>
                  <Form.Item
                    name="targetAddr"
                    label="目标地址"
                    rules={[{ required: true, message: '请输入目标地址' }]}
                  >
                    <Input 
                      placeholder="0.0.0.0:8080" 
                      addonBefore={<span>🌐</span>}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {/* 只有服务器模式才显示安全设置 */}
              {currentMode === 'server' && (
                <>
                  <Row gutter={[24, 0]} style={{ marginTop: -8 }}>
                    <Col span={12}>
                      <Form.Item
                        name="tlsMode"
                        label="TLS 安全级别"
                        rules={[{ required: true, message: '请选择TLS安全级别' }]}
                      >
                        <Select 
                          placeholder="选择TLS安全级别"
                          optionLabelProp="label"
                        >
                          <Option value="0" label="🔓 模式 0 - 无加密">
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🔓</span>
                                <span>模式 0 - 无加密</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', marginLeft: '20px' }}>
                                数据传输不加密，仅适用于测试环境
                              </div>
                            </div>
                          </Option>
                          <Option value="1" label="🔒 模式 1 - 自签名证书">
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🔒</span>
                                <span>模式 1 - 自签名证书</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', marginLeft: '20px' }}>
                                系统将自动生成证书，无需手动配置
                              </div>
                            </div>
                          </Option>
                          <Option value="2" label="🔐 模式 2 - 验证证书">
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🔐</span>
                                <span>模式 2 - 验证证书</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', marginLeft: '20px' }}>
                                使用自定义证书文件，需要配置证书路径
                              </div>
                            </div>
                          </Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    
                    <Col span={12}>
                      <Form.Item
                        name="logLevel"
                        label="日志级别"
                        rules={[{ required: true, message: '请选择日志级别' }]}
                      >
                        <Select placeholder="选择日志级别">
                          <Option value="error">
                            <Space>
                              <span>❌</span>
                              <span>Error - 仅错误信息</span>
                            </Space>
                          </Option>
                          <Option value="info">
                            <Space>
                              <span>ℹ️</span>
                              <span>Info - 常规信息</span>
                            </Space>
                          </Option>
                          <Option value="debug">
                            <Space>
                              <span>🐛</span>
                              <span>Debug - 详细调试信息</span>
                            </Space>
                          </Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 证书文件设置 - 始终显示，但根据TLS模式控制是否可用 */}
                  <Row gutter={[24, 0]} style={{ marginTop: -8 }}>
                    <Col span={12}>
                      <Form.Item
                        name="certFile"
                        label="证书文件路径"
                        rules={tlsMode === '2' ? [{ required: true, message: '请输入证书文件路径' }] : []}
                      >
                        <Input 
                          placeholder="/path/to/cert.pem" 
                          disabled={tlsMode !== '2'}
                        />
                      </Form.Item>
                    </Col>
                    
                    <Col span={12}>
                      <Form.Item
                        name="keyFile"
                        label="密钥文件路径"
                        rules={tlsMode === '2' ? [{ required: true, message: '请输入密钥文件路径' }] : []}
                      >
                        <Input 
                          placeholder="/path/to/key.pem" 
                          disabled={tlsMode !== '2'}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              )}
            </>
          )
        }}
      </Form.Item>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 合并的配置Card */}
      <Card style={{ 
        marginBottom: 8,
        display: 'flex', 
        flexDirection: 'column'
      }} bodyStyle={{ 
        padding: '20px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Form 
          form={form} 
          layout="vertical" 
          initialValues={{ ...config, mode: selectedMode }}
          style={{ width: '100%' }}
          size="middle"
        >
          {/* 隧道模式选择 */}
          <div style={{ marginBottom: 8 }}>
            <Form.Item
              name="mode"
              label="选择要创建的隧道类型："
              rules={[{ required: true, message: '请选择隧道模式' }]}
              style={{ marginBottom: '8px !important' }}
              className="tunnel-mode-form-item"
            >
              <div style={{ display: 'flex', gap: '24px', width: '100%' }}>
                <Card
                  hoverable
                  className={selectedMode === 'server' ? 'selected-card' : ''}
                  onClick={() => {
                    setSelectedMode('server')
                    form.setFieldValue('mode', 'server')
                  }}
                  style={{
                    flex: 1,
                    height: 100,
                    cursor: 'pointer',
                    border: selectedMode === 'server' ? '2px solid var(--card-selected-border)' : '1px solid var(--card-border)',
                    backgroundColor: selectedMode === 'server' ? 'var(--card-selected-bg)' : 'var(--card-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  bodyStyle={{
                    padding: '12px',
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%'
                  }}>
                    <FontAwesomeIcon icon={faServer} style={{ 
                      fontSize: 32, 
                      color: selectedMode === 'server' ? 'var(--card-selected-border)' : 'var(--text-secondary)',
                      marginBottom: 8 
                    }} />
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: selectedMode === 'server' ? 'bold' : 'normal',
                      color: selectedMode === 'server' ? 'var(--card-selected-border)' : 'var(--text-primary)',
                      marginBottom: 4
                    }}>
                      服务器模式
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-secondary)', 
                      lineHeight: '1.3'
                    }}>
                      接受入站连接，提供隧道访问
                    </div>
                  </div>
                </Card>

                <Card
                  hoverable
                  className={selectedMode === 'client' ? 'selected-card' : ''}
                  onClick={() => {
                    setSelectedMode('client')
                    form.setFieldValue('mode', 'client')
                  }}
                  style={{
                    flex: 1,
                    height: 100,
                    cursor: 'pointer',
                    border: selectedMode === 'client' ? '2px solid var(--card-selected-border)' : '1px solid var(--card-border)',
                    backgroundColor: selectedMode === 'client' ? 'var(--card-selected-bg)' : 'var(--card-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  bodyStyle={{
                    padding: '12px',
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%'
                  }}>
                    <FontAwesomeIcon icon={faDesktop} style={{ 
                      fontSize: 32, 
                      color: selectedMode === 'client' ? 'var(--card-selected-border)' : 'var(--text-secondary)',
                      marginBottom: 8 
                    }} />
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: selectedMode === 'client' ? 'bold' : 'normal',
                      color: selectedMode === 'client' ? 'var(--card-selected-border)' : 'var(--text-primary)',
                      marginBottom: 4
                    }}>
                      客户端模式
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-secondary)', 
                      lineHeight: '1.3'
                    }}>
                      连接到远程服务器，转发本地服务
                    </div>
                  </div>
                </Card>
              </div>
            </Form.Item>
          </div>

          {/* 网络和安全配置 */}
          <div>
            {renderStepContent()}
          </div>
        </Form>
        
        {/* 创建按钮 - 直接放在表单下方，无分割线 */}
        <div style={{ 
          marginTop: -8
        }}>
          <Button 
            type="primary"
            onClick={handleSubmit}
            icon={<CheckCircleOutlined />}
            block
          >
            创建隧道
          </Button>
        </div>
      </Card>

      {showConfirmModal && (
        <Modal
          open={showConfirmModal}
          onCancel={handleCancel}
          title="确认配置"
          width={800}
          footer={[
            <Button key="cancel" onClick={handleCancel}>
              取消
            </Button>,
            <Button key="deploy" type="primary" onClick={handleDeploy}>
              部署
            </Button>,
          ]}
        >
          <div style={{ marginTop: 16 }}>
            {/* 配置摘要 */}
            <Card 
              title="配置摘要" 
              style={{ marginBottom: 20 }}
              headStyle={{ background: 'var(--header-bg)', fontWeight: 'bold' }}
              size="small"
            >
              <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                <li><strong>隧道模式：</strong>{config.mode === 'server' ? '服务器模式' : '客户端模式'}</li>
                <li><strong>隧道名称：</strong>{config.name}</li>
                <li><strong>协议：</strong>{config.protocol}</li>
                <li><strong>隧道地址：</strong>{config.tunnelAddr}</li>
                <li><strong>目标地址：</strong>{config.targetAddr}</li>
                {config.mode === 'server' && (
                  <>
                    <li>
                      <strong>TLS 安全级别：</strong>
                      模式 {config.tlsMode} 
                      {config.tlsMode === '0' && ' (无加密)'}
                      {config.tlsMode === '1' && ' (自签名证书)'}
                      {config.tlsMode === '2' && ' (验证证书)'}
                    </li>
                    <li><strong>日志级别：</strong>{config.logLevel}</li>
                    {config.certFile && (
                      <li><strong>证书文件：</strong>{config.certFile}</li>
                    )}
                    {config.keyFile && (
                      <li><strong>密钥文件：</strong>{config.keyFile}</li>
                    )}
                  </>
                )}
              </ul>
            </Card>

            {/* 等效命令行 */}
            <Card 
              title="等效命令行"
              headStyle={{ background: 'var(--header-bg)', fontWeight: 'bold' }}
              size="small"
              extra={
                <Button 
                  type="text" 
                  icon={<CopyOutlined />} 
                  onClick={handleCopyCommand}
                  size="small"
                >
                  复制
                </Button>
              }
            >
              <div style={{ 
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                fontSize: '13px',
                background: 'var(--code-bg)',
                color: 'var(--code-text)',
                padding: '12px',
                borderRadius: '4px',
                border: '1px solid var(--card-border)',
                wordBreak: 'break-all',
                lineHeight: '1.5'
              }}>
                {buildCommand()}
              </div>
            </Card>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default CreateTunnel 