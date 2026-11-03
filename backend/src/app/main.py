from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .auth.router import router as auth_router
from .config import get_settings
from .db import get_session
from .inventory.router import router as inventory_router
from .listings.router import router as listings_router

CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "altheo"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

app = FastAPI(title="Altheo Homes API")


@app.middleware("http")
async def require_csrf_header(request: Request, call_next):
    """Browsers can only send this custom header cross-site after a CORS check, which blocks forgeries."""
    if request.method not in SAFE_METHODS and request.url.path.startswith("/api/"):
        if request.headers.get(CSRF_HEADER) != CSRF_VALUE:
            return JSONResponse(
                status_code=403, content={"detail": "Missing request header. Reload the page."}
            )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def friendly_validation_errors(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Turns validation errors into {"detail": first message, "errors": {field: message}} for the forms."""
    errors: dict[str, str] = {}
    for err in exc.errors():
        # ("body", "room_types", 0, "rent") -> "room_types.0.rent"; ("body", "email") -> "email"
        path = [str(p) for p in err.get("loc", ()) if p != "body"]
        field = ".".join(path) or "body"
        message = str(err.get("msg", "Check this field.")).removeprefix("Value error, ")
        kind = err.get("type", "")
        if kind == "missing":
            message = "This field is required."
        elif kind in ("int_parsing", "int_type", "int_from_float"):
            message = "Enter a whole number."
        elif path[-1:] == ["email"] and kind == "value_error":
            message = "Enter a valid email address."
        errors.setdefault(field, message)
    first = next(iter(errors.values()), "Check the form and try again.")
    return JSONResponse(status_code=422, content={"detail": first, "errors": errors})


app.include_router(auth_router, prefix="/api/auth")
app.include_router(inventory_router, prefix="/api/admin/buildings")
app.include_router(listings_router, prefix="/api/listings")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db(session: Annotated[Session, Depends(get_session)]):
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(status_code=503, content={"database": "unavailable"})
    return {"database": "ok"}
