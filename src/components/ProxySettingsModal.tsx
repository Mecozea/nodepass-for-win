import React, { useState, useEffect } from 'react'
import { Modal, Form, Input, Switch, Select, Button, Space, Row, Col, message } from 'antd'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { ProxySettings } from '../utils/config'

interface ProxySettingsModalProps {
  open: boolean
  onCancel: () => void
  onSave: (proxySettings: ProxySettings) => Promise<void>
  initialValues: ProxySettings
}

const ProxySettingsModal: React.FC<ProxySettingsModalProps> = ({
  open,
  onCancel,
  onSave,
  initialValues
}) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)


  useEffect(() => {
    if (open) {
      form.setFieldsValue(initialValues)
    }
  }, [open, initialValues, form])

  const handleSave = async () => {
    try {
      setLoading(true)
      const values = await form.validateFields()
      await onSave(values)
      message.success('代理设置已保存')
      onCancel()
    } catch (error) {
      console.error('保存代理设置失败:', error)
      if (error instanceof Error) {
        message.error(`保存失败: ${error.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      title={
        <Space>
          <FontAwesomeIcon icon={faGlobe} />
          <span>代理设置</span>
        </Space>
      }
      open={open}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button onClick={handleCancel}>
            取消
          </Button>
          <Button type="primary" onClick={handleSave} loading={loading}>
            保存
          </Button>
        </Space>
      }
      width={500}
      destroyOnClose
    >
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          label="启用代理"
          name="enabled"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          label="代理类型"
          name="type"
        >
          <Select>
            <Select.Option value="http">HTTP</Select.Option>
            <Select.Option value="socks5">SOCKS5</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="服务器地址">
          <Row gutter={8}>
            <Col span={14}>
              <Form.Item
                name="host"
                noStyle
                rules={[
                  {
                    validator: (_, value) => {
                      const enabled = form.getFieldValue('enabled')
                      if (enabled && !value) {
                        return Promise.reject(new Error('请输入代理服务器地址'))
                      }
                      return Promise.resolve()
                    }
                  }
                ]}
              >
                <Input placeholder="代理服务器地址" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item
                name="port"
                noStyle
                rules={[
                  {
                    validator: (_, value) => {
                      const enabled = form.getFieldValue('enabled')
                      if (enabled && !value) {
                        return Promise.reject(new Error('请输入端口'))
                      }
                      if (value && (isNaN(Number(value)) || Number(value) < 1 || Number(value) > 65535)) {
                        return Promise.reject(new Error('端口范围: 1-65535'))
                      }
                      return Promise.resolve()
                    }
                  }
                ]}
              >
                <Input placeholder="端口" />
              </Form.Item>
            </Col>
          </Row>
        </Form.Item>

        <Form.Item label="认证信息">
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item
                name="username"
                noStyle
              >
                <Input placeholder="用户名（可选）" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="password"
                noStyle
              >
                <Input.Password
                  placeholder="密码（可选）"
                  iconRender={(visible) => (
                    <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
                  )}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ProxySettingsModal 