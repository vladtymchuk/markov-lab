# API

Інтерактивна схема доступна за `http://localhost:8000/docs`. Вебклієнт використовує проксі `/lab-api`. JSON OpenAPI і згенеровані TypeScript-типи містяться в `packages/contracts`.

| Метод і шлях від /api/v1 | Операція |
|---|---|
| GET /examples | Три навчальні JSON-моделі |
| GET, POST /projects | Перелік та створення |
| GET, PATCH, DELETE /projects/{id} | Відкриття, зміна назви/опису/архіву та видалення |
| POST /projects/{id}/duplicate | Незалежна копія останньої версії |
| PUT /projects/{id}/model | Збереження нової версії з перевіркою базового revision_id |
| GET /projects/{id}/revisions | Перелік версій |
| GET /projects/{id}/model.json?revision_id=… | JSON придатний до повторного імпорту |
| POST /validate/{kind} | Перевірка моделі, p₀, P/Q, C і попередження |
| POST /preview | Розрахунок без запису в історію |
| GET, POST /projects/{id}/scenarios | Перелік і фіксація параметрів сценарію |
| POST /projects/{id}/runs | Запуск поточної/вказаної версії або сценарію |
| GET /runs?project_id=… і GET /runs/{id} | До 100 останніх запусків та повний результат |
| GET /runs/{id}/export/{format} | json, matrix.csv, results.csv, pdf |
| POST /projects/{id}/simulate?revision_id=… | Монте-Карло з аналітичним еталоном |
| POST /projects/{id}/sensitivity?delta=…&revision_id=… | Поліпшення кожного модуля окремо |

Наприклад, тіло запуску `{"settings":{"kind":"ctmc","horizon":8,"points":41,"target":"SUCCESS"}}`.

Єдина оболонка помилки має `error.code`, `error.message` та `error.fields` зі шляхом і повідомленням. Типові коди HTTP — 404 для відсутньої сутності, 409 для конфлікту версії, 413 для завеликого тіла, 422 для параметрів або матриць, 503 для недоступного сховища. Успішне створення повертає 201, видалення повертає 204.
