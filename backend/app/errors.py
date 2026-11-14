"""Error format: {"error": {"code": ..., "message": ...}} with a matching HTTP status."""

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


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(error_body(exc.code, exc.message), status_code=HTTP_STATUS[exc.code])

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        message = f"{where}: {first.get('msg', 'invalid input')}" if where else first.get("msg", "invalid input")
        return JSONResponse(error_body("bad_input", message), status_code=400)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        # e.g. a NaN reaching a JSON answer (Starlette writes JSON with allow_nan=False)
        logging.getLogger("backend").exception("unhandled error")
        return JSONResponse(error_body("internal_error", f"Unexpected server error: {type(exc).__name__}"),
                            status_code=500)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = "not_found" if exc.status_code == 404 else "bad_input"
        return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)
