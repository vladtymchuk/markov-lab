export const percent = (v: number, digits = 2) =>
  new Intl.NumberFormat("uk-UA", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(v);
export const number = (v: number, digits = 5) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: digits }).format(v);
export const date = (value: string) =>
  new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Сталася несподівана помилка.";
