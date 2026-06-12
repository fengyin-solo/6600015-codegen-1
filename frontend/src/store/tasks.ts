import { create } from 'zustand'
import type { Task, ClusterNode, MetricsSnapshot, TaskStatus, TaskTemplate } from '../types'

function mockTemplates(): TaskTemplate[] {
  return [
    {
      id: 'tpl-1001',
      name: '每日数据同步',
      description: '每日凌晨同步生产数据库到分析库',
      taskName: 'data_sync',
      maxRetries: 5,
      tags: ['daily', 'data'],
      params: { source: 'prod_db', target: 'analytics_db', batch_size: 10000 },
      createdAt: Date.now() - 86400000 * 7,
      updatedAt: Date.now() - 86400000 * 2,
    },
    {
      id: 'tpl-1002',
      name: '批量邮件发送',
      description: '向订阅用户发送批量通知邮件',
      taskName: 'email_batch',
      maxRetries: 3,
      tags: ['notification', 'email'],
      params: { template: 'weekly_newsletter', priority: 'normal' },
      createdAt: Date.now() - 86400000 * 5,
      updatedAt: Date.now() - 86400000 * 1,
    },
    {
      id: 'tpl-1003',
      name: '数据库备份',
      description: '完整数据库备份并上传到对象存储',
      taskName: 'db_backup',
      maxRetries: 2,
      tags: ['backup', 'maintenance'],
      params: { compression: 'gzip', upload_to_s3: true, retention_days: 30 },
      createdAt: Date.now() - 86400000 * 10,
      updatedAt: Date.now() - 86400000 * 3,
    },
    {
      id: 'tpl-1004',
      name: '缓存预热',
      description: '预热热点数据缓存提升访问速度',
      taskName: 'cache_warm',
      maxRetries: 3,
      tags: ['cache', 'performance'],
      params: { cache_keys: 'hot_items', ttl: 3600 },
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now() - 86400000 * 1,
    },
  ]
}

// Mock data generators
function mockNodes(): ClusterNode[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `node-${i + 1}`,
    name: i === 0 ? 'scheduler-main' : `worker-${i}`,
    type: i === 0 ? 'scheduler' as const : 'worker' as const,
    status: Math.random() > 0.1 ? 'online' as const : 'overloaded' as const,
    cpu: 20 + Math.random() * 60,
    memory: 30 + Math.random() * 50,
    tasks: Math.floor(Math.random() * 8),
    uptime: 3600 + Math.floor(Math.random() * 86400),
  }))
}

function mockTasks(nodes: ClusterNode[]): Task[] {
  const names = ['data_sync', 'email_batch', 'report_gen', 'cache_warm', 'log_rotate', 'db_backup', 'index_rebuild', 'health_check']
  return Array.from({ length: 12 }, (_, i) => {
    const status: TaskStatus[] = ['pending', 'running', 'success', 'failed']
    const s = status[Math.floor(Math.random() * 4)]
    const node = nodes[Math.floor(Math.random() * nodes.length)]
    return {
      id: `task-${1000 + i}`,
      name: names[i % names.length],
      status: s,
      node: node.name,
      createdAt: Date.now() - Math.floor(Math.random() * 600000),
      startedAt: s !== 'pending' ? Date.now() - Math.floor(Math.random() * 300000) : undefined,
      completedAt: (s === 'success' || s === 'failed') ? Date.now() - Math.floor(Math.random() * 60000) : undefined,
      retries: s === 'failed' ? Math.floor(Math.random() * 3) : 0,
      maxRetries: 3,
      duration: s === 'success' ? 1000 + Math.floor(Math.random() * 30000) : undefined,
      logs: [`[INFO] Task ${names[i % names.length]} started`, `[INFO] Processing on ${node.name}`],
    }
  })
}

const initialNodes = mockNodes()

interface TaskStore {
  tasks: Task[]
  nodes: ClusterNode[]
  metrics: MetricsSnapshot[]
  selectedTask: Task | null
  templates: TaskTemplate[]
  addTask: (name: string, maxRetries?: number, params?: Record<string, any>) => void
  addTaskFromTemplate: (templateId: string) => void
  retryTask: (id: string) => void
  cancelTask: (id: string) => void
  selectTask: (t: Task | null) => void
  refreshNodes: () => void
  addMetric: () => void
  createTemplate: (data: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateTemplate: (id: string, data: Partial<TaskTemplate>) => void
  deleteTemplate: (id: string) => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: mockTasks(initialNodes),
  nodes: initialNodes,
  metrics: Array.from({ length: 20 }, (_, i) => ({
    time: Date.now() - (20 - i) * 5000,
    totalTasks: 100 + i * 2,
    runningTasks: 3 + Math.floor(Math.random() * 5),
    successRate: 85 + Math.random() * 14,
    avgLatency: 500 + Math.random() * 2000,
    nodeCount: 5,
  })),
  selectedTask: null,
  templates: mockTemplates(),
  addTask: (name, maxRetries = 3, params = {}) => {
    const task: Task = {
      id: `task-${Date.now()}`,
      name, status: 'pending',
      node: get().nodes[Math.floor(Math.random() * get().nodes.length)].name,
      createdAt: Date.now(), retries: 0, maxRetries,
      logs: [`[INFO] Task ${name} queued`, `[INFO] Params: ${JSON.stringify(params)}`],
    }
    set({ tasks: [task, ...get().tasks] })
  },
  addTaskFromTemplate: (templateId) => {
    const template = get().templates.find(t => t.id === templateId)
    if (!template) return
    const task: Task = {
      id: `task-${Date.now()}`,
      name: template.taskName,
      status: 'pending',
      node: get().nodes[Math.floor(Math.random() * get().nodes.length)].name,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: template.maxRetries,
      logs: [
        `[INFO] Task ${template.taskName} created from template '${template.name}'`,
        `[INFO] Params: ${JSON.stringify(template.params)}`,
      ],
    }
    set({ tasks: [task, ...get().tasks] })
  },
  retryTask: (id) => set({
    tasks: get().tasks.map(t => t.id === id ? { ...t, status: 'pending', retries: t.retries + 1, logs: [...t.logs, '[INFO] Retrying...'] } : t)
  }),
  cancelTask: (id) => set({
    tasks: get().tasks.map(t => t.id === id ? { ...t, status: 'failed' as TaskStatus, logs: [...t.logs, '[WARN] Cancelled by user'] } : t)
  }),
  selectTask: (t) => set({ selectedTask: t }),
  refreshNodes: () => set({ nodes: mockNodes() }),
  addMetric: () => {
    const m: MetricsSnapshot = {
      time: Date.now(),
      totalTasks: get().tasks.length,
      runningTasks: get().tasks.filter(t => t.status === 'running').length,
      successRate: (get().tasks.filter(t => t.status === 'success').length / Math.max(get().tasks.length, 1)) * 100,
      avgLatency: 500 + Math.random() * 2000,
      nodeCount: get().nodes.filter(n => n.status !== 'offline').length,
    }
    set({ metrics: [...get().metrics.slice(-30), m] })
  },
  createTemplate: (data) => {
    const now = Date.now()
    const template: TaskTemplate = {
      ...data,
      id: `tpl-${now}`,
      createdAt: now,
      updatedAt: now,
    }
    set({ templates: [template, ...get().templates] })
  },
  updateTemplate: (id, data) => {
    set({
      templates: get().templates.map(t =>
        t.id === id ? { ...t, ...data, updatedAt: Date.now() } : t
      ),
    })
  },
  deleteTemplate: (id) => {
    set({ templates: get().templates.filter(t => t.id !== id) })
  },
}))
