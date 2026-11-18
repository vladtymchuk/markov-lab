import { test, expect } from "@playwright/test";

test("creates, edits, analyzes, exports and reopens a project", async ({
  page,
  request,
}) => {
  const title = `Наскрізна модель ${Date.now()}`;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Огляд надійності" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Новий проєкт" }).click();
  await page.getByLabel("Назва проєкту").fill(title);
  await page.getByRole("button", { name: "Створити проєкт" }).click();
  await expect(
    page.getByRole("heading", { name: "Конструктор моделі" }),
  ).toBeVisible();
  const key = await page.getByLabel("Активний проєкт").inputValue();
  try {
    await page.getByRole("button", { name: "Додати модуль" }).click();
    await page.getByLabel("Назва модуля 2").fill("Підтвердження");
    await page.getByRole("link", { name: "Матриці", exact: true }).click();
    await page.getByRole("button", { name: "Редагувати матрицю" }).click();
    await page.getByLabel("P 1,1", { exact: true }).fill("0.2");
    await page.getByLabel("P 1,3", { exact: true }).fill("0.79");
    await page.getByRole("button", { name: "Зберегти модель" }).click();
    await expect(page.getByText("Збережено версію 2")).toBeVisible();

    await page.getByRole("link", { name: "Аналіз", exact: true }).click();
    await page.getByLabel("Тип ланцюга").selectOption("dtmc");
    await page.getByLabel("Кількість кроків").fill("1");
    await page.getByLabel("Назва сценарію").fill("Перший крок");
    await page.getByRole("button", { name: "Зберегти сценарій" }).click();
    await expect(page.getByText("Сценарій збережено")).toBeVisible();
    await page.getByRole("button", { name: "Запустити аналіз" }).click();
    await expect(
      page.getByRole("heading", { name: "Показники за станами" }),
    ).toBeVisible();
    await expect(page.locator(".metric-value").nth(1)).toHaveText("79%");
    for (const label of ["Результати CSV", "Звіт PDF", "SVG", "PNG"]) {
      const pending = page.waitForEvent("download");
      await page
        .getByRole(label === "SVG" || label === "PNG" ? "button" : "link", {
          name: label,
          exact: true,
        })
        .click();
      const download = await pending;
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toMatch(/\.(csv|pdf|svg|png)$/);
    }
    await page.getByRole("link", { name: "Проєкти", exact: true }).click();
    await page.getByLabel("Пошук проєктів").fill(title);
    await page.getByRole("button", { name: "Відкрити", exact: true }).click();
    await expect(page.getByLabel("Назва модуля 2")).toHaveValue(
      "Підтвердження",
    );
    await page.getByRole("link", { name: "Аналіз", exact: true }).click();
    await page
      .getByRole("button", { name: "Переглянути", exact: true })
      .click();
    await expect(page.locator(".metric-value").nth(1)).toHaveText("79%");
  } finally {
    await request.delete(`/lab-api/projects/${key}`);
  }
});

test("loads a real demonstration on mobile and switches themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: "Імовірності за горизонтом аналізу" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Світла тема" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Відкрити меню" }).click();
  await page.getByRole("link", { name: "Навчальний режим" }).click();
  await expect(
    page.getByRole("heading", { name: "Навчальний режим" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Наступний" }).click();
  await expect(
    page.getByRole("heading", { name: "Перший виклик" }),
  ).toBeVisible();
});

test("compares payment scenarios and runs independent experiments", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Відкрити приклад" }).click();
  await expect(
    page.getByRole("heading", { name: "Конструктор моделі" }),
  ).toBeVisible();
  const key = await page.getByLabel("Активний проєкт").inputValue();
  async function runScenario(name: string) {
    await page.getByRole("link", { name: "Аналіз", exact: true }).click();
    await page.getByLabel("Назва сценарію").fill(name);
    await page.getByRole("button", { name: "Зберегти сценарій" }).click();
    await expect(
      page.getByLabel("Сценарій").locator("option:checked"),
    ).toContainText(name);
    await page.getByRole("button", { name: "Запустити аналіз" }).click();
    await expect(
      page.getByRole("heading", { name: "Показники за станами" }),
    ).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  try {
    await runScenario("Базові платежі");
    await page.getByRole("link", { name: "Конструктор", exact: true }).click();
    await page.getByLabel("Надійність модуля 2", { exact: true }).fill("0.999");
    await page.getByRole("button", { name: "Зберегти модель" }).click();
    await expect(page.getByText("Збережено версію 2")).toBeVisible();
    await runScenario("Покращені платежі");
    await page.getByRole("link", { name: "Порівняння", exact: true }).click();
    await page
      .getByRole("checkbox", { name: /Порівняти Базові платежі/ })
      .check();
    await page
      .getByRole("checkbox", { name: /Порівняти Покращені платежі/ })
      .check();
    await expect(
      page.getByRole("heading", { name: "Порівняння результатів" }),
    ).toBeVisible();

    const runResponse = await request.get(`/lab-api/runs?project_id=${key}`);
    const results = (await runResponse.json()) as {
      label: string;
      reliability: number;
    }[];
    const base = results.find((row) => row.label === "Базові платежі");
    const improved = results.find((row) => row.label === "Покращені платежі");
    expect(improved?.reliability ?? 0).toBeGreaterThan(base?.reliability ?? 1);

    await page.getByRole("link", { name: "Монте-Карло", exact: true }).click();
    await page.getByRole("button", { name: "Запустити симуляцію" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Монте-Карло та аналітичний результат",
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Чутливість", exact: true }).click();
    await page.getByRole("button", { name: "Обчислити чутливість" }).click();
    await expect(
      page.getByRole("heading", { name: "Вплив поліпшень" }),
    ).toBeVisible();
  } finally {
    await request.delete(`/lab-api/projects/${key}`);
  }
});
