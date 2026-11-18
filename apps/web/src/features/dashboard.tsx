"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  FolderKanban,
  Network,
  Plus,
  TrendingUp,
} from "lucide-react";
import {
  api,
  type Example,
  type Project,
  type ProjectSummary,
} from "@/lib/api";
import { date, percent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Empty,
  ErrorNote,
  Header,
  Loading,
  Panel,
} from "@/components/ui/common";
import { defaultSettings, Metrics } from "./analysis";
import { ReliabilityChart } from "./charts";
import { SystemGraph } from "./graph";

export function Dashboard({
  project,
  projects,
  example,
  light,
  create,
  open,
  openAnalysis,
  openBuilder,
}: {
  project?: Project;
  projects: ProjectSummary[];
  example?: Example;
  light: boolean;
  create: () => void;
  open: (item: Example) => void;
  openAnalysis: (projectId: string, run?: string) => void;
  openBuilder: () => void;
}) {
  const runs = useQuery({ queryKey: ["runs"], queryFn: () => api.runs() });
  const last =
    runs.data?.find((run) => run.project_id === project?.id) ??
    (!project ? runs.data?.[0] : undefined);
  const detail = useQuery({
    queryKey: ["run", last?.id],
    queryFn: () => api.run(last!.id),
    enabled: Boolean(last),
  });
  const system = project?.model ?? example?.model;
  const preview = useQuery({
    queryKey: ["dashboard-preview", system],
    queryFn: () => api.preview(system!, defaultSettings),
    enabled: Boolean(system) && !last && !runs.isLoading,
    retry: false,
  });
  const critical = useQuery({
    queryKey: ["dashboard-critical", project?.revision.id, last?.id],
    queryFn: () =>
      api.sensitivity(
        project!.id,
        last?.revision_id ?? project!.revision.id,
        0.01,
        last?.settings ?? defaultSettings,
      ),
    enabled: Boolean(project),
    retry: false,
  });
  const result = detail.data?.result ?? preview.data;
  const kind = detail.data?.settings.kind ?? "ctmc";
  const analyzed = last
    ? projects.find((item) => item.id === last.project_id)?.name
    : undefined;
  const modelName = project?.name ?? example?.name;

  return (
    <>
      <Header
        title="Огляд надійності"
        description="Досліджуйте поведінку програмних систем у дискретному й неперервному часі."
      >
        <Button variant="default" onClick={create}>
          <Plus size={19} />
          Новий проєкт
        </Button>
      </Header>
      <div className="working-model">
        <span className="workspace-icon">
          <Network size={19} />
        </span>
        <div>
          <strong>{analyzed ?? modelName ?? "Моделі програмних систем"}</strong>
          <span>
            {last
              ? "Останній збережений аналіз"
              : project
                ? "Попередній розрахунок"
                : "Демонстраційна модель"}
          </span>
        </div>
        <div className="working-stats">
          <span>
            <FolderKanban size={16} />
            <strong>
              {projects.filter((item) => !item.archived).length}
            </strong>{" "}
            активних проєктів
          </span>
          <span>
            <Network size={16} />
            <strong>
              {result
                ? result.states.length - 2
                : (system?.modules.length ?? 0)}
            </strong>{" "}
            модулів
          </span>
        </div>
        {project ? (
          <Button onClick={() => openAnalysis(project.id, last?.id)}>
            Робоча область
            <ArrowRight size={16} />
          </Button>
        ) : (
          example && (
            <Button onClick={() => open(example)}>
              Відкрити приклад
              <ArrowRight size={16} />
            </Button>
          )
        )}
      </div>
      <Metrics result={result} />
      <div className="dashboard-grid">
        <Panel
          title="Динаміка надійності"
          description="Імовірності станів та наслідків за горизонтом аналізу"
          actions={
            <span className="tag">
              <span className="status-dot" />
              {kind.toUpperCase()}
            </span>
          }
        >
          {result ? (
            <ReliabilityChart result={result} kind={kind} light={light} />
          ) : detail.isLoading || preview.isLoading || runs.isLoading ? (
            <Loading />
          ) : detail.error || preview.error ? (
            <ErrorNote cause={detail.error ?? preview.error} />
          ) : (
            <Empty>Створіть модель для побудови графіка.</Empty>
          )}
        </Panel>
        <Panel
          title="Структура системи"
          description={modelName}
          actions={
            project && (
              <Button
                variant="ghost"
                aria-label="Відкрити конструктор"
                onClick={openBuilder}
              >
                <ArrowRight size={17} />
              </Button>
            )
          }
        >
          {system ? (
            <SystemGraph model={system} light={light} compact />
          ) : (
            <Empty>Модель ще не вибрано.</Empty>
          )}
        </Panel>
        <Panel title="Історія аналізів" description="Останні збережені запуски">
          {runs.isLoading ? (
            <Loading />
          ) : runs.error ? (
            <ErrorNote cause={runs.error} />
          ) : runs.data?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Проєкт</th>
                    <th>Надійність</th>
                    <th>Дата</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {runs.data.slice(0, 5).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {projects.find((p) => p.id === item.project_id)
                            ?.name ?? item.label}
                        </strong>
                        <small>
                          {item.settings.kind?.toUpperCase()} · {item.label}
                        </small>
                      </td>
                      <td>{percent(item.reliability)}</td>
                      <td>{date(item.created_at)}</td>
                      <td>
                        <Button
                          aria-label="Відкрити запуск"
                          variant="ghost"
                          onClick={() => openAnalysis(item.project_id, item.id)}
                        >
                          <ArrowRight size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Після запуску аналіз з’явиться тут.</Empty>
          )}
        </Panel>
        <Panel
          title="Критичні компоненти"
          description="Приріст надійності при збільшенні r на 0,01"
          actions={<TrendingUp size={18} />}
        >
          {critical.data ? (
            <ol className="critical">
              {critical.data.slice(0, 5).map((row) => (
                <li key={row.id}>
                  <span>{row.name}</span>
                  <strong>{percent(row.gain, 4)}</strong>
                </li>
              ))}
            </ol>
          ) : critical.isLoading ? (
            <Loading />
          ) : critical.error ? (
            <ErrorNote cause={critical.error} />
          ) : (
            <Empty>Відкрийте проєкт для оцінки чутливості.</Empty>
          )}
        </Panel>
      </div>
    </>
  );
}
