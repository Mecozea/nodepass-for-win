import React, { useState } from 'react'
import { Steps, Card, Button, Form, Input, Select, Space, Descriptions, message, Row, Col } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  DatabaseOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  DesktopOutlined,
  LaptopOutlined,
} from '@ant-design/icons'

const { Option } = Select
const { TextArea } = Input

interface TunnelConfig {
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
  const [currentStep, setCurrentStep] = useState(0)
  const [form] = Form.useForm()
  const [selectedMode, setSelectedMode] = useState<'server' | 'client'>('server')
  const [config, setConfig] = useState<TunnelConfig>({
    mode: 'server',
    name: '',
    protocol: 'TCP',
    tunnelAddr: '',
    targetAddr: '',
    tlsMode: '1',
    logLevel: 'info',
  })

  // 只有3步：隧道模式、网络配置、确认配置
  const steps = [
    {
      title: '隧道模式',
      icon: <DatabaseOutlined />,
    },
    {
      title: '网络配置',
      icon: <GlobalOutlined />,
    },
    {
      title: '确认配置',
      icon: <CheckCircleOutlined />,
    },
  ]

  const handleNext = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      setConfig({ ...config, ...values })
      setCurrentStep(currentStep + 1)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handlePrev = () => {
    setCurrentStep(currentStep - 1)
  }

  const handleSubmit = async () => {
    try {
      // TODO: 调用后端API创建隧道
      console.log('创建隧道配置:', config)
      message.success('隧道创建成功！')
      navigate('/tunnels')
    } catch (error) {
      message.error(`创建隧道失败: ${error}`)
    }
  }

  const buildCommand = () => {
    const { mode, tunnelAddr, targetAddr, tlsMode, logLevel, certFile, keyFile } = config
    let cmd = `${mode}://${tunnelAddr}/${targetAddr}`
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
    switch (currentStep) {
      case 0:
        return (
          <div style={{ 
            flex: 1,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <Form 
              form={form} 
              layout="vertical" 
              initialValues={{ mode: selectedMode }}
              style={{ width: '100%' }}
            >
              <Form.Item
                name="mode"
                rules={[{ required: true, message: '请选择隧道模式' }]}
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
                      height: 140,
                      cursor: 'pointer',
                      border: selectedMode === 'server' ? '2px solid #131B2C' : '1px solid #d9d9d9',
                      backgroundColor: selectedMode === 'server' ? '#f6f8ff' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    bodyStyle={{
                      padding: '16px',
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
                      <DesktopOutlined style={{ 
                        fontSize: 32, 
                        color: selectedMode === 'server' ? '#131B2C' : '#666',
                        marginBottom: 8 
                      }} />
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: selectedMode === 'server' ? 'bold' : 'normal',
                        color: selectedMode === 'server' ? '#131B2C' : '#333',
                        marginBottom: 4
                      }}>
                        服务器模式
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#666', 
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
                      height: 140,
                      cursor: 'pointer',
                      border: selectedMode === 'client' ? '2px solid #131B2C' : '1px solid #d9d9d9',
                      backgroundColor: selectedMode === 'client' ? '#f6f8ff' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    bodyStyle={{
                      padding: '16px',
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
                      <LaptopOutlined style={{ 
                        fontSize: 32, 
                        color: selectedMode === 'client' ? '#131B2C' : '#666',
                        marginBottom: 8 
                      }} />
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: selectedMode === 'client' ? 'bold' : 'normal',
                        color: selectedMode === 'client' ? '#131B2C' : '#333',
                        marginBottom: 4
                      }}>
                        客户端模式
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#666', 
                        lineHeight: '1.3'
                      }}>
                        连接到远程服务器，转发本地服务
                      </div>
                    </div>
                  </Card>
                </div>
              </Form.Item>
            </Form>
          </div>
        )

      case 1:
        const currentMode = form.getFieldValue('mode') || selectedMode
        
        return (
          <Form form={form} layout="vertical" initialValues={config}>
            <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.tlsMode !== currentValues.tlsMode}>
              {({ getFieldValue }) => {
                const tlsMode = getFieldValue('tlsMode') || config.tlsMode
                
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

                    <Row gutter={[24, 0]}>
                      <Col span={12}>
                        <Form.Item
                          name="tunnelAddr"
                          label="隧道地址"
                          rules={[{ required: true, message: '请输入隧道地址' }]}
                        >
                          <Input 
                            placeholder={
                              currentMode === 'server' 
                                ? "0.0.0.0:10101" 
                                : "server.example.com:10101"
                            } 
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
                        <div style={{ 
                          margin: '24px 0 16px 0', 
                          fontSize: '16px', 
                          fontWeight: 'bold', 
                          color: '#333'
                        }}>
                          安全设置
                        </div>
                        
                        <Row gutter={[24, 0]}>
                          <Col span={12}>
                            <Form.Item
                              name="tlsMode"
                              label="TLS 安全级别"
                              rules={[{ required: true, message: '请选择TLS安全级别' }]}
                            >
                              <Select placeholder="选择TLS安全级别">
                                <Option value="0">
                                  <Space>
                                    <span>🔓</span>
                                    <span>模式 0 - 无加密</span>
                                  </Space>
                                </Option>
                                <Option value="1">
                                  <Space>
                                    <span>🔒</span>
                                    <span>模式 1 - 自签名证书</span>
                                  </Space>
                                </Option>
                                <Option value="2">
                                  <Space>
                                    <span>🔐</span>
                                    <span>模式 2 - 验证证书</span>
                                  </Space>
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
                        <Row gutter={[24, 0]}>
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

                        {/* TLS模式提示信息 */}
                        {(tlsMode === '0' || tlsMode === '1') && (
                          <div style={{ 
                            padding: '8px 12px', 
                            backgroundColor: '#f6f8fa', 
                            borderRadius: '4px', 
                            fontSize: '12px', 
                            color: '#666',
                            marginTop: '8px'
                          }}>
                            {tlsMode === '0' && '⚠️ 无加密模式：数据传输不加密，仅适用于测试环境'}
                            {tlsMode === '1' && '🔒 自签名证书模式：系统将自动生成证书，无需手动配置'}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )
              }}
            </Form.Item>
          </Form>
        )

      case 2:
        return (
          <div>
            <Card 
              title="配置摘要" 
              style={{ marginBottom: 20 }}
              headStyle={{ background: '#f6f8fa', fontWeight: 'bold' }}
            >
              <div style={{ color: '#666', marginBottom: 16 }}>
                请确认以下隧道配置：
              </div>
              
              <Descriptions column={2} bordered>
                <Descriptions.Item label="隧道模式">
                  {config.mode === 'server' ? '服务器模式' : '客户端模式'}
                </Descriptions.Item>
                <Descriptions.Item label="隧道名称">{config.name}</Descriptions.Item>
                <Descriptions.Item label="协议">{config.protocol}</Descriptions.Item>
                <Descriptions.Item label="隧道地址">{config.tunnelAddr}</Descriptions.Item>
                <Descriptions.Item label="目标地址">{config.targetAddr}</Descriptions.Item>
                {config.mode === 'server' && (
                  <>
                    <Descriptions.Item label="TLS 安全级别">
                      模式 {config.tlsMode} 
                      {config.tlsMode === '0' && ' (无加密)'}
                      {config.tlsMode === '1' && ' (自签名证书)'}
                      {config.tlsMode === '2' && ' (验证证书)'}
                    </Descriptions.Item>
                    <Descriptions.Item label="日志级别">{config.logLevel}</Descriptions.Item>
                    {config.certFile && (
                      <Descriptions.Item label="证书文件" span={2}>{config.certFile}</Descriptions.Item>
                    )}
                    {config.keyFile && (
                      <Descriptions.Item label="密钥文件" span={2}>{config.keyFile}</Descriptions.Item>
                    )}
                  </>
                )}
              </Descriptions>
            </Card>

            <Card 
              title="等效命令行"
              headStyle={{ background: '#f6f8fa', fontWeight: 'bold' }}
            >
              <TextArea
                value={buildCommand()}
                readOnly
                rows={3}
                style={{ 
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                  fontSize: '13px',
                  background: '#f6f8fa',
                  color: '#e83e8c'
                }}
              />
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: 16 }}>创建隧道</h1>

      <Card style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        height: 'calc(100vh - 120px)' // 固定Card高度
      }} bodyStyle={{ 
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}>
        {/* 顶部：步骤标题 */}
        <div style={{ 
          marginBottom: 16, 
          padding: '8px 0',
          flexShrink: 0 // 防止压缩
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#131B2C',
              color: 'white',
              fontSize: '11px',
              fontWeight: 'bold'
            }}>
              {currentStep + 1}
            </span>
            <h2 style={{ 
              margin: 0, 
              fontSize: '15px', 
              fontWeight: 'bold',
              color: '#131B2C'
            }}>
              {currentStep === 0 && '选择隧道模式'}
              {currentStep === 1 && '网络和安全配置'}
              {currentStep === 2 && '确认配置'}
            </h2>
          </div>
        </div>
        
        {/* 中间：步骤内容 */}
        <div style={{ 
          flex: 1, 
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: '28px' // 添加左缩进，与标题对齐
        }}>
          {renderStepContent()}
        </div>

        {/* 底部：按钮区域 */}
        <div style={{ 
          height: '60px',
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 16, 
          flexShrink: 0 // 防止压缩
        }}>
          <Button 
            disabled={currentStep === 0}
            onClick={handlePrev}
            size="large"
          >
            上一步
          </Button>
          
          {currentStep < steps.length - 1 ? (
            <Button 
              type="primary"
              onClick={handleNext}
              icon={<ArrowRightOutlined />}
              size="large"
            >
              下一步
            </Button>
          ) : (
            <Button 
              type="primary"
              onClick={handleSubmit}
              icon={<CheckCircleOutlined />}
              size="large"
            >
              创建隧道
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default CreateTunnel 