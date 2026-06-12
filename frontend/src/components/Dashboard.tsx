import { useState, useMemo } from 'react'
import {
  Layout, Tabs, Statistic, Row, Col, Card, Tag, Button, Input, Table, Drawer, Descriptions,
  Space, Progress, Modal, Form, InputNumber, Select, message, Popconfirm, Empty, Tooltip,
  Divider, Badge, AutoComplete
} from 'antd'
import {
  LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined, SaveOutlined, CopyOutlined, SearchOutlined, FileTextOutlined } from '@ant-design/icons'
import { useTaskStore } from '../store/tasks'
import type { Task, TaskStatus, TaskTemplate } from '../types'

const { Header, Content } = Layout
const { TextArea } = Input
const { Option } = Select

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'default', running: 'processing', success: 'success', failed: 'error', retry: 'warning'
}

const TAG_COLORS = ['magenta', 'red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple']

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

interface TemplateFormValues {
  name: string
  description: string
  taskName: string
  maxRetries: number
  tags: string[]
  paramsJson: string
}

function TemplateModal({
  open, onClose, onSubmit, initial
}: {
  open: boolean
  onClose: () => void
  onSubmit: (v: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void
  initial?: TaskTemplate | null
}) {
  const [form] = Form.useForm<TemplateFormValues>()

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      let params: Record<string, any> = {}
      if (values.paramsJson?.trim()) {
        params = JSON.parse(values.paramsJson)
      }
      onSubmit({
        name: values.name,
        description: values.description,
        taskName: values.taskName,
        maxRetries: values.maxRetries,
        tags: values.tags || [],
        params,
      })
      form.resetFields()
      onClose()
      message.success(initial ? '模板更新成功' : '模板创建成功')
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('参数 JSON 格式不正确')
    }
  }

  return (
    <Modal
      title={initial ? '编辑任务模板' : '新建任务模板'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText={initial ? '保存修改' : '创建模板'}
      width={560}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initial ? {
          name: initial.name,
          description: initial.description,
          taskName: initial.taskName,
          maxRetries: initial.maxRetries,
          tags: initial.tags,
          paramsJson: Object.keys(initial.params).length ? JSON.stringify(initial.params, null, 2) : '',
        } : { maxRetries: 3, tags: [] }}
      >
        <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
          <Input placeholder="例如：每日数据同步" prefix={<FileTextOutlined />} />
        </Form.Item>
        <Form.Item name="description" label="模板描述">
          <TextArea rows={2} placeholder="描述这个模板的用途..." />
        </Form.Item>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="taskName" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
              <Input placeholder="例如：data_sync" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="maxRetries" label="最大重试次数" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="tags" label="标签">
          <Select mode="tags" placeholder="输入标签后回车添加" style={{ width: '100%' }} tokenSeparators={[',', ' ']}>
          </Select>
        </Form.Item>
        <Form.Item name="paramsJson" label="任务参数 (JSON)">
          <TextArea rows={5} placeholder='{"key": "value"}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function TaskTemplatesPanel() {
  const store = useTaskStore()
  const [searchText, setSearchText] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TaskTemplate | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTpl, setDetailTpl] = useState<TaskTemplate | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const allTags = useMemo(() => {
    const s = new Set<string>()
    store.templates.forEach(t => t.tags.forEach(tag => s.add(tag)))
    return Array.from(s)
  }, [store.templates])

  const filtered = useMemo(() => {
    return store.templates.filter(t => {
      const matchSearch = !searchText ||
        t.name.toLowerCase().includes(searchText.toLowerCase()) ||
        t.description.toLowerCase().includes(searchText.toLowerCase()) ||
        t.taskName.toLowerCase().includes(searchText.toLowerCase())
      const matchTag = selectedTag ? t.tags.includes(selectedTag) : true
      return matchSearch && matchTag
    })
  }, [store.templates, searchText, selectedTag])

  const handleCreate = (data: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    store.createTemplate(data)
  }

  const handleUpdate = (data: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editing) store.updateTemplate(editing.id, data)
    setEditing(null)
  }

  const handleApply = (tpl: TaskTemplate) => {
    store.addTaskFromTemplate(tpl.id)
    message.success(`已应用模板「${tpl.name}」创建任务`)
  }

  const handleDelete = (tpl: TaskTemplate) => {
    store.deleteTemplate(tpl.id)
    message.success(`已删除模板「${tpl.name}」`)
  }

  const templateColumns = [
    {
      title: '模板名称', dataIndex: 'name', key: 'name',
      render: (n: string, r: TaskTemplate) => (
        <a onClick={() => { setDetailTpl(r); setDetailOpen(true) }} style={{ fontWeight: 600 }}>{n}</a>
      ),
    },
    { title: '任务名', dataIndex: 'taskName', key: 'taskName', width: 130, render: (t: string) => <Tag color="blue">{t}</Tag> },
    {
      title: '标签', key: 'tags', width: 180,
      render: (_: any, r: TaskTemplate) => (
        <Space size={[4, 4]} wrap>
          {r.tags.map(tag => (
            <Tag
              key={tag}
              color={tagColor(tag)}
              style={{ cursor: 'pointer', margin: 0 }}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            >{tag}</Tag>
          ))}
        </Space>
      ),
    },
    { title: '重试次数', dataIndex: 'maxRetries', key: 'maxRetries', width: 100, align: 'center' as const },
    {
      title: '更新时间', key: 'updatedAt', width: 170,
      render: (_: any, r: TaskTemplate) => new Date(r.updatedAt).toLocaleString(),
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, r: TaskTemplate) => (
        <Space size="small">
          <Tooltip title="一键创建任务">
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleApply(r)}>
              应用
            </Button>
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>编辑</Button>
          <Popconfirm title="确认删除此模板？" onConfirm={() => handleDelete(r)} okText="删除" cancelText="取消">
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={12} align="middle" wrap>
          <Col xs={24} sm={12} md={8}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索模板名称/描述/任务名"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={10}>
            <Space size={[4, 4]} wrap>
              <span style={{ color: '#8c8c8c', fontSize: 13 }}>标签筛选:</span>
              <Tag
                color={selectedTag === null ? 'blue' : 'default'}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedTag(null)}
              >全部</Tag>
              {allTags.map(tag => (
                <Tag
                  key={tag}
                  color={selectedTag === tag ? tagColor(tag) : 'default'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                >{tag}</Tag>
              ))}
            </Space>
          </Col>
          <Col xs={24} sm={24} md={6} style={{ textAlign: 'right' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建模板
            </Button>
          </Col>
        </Row>
      </Card>

      <Card>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic title="模板总数" value={store.templates.length} prefix={<FileTextOutlined />} />
          </Col>
          <Col span={6}>
            <Statistic title="标签总数" value={allTags.length} />
          </Col>
          <Col span={6}>
            <Statistic title="筛选结果" value={filtered.length} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col span={6}>
            <Statistic
              title="本月更新"
              value={store.templates.filter(t => t.updatedAt > Date.now() - 30 * 86400000).length}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
        </Row>

        <Table
          dataSource={filtered}
          columns={templateColumns}
          rowKey="id"
          size="middle"
          locale={{ emptyText: <Empty description="暂无模板，点击右上角「新建模板」开始创建" /> }}
          pagination={{ pageSize: 8, showSizeChanger: true, showTotal: (total) => `共 ${total} 个模板` }}
        />
      </Card>

      <TemplateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <TemplateModal
        open={!!editing}
        onClose={() => setEditing(null)}
        onSubmit={handleUpdate}
        initial={editing}
      />

      <Drawer
        title="模板详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={520}
        extra={detailTpl ? (
          <Space>
            <Button icon={<CopyOutlined />} onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(detailTpl.params, null, 2))
              message.success('参数已复制到剪贴板')
            }}>复制参数</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => {
              handleApply(detailTpl)
              setDetailOpen(false)
            }}>应用此模板</Button>
          </Space>
        ) : null}
      >
        {detailTpl && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="模板名称">
                <span style={{ fontWeight: 600 }}>{detailTpl.name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="模板描述">
                {detailTpl.description || <span style={{ color: '#8c8c8c' }}>无描述</span>}
              </Descriptions.Item>
              <Descriptions.Item label="任务名称">
                <Tag color="blue">{detailTpl.taskName}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="最大重试次数">{detailTpl.maxRetries}</Descriptions.Item>
              <Descriptions.Item label="标签">
                <Space size={[4, 4]} wrap>
                  {detailTpl.tags.length ? detailTpl.tags.map(tag => (
                    <Tag key={tag} color={tagColor(tag)}>{tag}</Tag>
                  )) : <span style={{ color: '#8c8c8c' }}>无标签</span>}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{new Date(detailTpl.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{new Date(detailTpl.updatedAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>
            <Divider orientation="left" orientationMargin={0} style={{ marginTop: 24 }}>任务参数 (Params)</Divider>
            <pre style={{
              background: '#1f1f1f', padding: 16, borderRadius: 8,
              fontSize: 12, color: '#d4d4d4', margin: 0,
              maxHeight: 280, overflow: 'auto', border: '1px solid #333',
            }}>
              {Object.keys(detailTpl.params).length
                ? JSON.stringify(detailTpl.params, null, 2)
                : '// 无自定义参数'}
            </pre>
          </>
        )}
      </Drawer>
    </div>
  )
}

function SaveAsTemplateModal({
  open, onClose, taskName, onSave
}: {
  open: boolean
  onClose: () => void
  taskName: string
  onSave: (data: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void
}) {
  const [form] = Form.useForm<TemplateFormValues>()

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      let params: Record<string, any> = {}
      if (values.paramsJson?.trim()) params = JSON.parse(values.paramsJson)
      onSave({
        name: values.name,
        description: values.description,
        taskName: values.taskName,
        maxRetries: values.maxRetries,
        tags: values.tags || [],
        params,
      })
      form.resetFields()
      onClose()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('参数 JSON 格式不正确')
    }
  }

  return (
    <Modal
      title={<span><SaveOutlined style={{ color: '#faad14' }} /> 保存为任务模板</span>}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="保存模板"
      width={560}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ taskName, maxRetries: 3, tags: [], paramsJson: '' }}
      >
        <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
          <Input placeholder="为这个模板起个名字" prefix={<FileTextOutlined />} />
        </Form.Item>
        <Form.Item name="description" label="模板描述">
          <TextArea rows={2} placeholder="描述这个模板的用途..." />
        </Form.Item>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="taskName" label="任务名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="maxRetries" label="最大重试次数" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="tags" label="标签">
          <Select mode="tags" placeholder="输入标签后回车添加" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="paramsJson" label="任务参数 (JSON)">
          <TextArea rows={4} placeholder='{"key": "value"}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default function Dashboard() {
  const store = useTaskStore()
  const [newTaskName, setNewTaskName] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [templateSelectOpen, setTemplateSelectOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>()

  const taskColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 120 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: TaskStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    { title: '节点', dataIndex: 'node', key: 'node' },
    { title: '重试', key: 'retries', render: (_: any, r: Task) => `${r.retries}/${r.maxRetries}` },
    { title: '耗时', key: 'duration', render: (_: any, r: Task) => r.duration ? `${(r.duration / 1000).toFixed(1)}s` : '-' },
    {
      title: '操作', key: 'actions', render: (_: any, r: Task) => (
        <Space>
          {r.status === 'failed' && <Button size="small" type="primary" onClick={() => store.retryTask(r.id)}>重试</Button>}
          {r.status === 'running' && <Button size="small" danger onClick={() => store.cancelTask(r.id)}>取消</Button>}
          <Button size="small" onClick={() => { store.selectTask(r); setDrawerOpen(true) }}>详情</Button>
        </Space>
      ),
    },
  ]

  const successCount = store.tasks.filter(t => t.status === 'success').length
  const failedCount = store.tasks.filter(t => t.status === 'failed').length
  const runningCount = store.tasks.filter(t => t.status === 'running').length

  const handleAddTask = () => {
    if (!newTaskName.trim()) return
    if (selectedTemplateId) {
      store.addTaskFromTemplate(selectedTemplateId)
      message.success('从模板创建任务成功')
    } else {
      store.addTask(newTaskName.trim())
    }
    setNewTaskName('')
    setSelectedTemplateId(undefined)
  }

  const templateOptions = store.templates.map(t => ({
    value: t.id,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>📋 {t.name}</span>
        <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{t.taskName}</Tag>
      </div>
    ),
  }))

  const handleSaveTemplate = (data: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    store.createTemplate(data)
    message.success('任务参数已保存为模板')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', height: 'auto', padding: '12px 24px', lineHeight: 'normal' }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: 18, whiteSpace: 'nowrap' }}>
          🔧 分布式任务调度与监控平台
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge count={store.templates.length} offset={[-2, 2]}>
            <AutoComplete
              style={{ width: 220 }}
              placeholder="选择模板快速创建..."
              open={templateSelectOpen}
              onDropdownVisibleChange={(o) => setTemplateSelectOpen(o)}
              value={selectedTemplateId}
              options={templateOptions}
              onChange={(v) => {
                setSelectedTemplateId(v)
                const tpl = store.templates.find(t => t.id === v)
                if (tpl) setNewTaskName(tpl.taskName)
              }}
              notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板" />}
            />
          </Badge>
          <Input
            placeholder={selectedTemplateId ? '已选模板，点击添加创建任务' : '任务名称'}
            value={newTaskName}
            onChange={e => setNewTaskName(e.target.value)}
            onPressEnter={handleAddTask}
            disabled={!!selectedTemplateId}
            style={{ width: 180 }}
            allowClear
            onClear={() => setSelectedTemplateId(undefined)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTask}>
            添加任务
          </Button>
          <Tooltip title="将当前输入的任务参数保存为模板">
            <Button icon={<SaveOutlined />} onClick={() => setSaveModalOpen(true)}>
              保存为模板
            </Button>
          </Tooltip>
        </div>
      </Header>

      <Content style={{ padding: 16 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="总任务" value={store.tasks.length} /></Card></Col>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="运行中" value={runningCount} valueStyle={{ color: '#1890ff' }} /></Card></Col>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="成功" value={successCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
          <Col xs={24} sm={12} md={6}><Card><Statistic title="失败" value={failedCount} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        </Row>

        <Tabs
          items={[
            {
              key: 'metrics', label: '📊 监控指标', children: (
                <Row gutter={16}>
                  <Col xs={24} lg={12}>
                    <Card title="运行中任务数">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={store.metrics}>
                          <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                          <YAxis fontSize={10} />
                          <ReTooltip labelFormatter={t => new Date(t as number).toLocaleString()} />
                          <Area type="monotone" dataKey="runningTasks" stroke="#1890ff" fill="#1890ff" fillOpacity={0.3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card title="成功率 %">
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={store.metrics}>
                          <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                          <YAxis domain={[0, 100]} fontSize={10} />
                          <ReTooltip labelFormatter={t => new Date(t as number).toLocaleString()} />
                          <Line type="monotone" dataKey="successRate" stroke="#52c41a" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                  <Col span={24} style={{ marginTop: 16 }}>
                    <Card title="平均延迟 (ms)">
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={store.metrics}>
                          <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                          <YAxis fontSize={10} />
                          <ReTooltip />
                          <Area type="monotone" dataKey="avgLatency" stroke="#faad14" fill="#faad14" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>
              )
            },
            {
              key: 'tasks', label: '📋 任务列表', children: (
                <Table
                  dataSource={store.tasks}
                  columns={taskColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                />
              )
            },
            {
              key: 'templates',
              label: <span>📑 任务模板中心 <Badge count={store.templates.length} size="small" style={{ backgroundColor: '#722ed1' }} /></span>,
              children: <TaskTemplatesPanel />
            },
            {
              key: 'nodes', label: '🖥️ 集群节点', children: (
                <Row gutter={16}>
                  {store.nodes.map(node => (
                    <Col xs={24} md={12} lg={8} key={node.id} style={{ marginBottom: 16 }}>
                      <Card
                        title={<span>{node.type === 'scheduler' ? '🎯' : '⚙️'} {node.name}</span>}
                        extra={<Tag color={node.status === 'online' ? 'green' : node.status === 'overloaded' ? 'orange' : 'red'}>{node.status}</Tag>}
                      >
                        <Progress percent={Math.round(node.cpu)} strokeColor={node.cpu > 80 ? '#ff4d4f' : '#1890ff'} format={v => `CPU ${v}%`} />
                        <Progress percent={Math.round(node.memory)} strokeColor={node.memory > 80 ? '#ff4d4f' : '#52c41a'} format={v => `MEM ${v}%`} />
                        <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                          任务数: {node.tasks} | 运行时间: {Math.floor(node.uptime / 3600)}h
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )
            },
          ]}
        />

        <Drawer title="任务详情" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={500}>
          {store.selectedTask && (
            <>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="ID">{store.selectedTask.id}</Descriptions.Item>
                <Descriptions.Item label="名称">{store.selectedTask.name}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={STATUS_COLORS[store.selectedTask.status]}>{store.selectedTask.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="执行节点">{store.selectedTask.node}</Descriptions.Item>
                <Descriptions.Item label="重试次数">{store.selectedTask.retries}/{store.selectedTask.maxRetries}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{new Date(store.selectedTask.createdAt).toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="耗时">
                  {store.selectedTask.duration ? `${(store.selectedTask.duration / 1000).toFixed(1)}s` : '-'}
                </Descriptions.Item>
              </Descriptions>
              <h4 style={{ marginTop: 16 }}>执行日志</h4>
              <pre style={{
                background: '#1f1f1f', padding: 12, borderRadius: 8,
                fontSize: 12, maxHeight: 300, overflow: 'auto',
              }}>
                {store.selectedTask.logs.join('\n')}
              </pre>
            </>
          )}
        </Drawer>

        <SaveAsTemplateModal
          open={saveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          taskName={newTaskName || 'custom_task'}
          onSave={handleSaveTemplate}
        />
      </Content>
    </Layout>
  )
}
