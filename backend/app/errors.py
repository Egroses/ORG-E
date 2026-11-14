"""Error format: {"error": {"code": ..., "message": ...}} with a matching HTTP status.

/api/patch answers also carry "status": "failed" (docs/patch-api.md).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

HTTP_STATUS = {
    "bad_input": 400,
    "not_found": 404,
    "no_coverage": 404,
    "archive_unavailable": 503,
    "internal_error": 500,
}


class ApiError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def error_body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def _respond(request: Request, code: str, message: str, status: int) -> JSONResponse:
    body = error_body(code, message)
    if request.url.path == "/api/patch":
        body = {"status": "failed", **body}
    return JSONResponse(body, status_code=status)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return _respond(request, exc.code, exc.message, HTTP_STATUS[exc.code])

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        message = f"{where}: {first.get('msg', 'invalid input')}" if where else first.get("msg", "invalid input")
        return _respond(request, "bad_input", message, 400)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception):
        # e.g. a NaN reaching a JSON answer (Starlette writes JSON with allow_nan=False)
        logging.getLogger("backend").exception("unhandled error")
        return _respond(request, "internal_error", f"Unexpected server error: {type(exc).__name__}", 500)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        code = "not_found" if exc.status_code == 404 else "bad_input"
        return _respond(request, code, str(exc.detail), exc.status_code)
