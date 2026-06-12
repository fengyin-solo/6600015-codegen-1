defmodule Scheduler.TaskManager do
  use GenServer

  defmodule Task do
    defstruct [:id, :name, :status, :node, :created_at, :retries, :max_retries, :logs]
  end

  defmodule TaskTemplate do
    defstruct [:id, :name, :description, :task_name, :max_retries, :tags, :params, :created_at, :updated_at]
  end

  # Client API
  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def list_tasks, do: GenServer.call(__MODULE__, :list_tasks)

  def add_task(name) do
    GenServer.call(__MODULE__, {:add_task, name})
  end

  def add_task_from_template(template_id) do
    GenServer.call(__MODULE__, {:add_task_from_template, template_id})
  end

  def retry_task(id), do: GenServer.call(__MODULE__, {:retry_task, id})

  def cancel_task(id), do: GenServer.call(__MODULE__, {:cancel_task, id})

  def get_stats, do: GenServer.call(__MODULE__, :get_stats)

  def list_templates, do: GenServer.call(__MODULE__, :list_templates)

  def create_template(attrs), do: GenServer.call(__MODULE__, {:create_template, attrs})

  def get_template(id), do: GenServer.call(__MODULE__, {:get_template, id})

  def update_template(id, attrs), do: GenServer.call(__MODULE__, {:update_template, id, attrs})

  def delete_template(id), do: GenServer.call(__MODULE__, {:delete_template, id})

  # Server callbacks
  @impl true
  def init(_) do
    # Seed some mock tasks
    tasks = for i <- 1..8 do
      name = Enum.at(~w[data_sync email_batch report_gen cache_warm log_rotate db_backup index_rebuild health_check], rem(i - 1, 8))
      status = Enum.at(~w[pending running success failed]a, :rand.uniform(4) - 1)
      %Task{
        id: "task-#{1000 + i}",
        name: name,
        status: status,
        node: "worker-#{:rand.uniform(4)}",
        created_at: DateTime.utc_now(),
        retries: 0,
        max_retries: 3,
        logs: ["[INFO] Task #{name} created"]
      }
    end

    # Seed some mock templates
    templates = [
      %TaskTemplate{
        id: "tpl-1001",
        name: "每日数据同步",
        description: "每日凌晨同步生产数据库到分析库",
        task_name: "data_sync",
        max_retries: 5,
        tags: ["daily", "data"],
        params: %{source: "prod_db", target: "analytics_db", batch_size: 10000},
        created_at: DateTime.utc_now(),
        updated_at: DateTime.utc_now()
      },
      %TaskTemplate{
        id: "tpl-1002",
        name: "批量邮件发送",
        description: "向订阅用户发送批量通知邮件",
        task_name: "email_batch",
        max_retries: 3,
        tags: ["notification", "email"],
        params: %{template: "weekly_newsletter", priority: "normal"},
        created_at: DateTime.utc_now(),
        updated_at: DateTime.utc_now()
      },
      %TaskTemplate{
        id: "tpl-1003",
        name: "数据库备份",
        description: "完整数据库备份并上传到对象存储",
        task_name: "db_backup",
        max_retries: 2,
        tags: ["backup", "maintenance"],
        params: %{compression: "gzip", upload_to_s3: true, retention_days: 30},
        created_at: DateTime.utc_now(),
        updated_at: DateTime.utc_now()
      },
      %TaskTemplate{
        id: "tpl-1004",
        name: "缓存预热",
        description: "预热热点数据缓存提升访问速度",
        task_name: "cache_warm",
        max_retries: 3,
        tags: ["cache", "performance"],
        params: %{cache_keys: "hot_items", ttl: 3600},
        created_at: DateTime.utc_now(),
        updated_at: DateTime.utc_now()
      }
    ]

    {:ok, %{tasks: tasks, templates: templates, counter: 1009, tpl_counter: 1004}}
  end

  @impl true
  def handle_call(:list_tasks, _from, state) do
    {:reply, state.tasks, state}
  end

  @impl true
  def handle_call({:add_task, name}, _from, state) do
    counter = state.counter + 1
    task = %Task{
      id: "task-#{counter}",
      name: name,
      status: :pending,
      node: "worker-#{:rand.uniform(4)}",
      created_at: DateTime.utc_now(),
      retries: 0,
      max_retries: 3,
      logs: ["[INFO] Task #{name} queued"]
    }
    {:reply, task, %{state | tasks: [task | state.tasks], counter: counter}}
  end

  @impl true
  def handle_call({:retry_task, id}, _from, state) do
    tasks = Enum.map(state.tasks, fn
      %{id: ^id} = t -> %{t | status: :pending, retries: t.retries + 1, logs: t.logs ++ ["[INFO] Retrying..."]}
      t -> t
    end)
    {:reply, :ok, %{state | tasks: tasks}}
  end

  @impl true
  def handle_call({:cancel_task, id}, _from, state) do
    tasks = Enum.map(state.tasks, fn
      %{id: ^id} = t -> %{t | status: :failed, logs: t.logs ++ ["[WARN] Cancelled"]}
      t -> t
    end)
    {:reply, :ok, %{state | tasks: tasks}}
  end

  @impl true
  def handle_call(:get_stats, _from, state) do
    stats = %{
      total: length(state.tasks),
      running: Enum.count(state.tasks, & &1.status == :running),
      success: Enum.count(state.tasks, & &1.status == :success),
      failed: Enum.count(state.tasks, & &1.status == :failed)
    }
    {:reply, stats, state}
  end

  @impl true
  def handle_call({:add_task_from_template, template_id}, _from, state) do
    template = Enum.find(state.templates, &(&1.id == template_id))

    if template do
      counter = state.counter + 1
      task = %Task{
        id: "task-#{counter}",
        name: template.task_name,
        status: :pending,
        node: "worker-#{:rand.uniform(4)}",
        created_at: DateTime.utc_now(),
        retries: 0,
        max_retries: template.max_retries || 3,
        logs: ["[INFO] Task #{template.task_name} created from template '#{template.name}'", "[INFO] Params: #{inspect(template.params)}"]
      }
      {:reply, {:ok, task}, %{state | tasks: [task | state.tasks], counter: counter}}
    else
      {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call(:list_templates, _from, state) do
    {:reply, state.templates, state}
  end

  @impl true
  def handle_call({:get_template, id}, _from, state) do
    template = Enum.find(state.templates, &(&1.id == id))
    {:reply, template, state}
  end

  @impl true
  def handle_call({:create_template, attrs}, _from, state) do
    tpl_counter = state.tpl_counter + 1
    now = DateTime.utc_now()

    template = %TaskTemplate{
      id: "tpl-#{tpl_counter}",
      name: Map.get(attrs, "name") || Map.get(attrs, :name, "Untitled"),
      description: Map.get(attrs, "description") || Map.get(attrs, :description, ""),
      task_name: Map.get(attrs, "task_name") || Map.get(attrs, :task_name, "task"),
      max_retries: Map.get(attrs, "max_retries") || Map.get(attrs, :max_retries, 3),
      tags: Map.get(attrs, "tags") || Map.get(attrs, :tags, []),
      params: Map.get(attrs, "params") || Map.get(attrs, :params, %{}),
      created_at: now,
      updated_at: now
    }

    {:reply, template, %{state | templates: [template | state.templates], tpl_counter: tpl_counter}}
  end

  @impl true
  def handle_call({:update_template, id, attrs}, _from, state) do
    templates = Enum.map(state.templates, fn tpl ->
      if tpl.id == id do
        %TaskTemplate{
          tpl
          | name: Map.get(attrs, "name", tpl.name) |> then(&(&1 || tpl.name)),
            description: Map.get(attrs, "description", tpl.description) |> then(&(&1 || tpl.description)),
            task_name: Map.get(attrs, "task_name", tpl.task_name) |> then(&(&1 || tpl.task_name)),
            max_retries: Map.get(attrs, "max_retries", tpl.max_retries) |> then(&(&1 || tpl.max_retries)),
            tags: Map.get(attrs, "tags", tpl.tags) |> then(&(&1 || tpl.tags)),
            params: Map.get(attrs, "params", tpl.params) |> then(&(&1 || tpl.params)),
            updated_at: DateTime.utc_now()
        }
      else
        tpl
      end
    end)

    updated = Enum.find(templates, &(&1.id == id))
    {:reply, updated, %{state | templates: templates}}
  end

  @impl true
  def handle_call({:delete_template, id}, _from, state) do
    templates = Enum.reject(state.templates, &(&1.id == id))
    {:reply, :ok, %{state | templates: templates}}
  end
end
