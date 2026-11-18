"""FastAPI application and consistent public error responses."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from markov_lab.api.routes import router
from markov_lab.application.projects import Conflict, Missing
from markov_lab.engine.build import ModelError

log = logging.getLogger("uvicorn.error")
app = FastAPI(
    title="Markov Reliability Lab API",
    version="1.0.0",
    summary="Побудова і дослідження DTMC та CTMC з відтворюваними запусками.",
)
app.include_router(router)


def error(
    status: int, code: str, message: str, fields: list[dict[str, str]] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "fields": fields}},
    )


class PayloadLimit:
    def __init__(self, app: ASGIApp) -> None:
        self.inner = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.inner(scope, receive, send)
            return
        chunks: list[bytes] = []
        total = 0
        while True:
            event = await receive()
            if event["type"] == "http.disconnect":
                return
            chunk = event.get("body", b"")
            total += len(chunk)
            if total > 1_000_000:
                await error(413, "body_too_large", "Розмір запиту має бути до 1 МБ.")(
                    scope, receive, send
                )
                return
            chunks.append(chunk)
            if not event.get("more_body", False):
                break
        body: bytes | None = b"".join(chunks)

        async def replay() -> Message:
            nonlocal body
            if body is None:
                return await receive()
            packet = {"type": "http.request", "body": body, "more_body": False}
            body = None
            return packet

        await self.inner(scope, replay, send)


app.add_middleware(PayloadLimit)


@app.get("/api/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(RequestValidationError)
async def invalid_input(_request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [
        {"path": ".".join(map(str, issue["loc"])), "message": issue["msg"]}
        for issue in exc.errors()
    ]
    return error(422, "validation", "Перевірте поля запиту.", fields)


@app.exception_handler(ModelError)
async def invalid_model(_request: Request, exc: ModelError) -> JSONResponse:
    return error(422, "model", str(exc))


@app.exception_handler(Missing)
async def missing(_request: Request, exc: Missing) -> JSONResponse:
    return error(404, "missing", str(exc))


@app.exception_handler(Conflict)
async def conflict(_request: Request, exc: Conflict) -> JSONResponse:
    return error(409, "revision_conflict", str(exc))


@app.exception_handler(IntegrityError)
async def database_conflict(_request: Request, exc: IntegrityError) -> JSONResponse:
    log.warning("Database conflict", exc_info=exc)
    return error(409, "database_conflict", "Дані змінилися під час операції. Повторіть запит.")


@app.exception_handler(SQLAlchemyError)
async def database_failure(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
    log.error("Database operation failed", exc_info=exc)
    return error(503, "database", "Не вдалося звернутися до сховища даних.")


@app.exception_handler(HTTPException)
async def http_failure(_request: Request, exc: HTTPException) -> JSONResponse:
    return error(exc.status_code, "http", str(exc.detail))


@app.exception_handler(Exception)
async def unexpected(_request: Request, exc: Exception) -> JSONResponse:
    log.error("Unhandled application failure", exc_info=exc)
    return error(500, "internal", "Сталася внутрішня помилка.")
