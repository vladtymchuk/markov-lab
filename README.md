# Markov Reliability Lab

Україномовна лабораторія оцінювання надійності програмних систем. Побудуйте модель з модулів, завдань і маршрутів. Порівняйте DTMC та CTMC, імовірність успішного завершення й ризик відмови на обраному горизонті. Кожен збережений аналіз має свою версію моделі й відтворювані параметри.

## Запуск

```sh
cp .env.example .env
docker compose up --build
```

- Вебінтерфейс — [localhost:3000](http://localhost:3000).
- OpenAPI — [localhost:8000/docs](http://localhost:8000/docs).
- Для запуску без Docker див. [розгортання](docs/deployment.md).

У «Проєктах» відкрийте один із трьох прикладів. Перевірте граф у «Конструкторі», відкрийте p(0), P або Q у «Матрицях», а потім запустіть «Аналіз». Параметри прикладів умовні. Для відтворення збережіть сценарій і завантажте JSON-знімок результату.

## Перевірки

Встановіть залежності через `uv sync --locked` у `apps/api` та `pnpm install --frozen-lockfile` у `apps/web`. З кореня виконайте `make lint test build`. Для інтеграції задайте `TEST_DATABASE_URL` окремої PostgreSQL. Для Chromium виконайте `pnpm --dir apps/web exec playwright install chromium` та `pnpm --dir apps/web e2e` після запуску системи. Для відмінного URL використовуйте `E2E_URL`.

## Документація

- [Керівництво користувача](docs/user-guide.md)
- [Математичні моделі](docs/mathematical-models.md), [архітектура](docs/architecture.md) та [API](docs/api.md).
- [Матриця вимог](docs/requirements-matrix.md), [перевірки](docs/test-results.md) та [межі](docs/limitations.md).
- [Статус реалізації](IMPLEMENTATION_STATUS.md).
