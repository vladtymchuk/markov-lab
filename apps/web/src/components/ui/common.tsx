import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { message } from "@/lib/format";

export function Header({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={20} aria-hidden />
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="skeleton" role="status">
      <LoaderCircle size={16} className="spin" /> <span>Завантаження…</span>
    </div>
  );
}

export function ErrorNote({ cause }: { cause: unknown }) {
  return (
    <div className="error-note" role="alert">
      <AlertCircle size={17} />
      <span>{message(cause)}</span>
    </div>
  );
}
