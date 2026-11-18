"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Gauge, Play } from "lucide-react";
import { api, type Project, type Settings } from "@/lib/api";
import { date, number, percent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Empty,
  ErrorNote,
  Header,
  Loading,
  Panel,
} from "@/components/ui/common";
import { defaultSettings, Options } from "./analysis";
import { Numeric } from "./builder";

type Simulation = Awaited<ReturnType<typeof api.simulate>>;
type Sensitivity = Awaited<ReturnType<typeof api.sensitivity>>;
const metricNames: Record<string, string> = {
  reliability: "Надійність",
  success: "Успіх",
  failure: "Відмова",
  running: "Виконання триває",
};

export function Experiments({
  project,
  mode,
}: {
  project: Project;
  mode: "simulate" | "sensitivity";
}) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [trials, setTrials] = useState(10000);
  const [seed, setSeed] = useState(42);
  const [delta, setDelta] = useState(0.01);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [simulation, setSimulation] = useState<{
    data: Simulation;
    settings: Settings;
  }>();
  const [sensitivity, setSensitivity] = useState<{
    data: Sensitivity;
    settings: Settings;
    delta: number;
  }>();
  const monte = mode === "simulate";

  async function calculate() {
    setPending(true);
    setError(null);
    try {
      if (monte)
        setSimulation({
          data: await api.simulate(project.id, project.revision.id, {
            ...settings,
            trials,
            seed,
          }),
          settings,
        });
      else
        setSensitivity({
          data: await api.sensitivity(
            project.id,
            project.revision.id,
            delta,
            settings,
          ),
          settings,
          delta,
        });
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  function context(value: Settings) {
    return `${value.kind?.toUpperCase()} · горизонт ${number(value.horizon ?? 0)} · v${project.revision.number}`;
  }

  return (
    <>
      <Header
        title={monte ? "Лабораторія симуляцій" : "Аналіз чутливості"}
        description={
          monte
            ? "Порівнюйте результати Монте-Карло з аналітичним розрахунком."
            : "Перевірте ефект поліпшення кожного модуля за однаковим правилом."
        }
      />
      <Panel
        title={monte ? "Параметри симуляції" : "Параметри експерименту"}
        actions={monte ? <FlaskConical size={18} /> : <Gauge size={18} />}
      >
        <form
          className="form-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void calculate();
          }}
        >
          <Options
            project={project}
            settings={settings}
            set={setSettings}
            target={false}
          >
            {monte ? (
              <>
                <label>
                  Кількість експериментів
                  <Numeric
                    label="Кількість експериментів"
                    value={trials}
                    onChange={setTrials}
                    min={100}
                    max={100000}
                    step={1}
                  />
                </label>
                <label>
                  Seed
                  <Numeric
                    label="Seed"
                    value={seed}
                    onChange={setSeed}
                    min={0}
                    max={4294967295}
                    step={1}
                  />
                </label>
              </>
            ) : (
              <label>
                Додаток до r
                <Numeric
                  label="Додаток до r"
                  value={delta}
                  onChange={setDelta}
                  min={0.00000001}
                  max={1}
                />
              </label>
            )}
          </Options>
          <div className="actions">
            <Button type="submit" variant="default" disabled={pending}>
              <Play size={16} />
              {pending
                ? "Обчислення…"
                : monte
                  ? "Запустити симуляцію"
                  : "Обчислити чутливість"}
            </Button>
          </div>
          {error != null && <ErrorNote cause={error} />}
        </form>
      </Panel>
      {monte && simulation && (
        <Panel
          title="Монте-Карло та аналітичний результат"
          description={`${context(simulation.settings)} · n = ${simulation.data.trials}, seed = ${simulation.data.seed}`}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Показник</th>
                  <th>Аналітично</th>
                  <th>Монте-Карло</th>
                  <th>Похибка</th>
                  <th>95% інтервал Вілсона</th>
                </tr>
              </thead>
              <tbody>
                {simulation.data.estimates.map((row) => (
                  <tr key={row.metric}>
                    <th>{metricNames[row.metric]}</th>
                    <td>{percent(row.analytical, 4)}</td>
                    <td>{percent(row.estimate, 4)}</td>
                    <td>{number(row.error * 100, 4)} в.п.</td>
                    <td>
                      {percent(row.lower, 4)} … {percent(row.upper, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {!monte && sensitivity && (
        <Panel
          title="Вплив поліпшень"
          description={`${context(sensitivity.settings)} · Δr = ${number(sensitivity.delta)}. Поліпшення обмежено r ≤ 1.`}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Модуль</th>
                  <th>Початкове r</th>
                  <th>Нове r</th>
                  <th>Нова надійність</th>
                  <th>Зміна</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.data.map((row, index) => (
                  <tr
                    key={row.id}
                    className={index === 0 ? "row-selected" : ""}
                  >
                    <th>{row.name}</th>
                    <td>{percent(row.before)}</td>
                    <td>{percent(row.after)}</td>
                    <td>{percent(row.reliability, 4)}</td>
                    <td>{number(row.gain * 100, 4)} в.п.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-foot prose">
            Перший рядок дає найбільший приріст серед перевірених варіантів
            зміни одного модуля.
          </div>
        </Panel>
      )}
    </>
  );
}

export function Comparison({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const query = useQuery({ queryKey: ["runs"], queryFn: () => api.runs() });
  const [selected, setSelected] = useState<string[]>([]);
  const [baseId, setBaseId] = useState("");
  const rows = query.data ?? [];
  const chosen = rows.filter((row) => selected.includes(row.id));
  const base = chosen.find((row) => row.id === baseId) ?? chosen.at(-1);
  const picks = chosen.length >= 2;
  const different = chosen.some(
    (row) =>
      row.settings.kind !== base?.settings.kind ||
      row.settings.horizon !== base?.settings.horizon,
  );
  const projectName = (id: string) =>
    projects.find((item) => item.id === id)?.name ?? "Проєкт";

  return (
    <>
      <Header
        title="Порівняння сценаріїв"
        description="Оберіть два або більше збережених запусків і базу порівняння."
      />
      <Panel title="Збережені запуски">
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorNote cause={query.error} />
        ) : rows.length === 0 ? (
          <Empty>Спочатку виконайте аналіз для кожного варіанта.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Вибір</th>
                  <th>Проєкт і сценарій</th>
                  <th>Тип</th>
                  <th>Горизонт</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Порівняти ${row.label} ${date(row.created_at)}`}
                        checked={selected.includes(row.id)}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, row.id]
                              : selected.filter((id) => id !== row.id),
                          )
                        }
                      />
                    </td>
                    <th>
                      {projectName(row.project_id)} · {row.label}
                    </th>
                    <td>{row.settings.kind?.toUpperCase()}</td>
                    <td>{number(row.settings.horizon ?? 0)}</td>
                    <td>{date(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {picks && base && (
        <Panel
          title="Порівняння результатів"
          actions={
            <select
              value={base.id}
              aria-label="Базовий запуск"
              onChange={(e) => setBaseId(e.target.value)}
            >
              {chosen.map((row) => (
                <option value={row.id} key={row.id}>
                  База · {projectName(row.project_id)} · {row.label} ·{" "}
                  {date(row.created_at)}
                </option>
              ))}
            </select>
          }
        >
          {different && (
            <p className="warning panel-foot">
              Обрано різні горизонти або типи ланцюга. Для прямого порівняння
              використовуйте однакові умови.
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Запуск</th>
                  <th>Показник</th>
                  <th>Значення</th>
                  <th>Абсолютна зміна</th>
                  <th>Відносна зміна</th>
                </tr>
              </thead>
              <tbody>
                {chosen.flatMap((row) =>
                  (
                    ["reliability", "success", "failure", "running"] as const
                  ).map((metric, index) => {
                    const diff = row[metric] - base[metric];
                    return (
                      <tr key={`${row.id}-${metric}`}>
                        {index === 0 && (
                          <th rowSpan={4}>
                            {projectName(row.project_id)} · {row.label}
                            {row.id === base.id && <small>Базовий</small>}
                          </th>
                        )}
                        <td>{metricNames[metric]}</td>
                        <td>{percent(row[metric], 4)}</td>
                        <td>{number(diff * 100, 4)} в.п.</td>
                        <td>
                          {base[metric] === 0
                            ? "—"
                            : percent(diff / base[metric], 4)}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
