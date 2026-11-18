"use client";

import { useState } from "react";
import { Check, Network, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type Kind,
  type Matrices,
  type Project,
  type System,
} from "@/lib/api";
import { message, number } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Empty, ErrorNote, Header, Panel } from "@/components/ui/common";
import { SystemGraph } from "./graph";

export type DraftProps = {
  project: Project;
  model: System;
  change: (model: System) => void;
  save: () => Promise<boolean>;
  saving: boolean;
  dirty: boolean;
};

function numeric(
  event: React.ChangeEvent<HTMLInputElement>,
  onChange: (v: number) => void,
) {
  if (Number.isFinite(event.currentTarget.valueAsNumber))
    onChange(event.currentTarget.valueAsNumber);
}

export function Numeric({
  value,
  label,
  onChange,
  min,
  max,
  step = "any",
  invalid,
}: {
  value: number;
  label: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  invalid?: boolean;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-invalid={invalid || undefined}
      onChange={(e) => numeric(e, onChange)}
    />
  );
}

export function Builder({
  project,
  model,
  change,
  save,
  saving,
  dirty,
  light,
}: DraftProps & { light: boolean }) {
  const [kind, setKind] = useState<Kind>("dtmc");
  const [validated, setValidated] = useState<{
    model: System;
    kind: Kind;
    info: Matrices;
  }>();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("modules");
  const modules = model.modules;
  const tasks = model.tasks ?? [];
  const transitions = model.transitions ?? [];
  const assignments = model.assignments ?? [];
  const names = new Map([
    ...modules.map((m) => [m.id, m.name] as const),
    ["SUCCESS", "SUCCESS"],
  ]);

  function topology(next: System) {
    if (
      (model.manual_p || model.manual_q || model.initial) &&
      !window.confirm(
        "Зміна порядку станів скине ручні матриці й початковий вектор. Продовжити?",
      )
    )
      return;
    change({ ...next, initial: null, manual_p: null, manual_q: null });
  }

  function addTransition(source: string, target: string) {
    if (
      !modules.some((m) => m.id === source) ||
      target === "FAILURE" ||
      (!modules.some((m) => m.id === target) && target !== "SUCCESS") ||
      transitions.some((t) => t.source === source && t.target === target)
    ) {
      toast.error(
        "Оберіть унікальний маршрут із модуля до модуля або SUCCESS.",
      );
      return;
    }
    const hasRoute = transitions.some((t) => t.source === source);
    change({
      ...model,
      transitions: [
        ...transitions,
        { source, target, probability: hasRoute ? 0 : 1 },
      ],
    });
    setTab("routes");
  }

  async function validate() {
    setPending(true);
    setError(null);
    try {
      setValidated({ model, kind, info: await api.validate(kind, model) });
      toast.success("Матриця пройшла перевірку");
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }

  const current =
    validated?.model === model && validated.kind === kind
      ? validated.info
      : undefined;
  return (
    <>
      <Header
        title="Конструктор моделі"
        description={`${project.name} · версія ${project.revision.number}${dirty ? " · є незбережені зміни" : ""}`}
      >
        <select
          aria-label="Тип перевірки"
          value={kind}
          onChange={(e) => setKind(e.target.value === "ctmc" ? "ctmc" : "dtmc")}
        >
          <option value="dtmc">DTMC</option>
          <option value="ctmc">CTMC</option>
        </select>
        <Button onClick={() => void validate()} disabled={pending}>
          <Check size={17} />
          Перевірити граф
        </Button>
        <Button
          variant="default"
          onClick={() => void save()}
          disabled={saving || !dirty || project.archived}
        >
          <Save size={16} />
          Зберегти модель
        </Button>
      </Header>
      {error != null && <ErrorNote cause={error} />}
      {current?.warnings.map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}
      <Panel
        title="Граф програмної системи"
        description="Перетягніть зв’язок від виходу модуля до входу наступного стану."
        actions={
          <span className="tag">
            <Network size={14} />
            {modules.length} модулів
          </span>
        }
      >
        <SystemGraph
          model={model}
          matrices={current}
          light={light}
          onConnect={(connection) =>
            addTransition(connection.source, connection.target)
          }
          onSelect={(key) => {
            setSelected(key);
            if (names.has(key) && key !== "SUCCESS") setTab("modules");
          }}
        />
      </Panel>
      <Panel
        title="Параметри графа"
        actions={
          <div className="tabs" aria-label="Параметри графа">
            {[
              ["modules", "Модулі"],
              ["tasks", "Завдання"],
              ["routes", "Переходи"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={id === tab ? "tab active" : "tab"}
                onClick={() => setTab(id)}
                aria-pressed={id === tab}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {tab === "modules" && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Назва модуля</th>
                    <th>Надійність r</th>
                    <th>Інтенсивність λ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {modules.map((item, index) => {
                    const patch = (updated: Partial<typeof item>) =>
                      change({
                        ...model,
                        modules: modules.map((m) =>
                          m.id === item.id ? { ...m, ...updated } : m,
                        ),
                      });
                    return (
                      <tr
                        key={item.id}
                        className={selected === item.id ? "row-selected" : ""}
                      >
                        <td>
                          <input
                            aria-label={`Назва модуля ${index + 1}`}
                            value={item.name}
                            onChange={(e) => patch({ name: e.target.value })}
                          />
                        </td>
                        <td>
                          <Numeric
                            label={`Надійність модуля ${index + 1}`}
                            min={0}
                            max={1}
                            value={item.reliability ?? 0.99}
                            invalid={
                              (item.reliability ?? 0.99) < 0 ||
                              (item.reliability ?? 0.99) > 1
                            }
                            onChange={(reliability) => patch({ reliability })}
                          />
                        </td>
                        <td>
                          <Numeric
                            label={`Інтенсивність модуля ${index + 1}`}
                            min={0}
                            max={1e6}
                            value={item.rate ?? 1}
                            invalid={
                              (item.rate ?? 1) <= 0 || (item.rate ?? 1) > 1e6
                            }
                            onChange={(rate) => patch({ rate })}
                          />
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            aria-label={`Видалити модуль ${item.name}`}
                            disabled={modules.length <= 1}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Видалити «${item.name}» та його зв’язки?`,
                                )
                              )
                                topology({
                                  ...model,
                                  modules: modules.filter(
                                    (m) => m.id !== item.id,
                                  ),
                                  assignments: assignments.filter(
                                    (a) => a.module_id !== item.id,
                                  ),
                                  transitions: transitions.filter(
                                    (t) =>
                                      t.source !== item.id &&
                                      t.target !== item.id,
                                  ),
                                });
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="panel-foot">
              <Button
                disabled={modules.length >= 30}
                onClick={() => {
                  const id = "m-" + crypto.randomUUID().slice(0, 12);
                  topology({
                    ...model,
                    modules: [
                      ...modules,
                      {
                        id,
                        name: `Модуль ${modules.length + 1}`,
                        reliability: 0.99,
                        rate: 1,
                      },
                    ],
                    transitions: [
                      ...transitions,
                      { source: id, target: "SUCCESS", probability: 1 },
                    ],
                  });
                  setSelected(id);
                }}
              >
                <Plus size={16} />
                Додати модуль
              </Button>
            </div>
          </>
        )}
        {tab === "tasks" && (
          <>
            {tasks.length === 0 ? (
              <Empty>Додайте завдання, щоб визначити профіль запуску.</Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Завдання</th>
                      <th>Вхідна вага</th>
                      <th>Виконавці та їхні ваги</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task, index) => {
                      const patch = (updated: Partial<typeof task>) =>
                        change({
                          ...model,
                          tasks: tasks.map((t) =>
                            t.id === task.id ? { ...t, ...updated } : t,
                          ),
                        });
                      return (
                        <tr key={task.id}>
                          <td>
                            <input
                              aria-label={`Назва завдання ${index + 1}`}
                              value={task.name}
                              onChange={(e) => patch({ name: e.target.value })}
                            />
                          </td>
                          <td>
                            <Numeric
                              label={`Вага завдання ${task.name}`}
                              min={0}
                              max={1e9}
                              value={task.weight ?? 1}
                              onChange={(weight) => patch({ weight })}
                            />
                          </td>
                          <td>
                            <div className="assignments">
                              {modules.map((m) => {
                                const match = assignments.find(
                                  (a) =>
                                    a.module_id === m.id &&
                                    a.task_id === task.id,
                                );
                                const rest = assignments.filter(
                                  (a) => a !== match,
                                );
                                return (
                                  <div key={m.id} className="assignment">
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={Boolean(match)}
                                        onChange={(e) =>
                                          change({
                                            ...model,
                                            assignments: e.target.checked
                                              ? [
                                                  ...rest,
                                                  {
                                                    module_id: m.id,
                                                    task_id: task.id,
                                                    weight: 1,
                                                  },
                                                ]
                                              : rest,
                                          })
                                        }
                                      />
                                      {m.name}
                                    </label>
                                    {match && (
                                      <Numeric
                                        label={`Вага ${m.name} для ${task.name}`}
                                        min={0}
                                        max={1e9}
                                        value={match.weight ?? 1}
                                        onChange={(weight) =>
                                          change({
                                            ...model,
                                            assignments: [
                                              ...rest,
                                              { ...match, weight },
                                            ],
                                          })
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              aria-label={`Видалити ${task.name}`}
                              onClick={() => {
                                if (window.confirm(`Видалити «${task.name}»?`))
                                  change({
                                    ...model,
                                    tasks: tasks.filter(
                                      (t) => t.id !== task.id,
                                    ),
                                    assignments: assignments.filter(
                                      (a) => a.task_id !== task.id,
                                    ),
                                  });
                              }}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel-foot">
              <Button
                disabled={tasks.length >= 100}
                onClick={() => {
                  const id = "t-" + crypto.randomUUID().slice(0, 12);
                  change({
                    ...model,
                    tasks: [
                      ...tasks,
                      { id, name: `Завдання ${tasks.length + 1}`, weight: 1 },
                    ],
                    assignments: [
                      ...assignments,
                      { module_id: modules[0].id, task_id: id, weight: 1 },
                    ],
                  });
                }}
              >
                <Plus size={16} />
                Додати завдання
              </Button>
            </div>
          </>
        )}
        {tab === "routes" && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Вихідний модуль</th>
                    <th>Наступний стан</th>
                    <th>Імовірність після успіху</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {transitions.map((item, index) => (
                    <tr key={`${item.source}-${item.target}`}>
                      <td>{names.get(item.source)}</td>
                      <td>{names.get(item.target)}</td>
                      <td>
                        <Numeric
                          label={`Імовірність ${names.get(item.source)} → ${names.get(item.target)}`}
                          min={0}
                          max={1}
                          value={item.probability}
                          invalid={item.probability < 0 || item.probability > 1}
                          onChange={(probability) =>
                            change({
                              ...model,
                              transitions: transitions.map((entry, i) =>
                                i === index ? { ...entry, probability } : entry,
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          aria-label="Видалити перехід"
                          onClick={() =>
                            change({
                              ...model,
                              transitions: transitions.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-foot route-foot">
              <RouteForm
                key={modules.map((m) => m.id).join()}
                model={model}
                add={addTransition}
              />
              <div className="actions">
                {modules.map((m) => {
                  const sum = transitions
                    .filter((t) => t.source === m.id)
                    .reduce((total, item) => total + item.probability, 0);
                  return (
                    <span
                      key={m.id}
                      className={
                        Math.abs(sum - 1) > 1e-10 ? "tag tag-bad" : "tag"
                      }
                    >
                      {m.name} ∑ {number(sum)}
                    </span>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

function RouteForm({
  model,
  add,
}: {
  model: System;
  add: (source: string, target: string) => void;
}) {
  const [source, setSource] = useState(model.modules[0].id);
  const [target, setTarget] = useState("SUCCESS");
  return (
    <form
      className="actions"
      onSubmit={(e) => {
        e.preventDefault();
        add(source, target);
      }}
    >
      <select
        aria-label="Вихідний модуль"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      >
        {model.modules.map((m) => (
          <option value={m.id} key={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Наступний стан"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="SUCCESS">SUCCESS</option>
        {model.modules.map((m) => (
          <option value={m.id} key={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <Button type="submit">
        <Plus size={16} />
        Додати перехід
      </Button>
    </form>
  );
}

export function saveFailure(error: unknown): boolean {
  toast.error(message(error));
  return false;
}
