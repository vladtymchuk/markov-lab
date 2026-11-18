import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Markov Reliability Lab",
  description: "Лабораторія аналізу надійності програмних систем",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
