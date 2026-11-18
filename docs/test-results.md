# Результати тестування

Перевірка 18 листопада 2026 року. Інтеграційні випадки виконано на окремій локальній PostgreSQL. Playwright тестував зібрані контейнери на loopback.

| Команда або режим | Фактичний результат |
|---|---|
| pytest із TEST_DATABASE_URL і pytest-cov | 15 пройшли. 93,36% покриття рядків бекенду |
| Ruff check, Ruff format і mypy strict | Пройшли |
| Vitest і React Testing Library | 1 пройшов |
| ESLint і TypeScript strict | Пройшли |
| Playwright Chromium | 3 пройшли проти Docker Compose |
| docker compose config і чистий up --build --wait | PostgreSQL, FastAPI і Next.js запущено. API health і проксі прикладів відповіли |
| Alembic upgrade та check | Міграцію застосовано. Метадані узгоджено зі схемою |
| Демоприклади | Усі три проаналізовано як DTMC і CTMC. Базова система підтверджена закритою формулою, ефект резервного варіанта підтверджений окремим еталоном |

Pytest вивів одне повідомлення Starlette про перехід з HTTPX на HTTPX2 у TestClient. [Покриття по модулях](coverage-report.md). [Виявлені дефекти](defect-report.md).

Аудит виробничих залежностей повернув 0 відомих вразливостей у цьому запуску. pnpm перевірив 138 залежностей, uv перевірив 30.
