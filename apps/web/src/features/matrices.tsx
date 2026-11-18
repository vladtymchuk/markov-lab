"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Save, Table2 } from "lucide-react";
import { api, type Kind } from "@/lib/api";
import { number } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ErrorNote, Header, Loading, Panel } from "@/components/ui/common";
import { Numeric, type DraftProps } from "./builder";

export function MatrixEditor({
  model,
  change,
  project,
  save,
  saving,
  dirty,
}: DraftProps) {
  const [kind, setKind] = useState<Kind>("dtmc");
  const slot = kind === "dtmc" ? "manual_p" : "manual_q";
  const manual = model[slot];
  const auto = useQuery({
    queryKey: ["matrix-auto", kind, model],
    queryFn: () =>
      api.validate(kind, { ...model, [slot]: null, initial: null }),
    retry: false,
  });
  const validated = useQuery({
    queryKey: ["matrix-valid", kind, model],
    queryFn: () => api.validate(kind, model),
    retry: false,
  });
  const labels = [
    ...model.modules.map((m) => m.name || m.id),
    "SUCCESS",
    "FAILURE",
  ];
  const size = labels.length;
  const p0 =
    model.initial ??
    validated.data?.initial ??
    auto.data?.initial ??
    labels.map((_, index) => (index === 0 ? 1 : 0));
  const matrix = manual ?? validated.data?.matrix ?? auto.data?.matrix;
  const q = kind === "ctmc";
  const sum0 = p0.reduce((sum, value) => sum + value, 0);
  const valid0 =
    p0.every((value) => value >= 0 && value <= 1) &&
    Math.abs(sum0 - 1) <= 1e-10;

  function activateManual() {
    const base =
      matrix ??
      labels.map((_, i) => labels.map((__, j) => (!q && i === j ? 1 : 0)));
    change({ ...model, [slot]: base });
  }

  return (
    <>
      <Header
        title="Редактор матриць"
        description={`${project.name} · версія ${project.revision.number}${dirty ? " · є незбережені зміни" : ""}`}
      >
        <Button asChild>
          <a href={api.modelExport(project.id)} download>
            <Download size={16} />
            Збережена JSON-модель
          </a>
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
      {validated.error && <ErrorNote cause={validated.error} />}
      {validated.data?.warnings.map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}
      <Panel
        title="Початковий вектор p(0)"
        description="Перший виклик визначають вхідні ваги завдань та виконавців."
        actions={
          <>
            <span className={valid0 ? "tag" : "tag tag-bad"}>
              ∑ {number(sum0)}
            </span>
            <Button
              onClick={() =>
                change({ ...model, initial: model.initial ? null : p0 })
              }
            >
              {model.initial
                ? "Використати автоматичний вектор"
                : "Редагувати вектор"}
            </Button>
          </>
        }
      >
        <div className="table-scroll">
          <table className="matrix">
            <thead>
              <tr>
                {labels.map((label, i) => (
                  <th key={i}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {p0.map((v, i) => (
                  <td key={i}>
                    {model.initial ? (
                      <Numeric
                        label={`p(0) ${labels[i]}`}
                        value={v}
                        min={0}
                        max={1}
                        invalid={v < 0 || v > 1}
                        onChange={(next) =>
                          change({
                            ...model,
                            initial: p0.map((n, j) => (j === i ? next : n)),
                          })
                        }
                      />
                    ) : (
                      number(v)
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel
        title={q ? "Генератор Q" : "Матриця переходів P"}
        description={
          q
            ? "Рядки сумуються до нуля. Позадіагональні значення невід’ємні."
            : "Кожен рядок сумується до одиниці."
        }
        actions={
          <>
            <div className="tabs">
              {(["dtmc", "ctmc"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={value === kind ? "tab active" : "tab"}
                  aria-pressed={value === kind}
                  onClick={() => setKind(value)}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
            <Button
              onClick={() =>
                manual ? change({ ...model, [slot]: null }) : activateManual()
              }
            >
              <Table2 size={15} />
              {manual ? "Автоматична матриця" : "Редагувати матрицю"}
            </Button>
          </>
        }
      >
        {matrix ? (
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th>З / До</th>
                  {labels.map((label, i) => (
                    <th key={i}>{label}</th>
                  ))}
                  <th>∑</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, i) => {
                  const sum = row.reduce((a, b) => a + b, 0);
                  const invalid = q
                    ? Math.abs(sum) > 1e-10 * Math.max(1, ...row.map(Math.abs))
                    : Math.abs(sum - 1) > 1e-10;
                  return (
                    <tr key={i}>
                      <th>{labels[i]}</th>
                      {row.map((v, j) => {
                        const bad =
                          i >= size - 2
                            ? v !== (!q && i === j ? 1 : 0)
                            : q
                              ? i === j
                                ? v > 0
                                : v < 0
                              : v < 0 || v > 1;
                        return (
                          <td
                            key={j}
                            className={
                              bad ? "bad-cell" : i === j ? "diagonal" : ""
                            }
                          >
                            {manual ? (
                              <Numeric
                                label={`${q ? "Q" : "P"} ${i + 1},${j + 1}`}
                                value={v}
                                invalid={bad}
                                onChange={(next) =>
                                  change({
                                    ...model,
                                    [slot]: matrix.map((r, a) =>
                                      a === i
                                        ? r.map((n, b) => (b === j ? next : n))
                                        : r,
                                    ),
                                  })
                                }
                              />
                            ) : (
                              number(v)
                            )}
                          </td>
                        );
                      })}
                      <td className={invalid ? "bad-cell" : ""}>
                        {number(sum)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : validated.isLoading || auto.isLoading ? (
          <Loading />
        ) : (
          <div className="panel-foot">
            Виправте маршрути або створіть ручну матрицю.
          </div>
        )}
      </Panel>
      {validated.data?.routing && (
        <Panel title="Умовна передача керування">
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th>Модуль</th>
                  {labels.map((label, i) => (
                    <th key={i}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validated.data.routing.map((row, i) => (
                  <tr key={i}>
                    <th>{labels[i]}</th>
                    {row.map((value, j) => (
                      <td key={j}>{number(value)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <Panel
        title="Призначення завдань"
        description="Числа показують ненормовані ваги виконавців."
      >
        {(model.tasks ?? []).length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Завдання</th>
                  {model.modules.map((module) => (
                    <th key={module.id}>{module.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.tasks?.map((task) => (
                  <tr key={task.id}>
                    <th>{task.name}</th>
                    {model.modules.map((module) => {
                      const assignment = model.assignments?.find(
                        (a) =>
                          a.task_id === task.id && a.module_id === module.id,
                      );
                      return (
                        <td key={module.id}>
                          {assignment ? number(assignment.weight ?? 1) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-foot">
            Призначення додаються у вкладці «Завдання» конструктора.
          </div>
        )}
      </Panel>
    </>
  );
}
