defmodule SchedulerWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :scheduler

  plug Plug.Static, at: "/", from: :scheduler, gzip: false
  plug Plug.Parsers, parsers: [:json], pass: [], json_decoder: Jason
  plug SchedulerWeb.Router
end

defmodule SchedulerWeb.Router do
  use Phoenix.Router
  import Phoenix.Controller

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", SchedulerWeb do
    pipe_through :api
    get "/tasks", TaskController, :index
    post "/tasks", TaskController, :create
    post "/tasks/from-template/:template_id", TaskController, :create_from_template
    post "/tasks/:id/retry", TaskController, :retry
    post "/tasks/:id/cancel", TaskController, :cancel
    get "/stats", TaskController, :stats
    get "/nodes", TaskController, :nodes

    get "/templates", TemplateController, :index
    post "/templates", TemplateController, :create
    get "/templates/:id", TemplateController, :show
    put "/templates/:id", TemplateController, :update
    delete "/templates/:id", TemplateController, :delete
  end
end

defmodule SchedulerWeb.TaskController do
  use Phoenix.Controller, formats: [:json]

  def index(conn, _params) do
    tasks = Scheduler.TaskManager.list_tasks()
    json(conn, %{tasks: Enum.map(tasks, &Map.from_struct/1)})
  end

  def create(conn, %{"name" => name}) do
    task = Scheduler.TaskManager.add_task(name)
    json(conn, %{task: Map.from_struct(task)})
  end

  def create_from_template(conn, %{"template_id" => template_id}) do
    case Scheduler.TaskManager.add_task_from_template(template_id) do
      {:ok, task} -> json(conn, %{task: Map.from_struct(task)})
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "Template not found"})
    end
  end

  def retry(conn, %{"id" => id}) do
    Scheduler.TaskManager.retry_task(id)
    json(conn, %{status: "ok"})
  end

  def cancel(conn, %{"id" => id}) do
    Scheduler.TaskManager.cancel_task(id)
    json(conn, %{status: "ok"})
  end

  def stats(conn, _params) do
    json(conn, Scheduler.TaskManager.get_stats())
  end

  def nodes(conn, _params) do
    nodes = for i <- 1..5 do
      %{
        id: "node-#{i}",
        name: if(i == 1, do: "scheduler-main", else: "worker-#{i - 1}"),
        type: if(i == 1, do: "scheduler", else: "worker"),
        status: if(:rand.uniform() > 0.1, do: "online", else: "overloaded"),
        cpu: 20 + :rand.uniform() * 60,
        memory: 30 + :rand.uniform() * 50,
        tasks: :rand.uniform(8),
        uptime: 3600 + :rand.uniform(86400)
      }
    end
    json(conn, %{nodes: nodes})
  end
end

defmodule SchedulerWeb.ErrorJSON do
  def render(template, _assigns) do
    %{errors: %{detail: Phoenix.Controller.status_message_from_template(template)}}
  end
end

defmodule SchedulerWeb.TemplateController do
  use Phoenix.Controller, formats: [:json]

  def index(conn, _params) do
    templates = Scheduler.TaskManager.list_templates()
    json(conn, %{templates: Enum.map(templates, &Map.from_struct/1)})
  end

  def create(conn, params) do
    template = Scheduler.TaskManager.create_template(params)
    json(conn, %{template: Map.from_struct(template)})
  end

  def show(conn, %{"id" => id}) do
    case Scheduler.TaskManager.get_template(id) do
      nil -> conn |> put_status(:not_found) |> json(%{error: "Template not found"})
      template -> json(conn, %{template: Map.from_struct(template)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    case Scheduler.TaskManager.update_template(id, params) do
      nil -> conn |> put_status(:not_found) |> json(%{error: "Template not found"})
      template -> json(conn, %{template: Map.from_struct(template)})
    end
  end

  def delete(conn, %{"id" => id}) do
    Scheduler.TaskManager.delete_template(id)
    json(conn, %{status: "ok"})
  end
end
