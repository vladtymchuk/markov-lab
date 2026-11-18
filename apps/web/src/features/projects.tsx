"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Archive,
  Copy,
  Download,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type Example,
  type Project,
  type ProjectCreate,
  type ProjectSummary,
} from "@/lib/api";
import { date, message } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Empty, ErrorNote, Header, Panel } from "@/components/ui/common";

const fields = z.object({
  name: z.string().trim().min(1, "Введіть назву.").max(100, "До 100 символів."),
  description: z.string().max(600, "До 600 символів."),
});

export function ProjectForm({
  initial,
  onSave,
  close,
}: {
  initial?: ProjectSummary;
  onSave: (data: ProjectCreate, key?: string) => Promise<void>;
  close: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof fields>>({
    resolver: zodResolver(fields),
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
    },
  });
  const [error, setError] = useState<unknown>(null);
  return (
    <Panel title={initial ? "Редагувати проєкт" : "Новий проєкт"}>
      <form
        className="form-panel"
        onSubmit={handleSubmit(async (data) => {
          try {
            await onSave(data, initial?.id);
            close();
          } catch (cause) {
            setError(cause);
          }
        })}
      >
        <label>
          Назва проєкту
          <input
            aria-label="Назва проєкту"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "project-name-error" : undefined}
            {...register("name")}
            autoFocus
          />
          {errors.name && (
            <small id="project-name-error" role="alert">
              {errors.name.message}
            </small>
          )}
        </label>
        <label>
          Опис
          <textarea
            aria-label="Опис"
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? "project-description-error" : undefined
            }
            rows={3}
            {...register("description")}
          />
          {errors.description && (
            <small id="project-description-error" role="alert">
              {errors.description.message}
            </small>
          )}
        </label>
        {error != null && <ErrorNote cause={error} />}
        <div className="actions">
          <Button type="submit" variant="default" disabled={isSubmitting}>
            {initial ? "Зберегти зміни" : "Створити проєкт"}
          </Button>
          <Button type="button" onClick={close}>
            Скасувати
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function Projects({
  items,
  examples,
  showNew,
  setShowNew,
  onOpen,
  refresh,
}: {
  items: ProjectSummary[];
  examples: Example[];
  showNew: boolean;
  setShowNew: (value: boolean) => void;
  onOpen: (project: Project) => void;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState("active");
  const [editing, setEditing] = useState<ProjectSummary>();
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const visible = items
    .filter(
      (item) =>
        (view === "all" || item.archived === (view === "archived")) &&
        `${item.name} ${item.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "uk")
        : b.updated_at.localeCompare(a.updated_at),
    );

  async function act(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
      refresh();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPending(false);
    }
  }

  async function save(body: ProjectCreate, key?: string) {
    const next = key ? await api.edit(key, body) : await api.create(body);
    refresh();
    toast.success(key ? "Проєкт оновлено" : "Проєкт створено");
    if (!key) onOpen(next);
  }

  return (
    <>
      <Header
        title="Проєкти"
        description="Керуйте моделями програмних систем і відкривайте навчальні приклади."
      >
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          aria-label="Імпорт моделі"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            void act(async () => {
              if (file.size > 1_000_000)
                throw new Error("Файл має бути меншим за 1 МБ.");
              const body = JSON.parse(await file.text());
              if (!body?.model || typeof body.name !== "string")
                throw new Error("Оберіть JSON-модель або демоприклад.");
              onOpen(
                await api.create({
                  name: body.name,
                  description: body.description ?? "",
                  model: body.model,
                }),
              );
              toast.success("Модель імпортовано");
            });
          }}
        />
        <Button disabled={pending} onClick={() => input.current?.click()}>
          <Upload size={16} />
          Імпорт JSON
        </Button>
        <Button
          variant="default"
          onClick={() => {
            setEditing(undefined);
            setShowNew(true);
          }}
        >
          <Plus size={17} />
          Новий проєкт
        </Button>
      </Header>
      {showNew && (
        <ProjectForm
          key={editing?.id ?? "new"}
          initial={editing}
          onSave={save}
          close={() => setShowNew(false)}
        />
      )}
      <Panel
        title="Мої моделі"
        actions={
          <>
            <label className="search">
              <Search size={16} />
              <input
                placeholder="Пошук проєктів"
                aria-label="Пошук проєктів"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Стан проєктів"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="active">Активні</option>
              <option value="archived">Архів</option>
              <option value="all">Усі</option>
            </select>
            <select
              aria-label="Сортування"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Останні змінені</option>
              <option value="name">За назвою</option>
            </select>
          </>
        }
      >
        {visible.length === 0 ? (
          <Empty>За цими фільтрами проєктів немає.</Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Проєкт</th>
                  <th>Оновлено</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        {item.description || (item.archived ? "В архіві" : "")}
                      </small>
                    </td>
                    <td>{date(item.updated_at)}</td>
                    <td>
                      <div className="actions">
                        <Button
                          disabled={pending}
                          onClick={() =>
                            void act(async () =>
                              onOpen(await api.project(item.id)),
                            )
                          }
                        >
                          <FolderOpen size={15} />
                          Відкрити
                        </Button>
                        <Button
                          title="Редагувати"
                          aria-label={`Редагувати ${item.name}`}
                          onClick={() => {
                            setEditing(item);
                            setShowNew(true);
                          }}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          title="Дублювати"
                          aria-label={`Дублювати ${item.name}`}
                          disabled={pending}
                          onClick={() =>
                            void act(async () => {
                              await api.duplicate(item.id);
                              toast.success("Копію створено");
                            })
                          }
                        >
                          <Copy size={15} />
                        </Button>
                        <Button
                          title={item.archived ? "Відновити" : "Архівувати"}
                          aria-label={
                            item.archived ? "Відновити" : "Архівувати"
                          }
                          disabled={pending}
                          onClick={() =>
                            void act(async () => {
                              await api.edit(item.id, {
                                archived: !item.archived,
                              });
                            })
                          }
                        >
                          {item.archived ? (
                            <RefreshCw size={15} />
                          ) : (
                            <Archive size={15} />
                          )}
                        </Button>
                        <Button asChild>
                          <a
                            href={api.modelExport(item.id)}
                            download
                            title="Експортувати модель"
                            aria-label="Експортувати модель"
                          >
                            <Download size={15} />
                          </a>
                        </Button>
                        <Button
                          title="Видалити"
                          aria-label={`Видалити ${item.name}`}
                          disabled={pending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Видалити «${item.name}» разом із версіями та історією?`,
                              )
                            )
                              void act(async () => {
                                await api.remove(item.id);
                                toast.success("Проєкт видалено");
                              });
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel
        title="Демонстраційні моделі"
        description="Навчальні системи з умовними параметрами."
      >
        <div className="example-grid">
          {examples.map((example) => (
            <article key={example.id}>
              <FolderPlus size={22} />
              <h3>{example.name}</h3>
              <p>{example.description}</p>
              <Button
                disabled={pending}
                onClick={() =>
                  void act(async () => {
                    onOpen(
                      await api.create({
                        name: example.name,
                        description: example.description,
                        model: example.model,
                      }),
                    );
                    toast.success("Демомодель додано");
                  })
                }
              >
                Використати приклад
              </Button>
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}
