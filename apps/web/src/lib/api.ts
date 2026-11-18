import type { components, operations, paths } from "@contracts";

type Schemas = components["schemas"];
export type System = Schemas["SoftwareSystem"];
export type Project = Schemas["ProjectDetail"];
export type ProjectSummary = Schemas["ProjectSummary"];
export type ProjectCreate = Schemas["ProjectCreate"];
export type Example = Schemas["ExampleInfo"];
export type Run = Schemas["RunDetail"];
export type Settings = Schemas["AnalysisSettings"];
export type Matrices = Schemas["Matrices"];
export type Result = Schemas["AnalysisResult"];
export type Kind = NonNullable<Settings["kind"]>;

const root = "/lab-api";
type GetPath = {
  [K in keyof paths]: paths[K]["get"] extends undefined ? never : K;
}[keyof paths];
type Json<T> = T extends { content: { "application/json": infer S } }
  ? S
  : never;
type ResponseBody<T> = T extends { responses: infer R }
  ? Json<R[Extract<keyof R, 200 | 201>]>
  : never;

export async function request<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  const response = await fetch(root + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const issue = data?.error?.fields?.[0];
    const message = data?.error?.message;
    throw new Error(
      typeof message === "string"
        ? message + (issue ? ` ${issue.path}: ${issue.message}` : "")
        : `Запит завершився з кодом ${response.status}.`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const project = (key: string) => `/projects/${key}`;
const get = <P extends GetPath>(path: P, url: string = path) =>
  request<ResponseBody<paths[P]["get"]>>(url);
const call = <O extends keyof operations>(
  path: string,
  method: "POST" | "PUT" | "PATCH",
  body?: Json<operations[O]["requestBody"]>,
) =>
  request<ResponseBody<operations[O]>>(
    path,
    method,
    body as object | undefined,
  );

export const api = {
  projects: () => get("/api/v1/projects", "/projects"),
  project: (key: string) => get("/api/v1/projects/{key}", project(key)),
  examples: () => get("/api/v1/examples", "/examples"),
  runs: (key?: string) =>
    get("/api/v1/runs", key ? `/runs?project_id=${key}` : "/runs"),
  run: (key: string) => get("/api/v1/runs/{key}", `/runs/${key}`),
  scenarios: (key: string) =>
    get("/api/v1/projects/{key}/scenarios", project(key) + "/scenarios"),
  revisions: (key: string) =>
    get("/api/v1/projects/{key}/revisions", project(key) + "/revisions"),
  create: (body: ProjectCreate) =>
    call<"createProject">("/projects", "POST", body),
  edit: (key: string, body: Schemas["ProjectPatch"]) =>
    call<"patchProject">(project(key), "PATCH", body),
  duplicate: (key: string) =>
    call<"duplicateProject">(project(key) + "/duplicate", "POST"),
  remove: (key: string) => request<void>(project(key), "DELETE"),
  save: (key: string, revision_id: string, model: System) =>
    call<"saveModel">(project(key) + "/model", "PUT", { revision_id, model }),
  validate: (kind: Kind, model: System) =>
    call<"validateModel">(`/validate/${kind}`, "POST", model),
  preview: (model: System, settings: Settings) =>
    call<"previewAnalysis">("/preview", "POST", { model, settings }),
  analyze: (key: string, body: Schemas["RunCreate"]) =>
    call<"createRun">(project(key) + "/runs", "POST", body),
  scenario: (key: string, body: Schemas["ScenarioCreate"]) =>
    call<"createScenario">(project(key) + "/scenarios", "POST", body),
  simulate: (
    key: string,
    revision: string,
    body: Schemas["SimulationSettings"],
  ) =>
    call<"simulateProject">(
      project(key) + `/simulate?revision_id=${revision}`,
      "POST",
      body,
    ),
  sensitivity: (key: string, revision: string, delta: number, body: Settings) =>
    call<"sensitivityProject">(
      project(key) + `/sensitivity?revision_id=${revision}&delta=${delta}`,
      "POST",
      body,
    ),
  modelExport: (key: string, revision?: string) =>
    root +
    project(key) +
    "/model.json" +
    (revision ? `?revision_id=${revision}` : ""),
  runExport: (key: string, format: string) =>
    root + `/runs/${key}/export/${format}`,
};
