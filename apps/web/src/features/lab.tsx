"use client";

import { useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  FlaskConical,
  FolderKanban,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  Sun,
  Table2,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { api, type Example, type Project, type System } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Empty,
  ErrorNote,
  Header,
  Loading,
  Panel,
} from "@/components/ui/common";
import { Analysis, reportError } from "./analysis";
import { Builder, saveFailure } from "./builder";
import { Dashboard } from "./dashboard";
import { Education, Help } from "./education";
import { Comparison, Experiments } from "./experiments";
import { MatrixEditor } from "./matrices";
import { Projects } from "./projects";

const sections = [
  {
    label: "Робоча область",
    items: [
      { key: "overview", title: "Огляд", icon: LayoutDashboard },
      { key: "projects", title: "Проєкти", icon: FolderKanban },
      { key: "builder", title: "Конструктор", icon: Network },
      { key: "matrices", title: "Матриці", icon: Table2 },
      { key: "analysis", title: "Аналіз", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Експерименти",
    items: [
      { key: "compare", title: "Порівняння", icon: ArrowLeftRight },
      { key: "simulate", title: "Монте-Карло", icon: FlaskConical },
      { key: "sensitivity", title: "Чутливість", icon: Gauge },
      { key: "exports", title: "Експорт", icon: ArrowDownToLine },
    ],
  },
  {
    label: "Ресурси",
    items: [
      { key: "learn", title: "Навчальний режим", icon: GraduationCap },
      { key: "help", title: "Довідка", icon: BookOpen },
    ],
  },
] as const;

type Page = (typeof sections)[number]["items"][number]["key"];
type Preferences = {
  light: boolean;
  projectId: string;
  toggle: () => void;
  setProject: (id: string) => void;
};
const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      light: false,
      projectId: "",
      toggle: () => set((state) => ({ light: !state.light })),
      setProject: (projectId) => set({ projectId }),
    }),
    { name: "markov-lab-preferences", skipHydration: true },
  ),
);

function currentPage(): Page {
  const hash = window.location.hash.slice(1);
  return (
    sections
      .flatMap((group) => [...group.items])
      .find((item) => item.key === hash)?.key ?? "overview"
  );
}

function Workspace() {
  const client = useQueryClient();
  const { light, toggle, projectId, setProject } = usePreferences();
  const [page, setPage] = useState<Page>("overview");
  const [mobile, setMobile] = useState(false);
  const [newForm, setNewForm] = useState(false);
  const [run, setRun] = useState("");
  const [draft, setDraft] = useState<{ revision: string; model: System }>();
  const [saving, setSaving] = useState(false);
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const examples = useQuery({
    queryKey: ["examples"],
    queryFn: api.examples,
    staleTime: Infinity,
  });
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.project(projectId),
    enabled: Boolean(projectId),
    retry: false,
  });
  const project = projectQuery.data;
  const example =
    examples.data?.find((e) => e.id === "payment") ?? examples.data?.[0];
  const title = sections
    .flatMap((group) => [...group.items])
    .find((item) => item.key === page)?.title;
  const model =
    draft?.revision === project?.revision.id && draft
      ? draft.model
      : project?.model;
  const dirty =
    model != null &&
    project != null &&
    JSON.stringify(model) !== JSON.stringify(project.model);

  useEffect(() => {
    void usePreferences.persist.rehydrate();
    const sync = () => setPage(currentPage());
    window.addEventListener("hashchange", sync);
    if (location.hash) queueMicrotask(sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
  }, [light]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function navigate(next: Page) {
    setPage(next);
    setMobile(false);
    if (window.location.hash !== `#${next}`) window.location.hash = next;
  }

  function refresh() {
    void client.invalidateQueries({ queryKey: ["projects"] });
    void client.invalidateQueries({ queryKey: ["project"] });
    void client.invalidateQueries({ queryKey: ["runs"] });
    void client.invalidateQueries({ queryKey: ["scenarios"] });
    void client.invalidateQueries({ queryKey: ["revisions"] });
  }

  function choose(item: Project) {
    if (item.id !== project?.id) setRun("");
    client.setQueryData(["project", item.id], item);
    setProject(item.id);
    setNewForm(false);
    navigate("builder");
  }

  function openAnalysis(id: string, runId?: string) {
    if (
      id !== projectId &&
      dirty &&
      !window.confirm(
        "Перейти до іншого проєкту? Незбережені зміни буде втрачено.",
      )
    )
      return;
    if (id !== projectId) setDraft(undefined);
    setProject(id);
    setRun(runId ?? "");
    navigate("analysis");
  }

  function createProject() {
    setNewForm(true);
    navigate("projects");
  }

  async function openExample(item: Example) {
    try {
      choose(
        await api.create({
          name: item.name,
          model: item.model,
          description: item.description,
        }),
      );
      refresh();
    } catch (error) {
      reportError(error);
    }
  }

  async function save() {
    if (!project || !model) return false;
    setSaving(true);
    try {
      const revision = await api.save(project.id, project.revision.id, model);
      client.setQueryData(["project", project.id], {
        ...project,
        revision,
        model,
      });
      setDraft(undefined);
      refresh();
      toast.success(`Збережено версію ${revision.number}`);
      return true;
    } catch (error) {
      return saveFailure(error);
    } finally {
      setSaving(false);
    }
  }

  const needsProject = [
    "builder",
    "matrices",
    "analysis",
    "simulate",
    "sensitivity",
    "exports",
  ].includes(page);
  const draftProps =
    project && model
      ? {
          project,
          model,
          change: (next: System) =>
            setDraft({ revision: project.revision.id, model: next }),
          save,
          saving,
          dirty,
        }
      : undefined;

  return (
    <div className="shell">
      <a
        className="skip"
        href="#workspace"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace")?.focus();
        }}
      >
        Перейти до вмісту
      </a>
      {mobile && (
        <button
          className="scrim"
          aria-label="Закрити меню"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={() => navigate("overview")}
        >
          <span className="brand-mark">
            <Activity size={24} strokeWidth={2.6} />
          </span>
          <div>
            <strong>Markov Lab</strong>
            <span>Reliability Workspace</span>
          </div>
        </a>
        <nav aria-label="Основна навігація">
          {sections.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => (
                <a
                  key={item.key}
                  href={`#${item.key}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(item.key);
                  }}
                  aria-current={page === item.key ? "page" : undefined}
                  className={
                    page === item.key ? "nav-link selected" : "nav-link"
                  }
                >
                  <item.icon size={17} aria-hidden /> <span>{item.title}</span>
                  {page === item.key && (
                    <ChevronRight className="nav-arrow" size={14} />
                  )}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" /> Локальна лабораторія
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <div className="breadcrumbs">
            <Button
              className="menu-toggle"
              variant="ghost"
              aria-label={mobile ? "Закрити меню" : "Відкрити меню"}
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X size={21} /> : <Menu size={21} />}
            </Button>
            <span>Markov Lab</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="actions top-actions">
            <label>
              <span className="sr-only">Активний проєкт</span>
              <select
                value={projectId}
                onChange={(e) => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Перемкнути проєкт і втратити незбережені зміни?",
                    )
                  )
                    return;
                  setDraft(undefined);
                  setRun("");
                  setProject(e.target.value);
                }}
              >
                <option value="">Вибрати проєкт</option>
                {projectId &&
                  !projects.data?.some((p) => p.id === projectId) && (
                    <option value={projectId}>Вибраний проєкт</option>
                  )}
                {projects.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.archived ? " (архів)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              className="theme-toggle"
              aria-label={light ? "Темна тема" : "Світла тема"}
              title={light ? "Темна тема" : "Світла тема"}
              onClick={toggle}
            >
              {light ? <Moon size={19} /> : <Sun size={19} />}
            </Button>
          </div>
        </div>
        <main id="workspace" tabIndex={-1}>
          {projects.error && <ErrorNote cause={projects.error} />}
          {examples.error && (page === "overview" || page === "projects") && (
            <ErrorNote cause={examples.error} />
          )}
          {needsProject &&
            !project &&
            (projectQuery.isLoading ? (
              <Loading />
            ) : (
              <>
                <Header
                  title={title ?? "Проєкт"}
                  description="Відкрийте або створіть модель для цієї робочої області."
                />
                {projectQuery.error && <ErrorNote cause={projectQuery.error} />}
                <Panel title="Вибір моделі">
                  <Empty>
                    <Button onClick={() => navigate("projects")}>
                      Перейти до проєктів
                    </Button>
                  </Empty>
                </Panel>
              </>
            ))}
          {page === "overview" && (
            <Dashboard
              project={project}
              projects={projects.data ?? []}
              example={example}
              light={light}
              create={createProject}
              open={(item) => void openExample(item)}
              openAnalysis={openAnalysis}
              openBuilder={() => navigate("builder")}
            />
          )}
          {page === "projects" &&
            (projects.isLoading ? (
              <Loading />
            ) : (
              <Projects
                items={projects.data ?? []}
                examples={examples.data ?? []}
                showNew={newForm}
                setShowNew={setNewForm}
                onOpen={choose}
                refresh={refresh}
              />
            ))}
          {page === "builder" && draftProps && (
            <Builder key={projectId} {...draftProps} light={light} />
          )}
          {page === "matrices" && draftProps && (
            <MatrixEditor key={projectId} {...draftProps} />
          )}
          {page === "analysis" && project && (
            <Analysis
              key={projectId}
              project={project}
              activeRun={run}
              setRun={setRun}
              changed={refresh}
              dirty={dirty}
              light={light}
            />
          )}
          {page === "compare" && <Comparison projects={projects.data ?? []} />}
          {(page === "simulate" || page === "sensitivity") && project && (
            <Experiments
              key={`${project.revision.id}-${page}`}
              project={project}
              mode={page}
            />
          )}
          {page === "exports" && project && (
            <Exports
              project={project}
              open={(key) => openAnalysis(project.id, key)}
            />
          )}
          {page === "learn" && (
            <Education model={project?.model ?? example?.model} />
          )}
          {page === "help" && <Help />}
        </main>
      </div>
      <Toaster
        theme={light ? "light" : "dark"}
        position="bottom-right"
        richColors
      />
    </div>
  );
}

function Exports({
  project,
  open,
}: {
  project: Project;
  open: (id: string) => void;
}) {
  const runs = useQuery({
    queryKey: ["runs", project.id],
    queryFn: () => api.runs(project.id),
  });
  const versions = useQuery({
    queryKey: ["revisions", project.id],
    queryFn: () => api.revisions(project.id),
  });
  return (
    <>
      <Header
        title="Експорт"
        description={`Завантаження збережених моделей і запусків · ${project.name}`}
      />
      <Panel title="Версії моделі">
        {versions.isLoading ? (
          <Loading />
        ) : versions.error ? (
          <ErrorNote cause={versions.error} />
        ) : (
          <div className="actions panel-foot">
            {versions.data?.map((item) => (
              <Button asChild key={item.id}>
                <a href={api.modelExport(project.id, item.id)} download>
                  <ArrowDownToLine size={16} />v{item.number} JSON
                </a>
              </Button>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Результати аналізу">
        {runs.isLoading ? (
          <Loading />
        ) : runs.error ? (
          <ErrorNote cause={runs.error} />
        ) : runs.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Запуск</th>
                  <th>Формати</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((item) => (
                  <tr key={item.id}>
                    <th>
                      {item.label}
                      <small>
                        {new Date(item.created_at).toLocaleString("uk-UA")}
                      </small>
                    </th>
                    <td>
                      <div className="actions">
                        {(
                          ["json", "matrix.csv", "results.csv", "pdf"] as const
                        ).map((format) => (
                          <Button key={format} asChild>
                            <a href={api.runExport(item.id, format)} download>
                              {format}
                            </a>
                          </Button>
                        ))}
                        <Button onClick={() => open(item.id)}>
                          Графік PNG/SVG
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Виконайте аналіз, щоб експортувати результати.</Empty>
        )}
      </Panel>
    </>
  );
}

export function Lab() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace />
    </QueryClientProvider>
  );
}
