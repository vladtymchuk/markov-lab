"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Download,
  Play,
  Save,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type Kind,
  type Project,
  type Result,
  type Run,
  type Settings,
} from "@/lib/api";
import { date, message, number, percent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Empty,
  ErrorNote,
  Header,
  Loading,
  Panel,
} from "@/components/ui/common";
import { Numeric } from "./builder";
import { ReliabilityChart } from "./charts";

export const defaultSettings: Settings = {
  kind: "ctmc",
  horizon: 8,
  points: 41,
  target: null,
};

export function Metrics({ result }: { result?: Result }) {
  const point = result?.series.at(-1);
  const items = [
    {
      label: "Надійність",
      value: point?.reliability,
      icon: ShieldCheck,
      color: "blue",
      hint: "Без відмови до горизонту",
    },
    {
      label: "Завершено успішно",
      value: point?.success,
      icon: CheckCircle2,
      color: "green",
      hint: "Досягнуто SUCCESS",
    },
    {
      label: "Відмова",
      value: point?.failure,
      icon: TriangleAlert,
      color: "red",
      hint: "Досягнуто FAILURE",
    },
    {
      label: "Виконання триває",
      value: point?.running,
      icon: Clock3,
      color: "purple",
      hint: "У робочому стані",
    },
  ];
  return (
    <div className="metric-grid">
      {items.map((item) => (
        <article className="metric-card" key={item.label}>
          <div className="metric-label">
            <span className={`icon-tile ${item.color}`}>
              <item.icon size={17} />
            </span>
            {item.label}
          </div>
          <div className="metric-value">
            {item.value == null ? "—" : percent(item.value)}
          </div>
          <p>{item.hint}</p>
        </article>
      ))}
    </div>
  );
}

export function Options({
  settings,
  set,
  project,
  children,
  target = true,
}: {
  settings: Settings;
  set: (value: Settings) => void;
  project: Project;
  children?: React.ReactNode;
  target?: boolean;
}) {
  const kind = settings.kind ?? "ctmc";
  return (
    <div className="option-grid">
      <label>
        Тип ланцюга
        <select
          value={kind}
          onChange={(e) => {
            const value: Kind = e.target.value === "ctmc" ? "ctmc" : "dtmc";
            set({
              ...settings,
              kind: value,
              horizon:
                value === "dtmc"
                  ? Math.round(settings.horizon ?? 8)
                  : settings.horizon,
            });
          }}
        >
          <option value="dtmc">DTMC · дискретний час</option>
          <option value="ctmc">CTMC · неперервний час</option>
        </select>
      </label>
      <label>
        {kind === "dtmc" ? "Кількість кроків" : "Часовий горизонт"}
        <Numeric
          value={settings.horizon ?? 8}
          label={kind === "dtmc" ? "Кількість кроків" : "Часовий горизонт"}
          min={0}
          max={10000}
          step={kind === "dtmc" ? 1 : "any"}
          onChange={(horizon) => set({ ...settings, horizon })}
        />
      </label>
      {target && (
        <>
          <label>
            Точки графіка
            <Numeric
              label="Точки графіка"
              value={settings.points ?? 41}
              min={2}
              max={121}
              step={1}
              onChange={(points) => set({ ...settings, points })}
            />
          </label>
          <label>
            Стан першого проходу
            <select
              value={settings.target ?? ""}
              onChange={(e) =>
                set({ ...settings, target: e.target.value || null })
              }
            >
              <option value="">Без окремої кривої</option>
              {[
                ...project.model.modules,
                { id: "SUCCESS", name: "SUCCESS" },
                { id: "FAILURE", name: "FAILURE" },
              ].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {children}
    </div>
  );
}

function SavedExports({ run }: { run: Run }) {
  return (
    <div className="actions panel-foot">
      {(
        [
          ["json", "Знімок JSON"],
          ["matrix.csv", "Матриця CSV"],
          ["results.csv", "Результати CSV"],
          ["pdf", "Звіт PDF"],
        ] as const
      ).map(([format, label]) => (
        <Button key={format} asChild>
          <a href={api.runExport(run.id, format)} download>
            <Download size={15} />
            {label}
          </a>
        </Button>
      ))}
    </div>
  );
}

export function Analysis({
  project,
  activeRun,
  setRun,
  changed,
  dirty,
  light,
}: {
  project: Project;
  activeRun: string;
  setRun: (key: string) => void;
  changed: () => void;
  dirty: boolean;
  light: boolean;
}) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [scenario, setScenario] = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const scenarios = useQuery({
    queryKey: ["scenarios", project.id],
    queryFn: () => api.scenarios(project.id),
  });
  const revisions = useQuery({
    queryKey: ["revisions", project.id],
    queryFn: () => api.revisions(project.id),
  });
  const history = useQuery({
    queryKey: ["runs", project.id],
    queryFn: () => api.runs(project.id),
  });
  const query = useQuery({
    queryKey: ["run", activeRun],
    queryFn: () => api.run(activeRun),
    enabled: Boolean(activeRun),
  });
  const run = query.data;
  const scenarioOptions = scenarios.data ?? [];

  async function submit(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      changed();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Header
        title="Аналіз надійності"
        description={`${project.name} · модель v${project.revision.number}`}
      >
        <Button
          variant="default"
          form="analysis-options"
          type="submit"
          disabled={pending || (dirty && !scenario)}
        >
          <Play size={17} />
          {pending ? "Обчислення…" : "Запустити аналіз"}
        </Button>
      </Header>
      <Panel
        title="Параметри запуску"
        description="Запуск фіксує версію моделі, параметри аналізу та результат."
      >
        <form
          id="analysis-options"
          className="form-panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && !scenario) return;
            void submit(async () => {
              const next = await api.analyze(project.id, {
                settings,
                revision_id: project.revision.id,
                scenario_id: scenario || null,
              });
              setRun(next.id);
              toast.success("Аналіз збережено");
            });
          }}
        >
          <label>
            Сценарій
            <select
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
            >
              <option value="">Поточна версія та нові параметри</option>
              {scenarioOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · v
                  {revisions.data?.find((r) => r.id === s.revision_id)
                    ?.number ?? "?"}
                </option>
              ))}
            </select>
          </label>
          {scenario ? (
            <p className="formula">
              {scenarioOptions
                .find((s) => s.id === scenario)
                ?.settings.kind?.toUpperCase()}{" "}
              · горизонт{" "}
              {scenarioOptions.find((s) => s.id === scenario)?.settings.horizon}
            </p>
          ) : (
            <Options settings={settings} set={setSettings} project={project} />
          )}
          {dirty && !scenario && (
            <p className="warning">
              Збережіть зміни в конструкторі або редакторі матриць, перш ніж
              запускати поточну версію.
            </p>
          )}
          {error != null && <ErrorNote cause={error} />}
          {scenarios.error && <ErrorNote cause={scenarios.error} />}
          {!scenario && (
            <div className="actions scenario-save">
              <input
                placeholder="Наприклад, Базовий запуск"
                aria-label="Назва сценарію"
                value={scenarioName}
                maxLength={100}
                onChange={(e) => setScenarioName(e.target.value)}
              />
              <Button
                type="button"
                disabled={pending || dirty || !scenarioName.trim()}
                onClick={() =>
                  void submit(async () => {
                    const item = await api.scenario(project.id, {
                      ...settings,
                      name: scenarioName,
                      revision_id: project.revision.id,
                    });
                    setScenario(item.id);
                    setScenarioName("");
                    toast.success("Сценарій збережено");
                  })
                }
              >
                <Save size={15} />
                Зберегти сценарій
              </Button>
            </div>
          )}
        </form>
      </Panel>
      {query.isFetching && !run && <Loading />}
      {query.error && <ErrorNote cause={query.error} />}
      {run && (
        <>
          <Metrics result={run.result} />
          <Panel
            title="Профіль надійності"
            description={`${run.settings.kind?.toUpperCase()} · ${date(run.created_at)} · ${run.result.series.length} точок`}
          >
            <ReliabilityChart
              result={run.result}
              kind={run.settings.kind ?? "dtmc"}
              light={light}
              exportName={`run-${run.id}`}
            />
            <SavedExports run={run} />
          </Panel>
          <Panel
            title="Показники за станами"
            description="Імовірність першого досягнення враховує перебування в стані в момент старту."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Стан</th>
                    <th>Перший виклик pᵢ(0)</th>
                    <th>Стан у кінці</th>
                    <th>Досягнення до горизонту</th>
                    <th>Очікувані відвідування</th>
                  </tr>
                </thead>
                <tbody>
                  {run.result.metrics.map((metric, index) => (
                    <tr key={metric.id}>
                      <th>{metric.name}</th>
                      <td>{percent(metric.initial)}</td>
                      <td>
                        {percent(
                          run.result.series.at(-1)?.distribution[index] ?? 0,
                        )}
                      </td>
                      <td>{percent(metric.first_hit)}</td>
                      <td>
                        {metric.expected_visits == null
                          ? "—"
                          : number(metric.expected_visits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-foot prose">
              <p>
                <code>
                  {run.settings.kind === "ctmc"
                    ? "p(t) = p(0) exp(Qt)"
                    : "p(k) = p(0) Pᵏ"}
                </code>{" "}
                <code>R = 1 − p(FAILURE)</code>
              </p>
              {run.result.ode_error != null && (
                <p>
                  Максимальна різниця між expm і розв’язком рівнянь Колмогорова{" "}
                  <strong>{run.result.ode_error.toExponential(3)}</strong>.
                </p>
              )}
              <p>
                {run.settings.kind === "ctmc"
                  ? "Неперервна модель припускає сталі інтенсивності та експоненційні інтервали."
                  : "Один крок відповідає одному переходу дискретного ланцюга."}{" "}
                Доступність потребує окремої моделі з відновленням.
              </p>
              {run.result.warnings.map((warning) => (
                <p className="warning" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
          </Panel>
        </>
      )}
      <Panel title="Історія аналізів" actions={<Activity size={17} />}>
        {history.isLoading ? (
          <Loading />
        ) : history.error ? (
          <ErrorNote cause={history.error} />
        ) : history.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Модель</th>
                  <th>Горизонт</th>
                  <th>Надійність</th>
                  <th>Запуск</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td>{number(item.settings.horizon ?? 0)}</td>
                    <td>{percent(item.reliability)}</td>
                    <td>{date(item.created_at)}</td>
                    <td>
                      <Button onClick={() => setRun(item.id)}>
                        Переглянути
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Виконайте перший аналіз, щоб з’явилася історія.</Empty>
        )}
      </Panel>
    </>
  );
}

export function reportError(cause: unknown) {
  toast.error(message(cause));
}
