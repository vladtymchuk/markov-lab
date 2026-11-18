import { createRequire } from "node:module";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const baseURL = process.env.E2E_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5, baseURL });
const destination = resolve("docs/screenshots");
let projectId;
try {
  await mkdir(destination, { recursive: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Відкрити приклад" }).click();
  await page.getByRole("heading", { name: "Конструктор моделі" }).waitFor();
  projectId = await page.getByLabel("Активний проєкт").inputValue();
  await page.getByRole("button", { name: "Перевірити граф" }).click();
  await page.getByText("Матриця пройшла перевірку").waitFor();
  await page.getByText("Матриця пройшла перевірку").waitFor({ state: "hidden" });
  await page.screenshot({ path: resolve(destination, "builder.png"), animations: "disabled" });
  await page.getByRole("link", { name: "Матриці", exact: true }).click();
  await page.getByRole("button", { name: "CTMC", exact: true }).click();
  await page.getByRole("heading", { name: "Умовна передача керування" }).waitFor();
  await page.screenshot({ path: resolve(destination, "matrices.png"), animations: "disabled" });
  await page.getByRole("link", { name: "Аналіз", exact: true }).click();
  await page.getByRole("button", { name: "Запустити аналіз" }).click();
  await page.getByRole("heading", { name: "Показники за станами" }).waitFor();
  await page.getByText("Аналіз збережено").waitFor({ state: "hidden" });
  await page.locator(".chart").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(destination, "analysis.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("link", { name: "Огляд", exact: true }).click();
  await page.getByRole("heading", { name: "Критичні компоненти" }).waitFor();
  await page.locator(".critical li").first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(destination, "dashboard.png"), animations: "disabled" });

  if (process.env.MERMAID_JS) {
    const diagramPage = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 2 });
    await diagramPage.setContent('<main id="diagram" style="display:inline-block;padding:15px"></main>');
    await diagramPage.addScriptTag({ path: process.env.MERMAID_JS });
    await diagramPage.evaluate(() => globalThis.mermaid.initialize({
      startOnLoad: false, securityLevel: "strict", theme: "neutral",
      flowchart: { useMaxWidth: false }, themeVariables: { fontFamily: "Arial", fontSize: "17px" },
    }));
    for (const name of await readdir("docs/diagrams")) {
      if (!name.endsWith(".mmd")) continue;
      const diagram = await readFile(resolve("docs/diagrams", name), "utf8");
      await diagramPage.evaluate(async ({ diagram, uid }) => {
        const value = await globalThis.mermaid.render(uid, diagram);
        document.querySelector("#diagram").innerHTML = value.svg;
      }, { diagram, uid: name.replace(".mmd", "") });
      await diagramPage.locator("#diagram").screenshot({ path: resolve(destination, name.replace(".mmd", ".png")) });
    }
  }
} finally {
  if (projectId) await page.request.delete(`/lab-api/projects/${projectId}`);
  await browser.close();
}
