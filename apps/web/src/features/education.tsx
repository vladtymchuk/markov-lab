"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Empty,
  ErrorNote,
  Header,
  Loading,
  Panel,
} from "@/components/ui/common";
import { api, type Kind, type System } from "@/lib/api";
import { number, percent } from "@/lib/format";

const stages = [
  "Параметри",
  "Перший виклик",
  "Матриця",
  "Розподіл станів",
  "Надійність",
  "Інтерпретація",
];

export function Education({ model }: { model?: System }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("ctmc");
  const horizon = kind === "dtmc" ? 2 : 1;
  const query = useQuery({
    queryKey: ["education", kind, model],
    queryFn: () =>
      api.preview(model!, { kind, horizon, points: 3, target: null }),
    enabled: Boolean(model),
  });
  const result = query.data;
  const end = result?.series.at(-1);
  return (
    <>
      <Header
        title="Навчальний режим"
        description="Пройдіть розрахунок від параметрів системи до інтерпретації результату."
      >
        <select
          aria-label="Навчальний тип ланцюга"
          value={kind}
          onChange={(e) => setKind(e.target.value === "ctmc" ? "ctmc" : "dtmc")}
        >
          <option value="dtmc">DTMC</option>
          <option value="ctmc">CTMC</option>
        </select>
      </Header>
      <Panel
        title={stages[step]}
        description={`Крок ${step + 1} з ${stages.length} · горизонт ${horizon}`}
      >
        <div className="tabs lesson-tabs">
          {stages.map((title, index) => (
            <button
              type="button"
              key={title}
              className={step === index ? "tab active" : "tab"}
              aria-pressed={step === index}
              onClick={() => setStep(index)}
            >
              {title}
            </button>
          ))}
        </div>
        {!model ? (
          <Empty>Оберіть проєкт або завантажте приклад.</Empty>
        ) : query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorNote cause={query.error} />
        ) : (
          result &&
          end && (
            <>
              {step === 0 && (
                <div className="panel-foot prose">
                  <p>
                    Для кожного модуля задаємо r, імовірність успішного виклику,
                    і λ, інтенсивність завершення виклику.
                  </p>
                  <ul>
                    {model.modules.map((module) => (
                      <li key={module.id}>
                        {module.name} · r = {number(module.reliability ?? 0.99)}{" "}
                        · λ = {number(module.rate ?? 1)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {step === 1 && (
                <div className="panel-foot prose">
                  <p>
                    Вага завдання визначає шанс його вибору. Вага виконавця
                    визначає умовний шанс вибору модуля.
                  </p>
                  <code>
                    pᵢ(0) = ∑ⱼ P(завдання j) × P(модуль i | завдання j)
                  </code>
                  <p>
                    p(0) = [{result.initial.map((v) => number(v)).join("; ")}]
                  </p>
                </div>
              )}
              {step === 2 && (
                <>
                  <div className="panel-foot prose">
                    <p>
                      {result.routing
                        ? kind === "dtmc"
                          ? "Множимо умовні маршрути на r. У FAILURE записуємо 1 − r."
                          : "Множимо ймовірності переходів на λ поза діагоналлю. Діагональ дорівнює мінус сумі решти рядка."
                        : "Розрахунок використовує значення ручної матриці."}
                    </p>
                  </div>
                  <div className="table-scroll">
                    <table className="matrix">
                      <thead>
                        <tr>
                          <th>{kind === "dtmc" ? "P" : "Q"}</th>
                          {result.names.map((name, i) => (
                            <th key={i}>{name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.matrix.map((row, i) => (
                          <tr key={i}>
                            <th>{result.names[i]}</th>
                            {row.map((n, j) => (
                              <td key={j}>{number(n)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {step === 3 && (
                <div className="panel-foot prose">
                  <code>
                    {kind === "dtmc"
                      ? "p(k) = p(0) · Pᵏ"
                      : "p(t) = p(0) · exp(Qt)"}
                  </code>
                  <p>
                    Розподіл на горизонті {end.time} дорівнює [
                    {end.distribution.map((v) => number(v)).join("; ")}]. Сума
                    дорівнює{" "}
                    {number(end.distribution.reduce((a, b) => a + b, 0))}.
                  </p>
                </div>
              )}
              {step === 4 && (
                <div className="panel-foot prose">
                  <code>R = 1 − p(FAILURE)</code>
                  <p>
                    R = {percent(end.reliability, 4)}. До SUCCESS дійшли{" "}
                    {percent(end.success, 4)} запусків, до FAILURE —{" "}
                    {percent(end.failure, 4)}.
                  </p>
                </div>
              )}
              {step === 5 && (
                <div className="panel-foot prose">
                  <p>
                    Імовірність незавершеного виконання становить{" "}
                    {percent(end.running, 4)}. Ця частка входить до R і належить
                    до робочих станів.
                  </p>
                  <p>
                    Для порівняння моделей використовуйте однакові горизонти,
                    одиниці часу й вхідний профіль.
                  </p>
                </div>
              )}
            </>
          )
        )}
        <div className="actions panel-foot">
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} />
            Попередній
          </Button>
          <Button
            variant="default"
            disabled={step === stages.length - 1}
            onClick={() => setStep(step + 1)}
          >
            Наступний
            <ArrowRight size={16} />
          </Button>
        </div>
      </Panel>
    </>
  );
}

export function Help() {
  const questions = [
    [
      "Чому сума рядка не дорівнює 1?",
      "У конструкторі відкрийте переходи й перевірте суму умовних імовірностей кожного модуля. Для Q сума рядка дорівнює нулю.",
    ],
    [
      "Чому завдання не проходить перевірку?",
      "Призначте хоча б одного виконавця з додатною вагою та перевірте вхідні ваги завдань.",
    ],
    [
      "Чому запуск поточної версії недоступний?",
      "Збережіть зміни графа або матриць. Збережений сценарій можна запустити з його власною версією.",
    ],
    [
      "Чому надійність і успіх відрізняються?",
      "Надійність ураховує всі траєкторії без відмови, включно з тими, що ще виконуються.",
    ],
  ];
  return (
    <>
      <Header
        title="Довідка"
        description="Інструкції, позначення та відповіді на часті запитання."
      />
      <Panel title="Швидкий старт" actions={<BookOpen size={17} />}>
        <ol className="panel-foot prose">
          <li>
            У «Проєктах» створіть модель або відкрийте демонстраційний приклад.
          </li>
          <li>У «Конструкторі» задайте модулі, завдання, ваги й маршрути.</li>
          <li>У «Матрицях» перевірте p(0), P або Q. Збережіть модель.</li>
          <li>
            В «Аналізі» задайте горизонт, запустіть обчислення та завантажте
            результат.
          </li>
        </ol>
      </Panel>
      <Panel title="Формули">
        <div className="panel-foot prose">
          <p>
            <code>p(k) = p(0) · Pᵏ</code> для DTMC,{" "}
            <code>p(t) = p(0) · exp(Qt)</code> для CTMC.
          </p>
          <p>
            <code>R = 1 − p(FAILURE)</code>. Імовірності успіху, відмови й
            незавершення сумуються до одиниці.
          </p>
          <p>
            <a
              href="https://doi.org/10.1109/TSE.1980.234477"
              target="_blank"
              rel="noreferrer"
            >
              R. C. Cheung, A User-Oriented Software Reliability Model{" "}
              <ExternalLink size={13} />
            </a>
          </p>
        </div>
      </Panel>
      <Panel title="Часті запитання">
        <div className="faq">
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </Panel>
    </>
  );
}
