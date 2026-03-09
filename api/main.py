import os
import sys
from pathlib import Path

# Absolute Root Path fix
root_path = Path(__file__).resolve().parent.parent
if str(root_path) not in sys.path:
    sys.path.append(str(root_path))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from api import models, database, router
import os

# Create database tables
try:
    models.Base.metadata.create_all(bind=database.engine)
except Exception as e:
    print(f"Database creation skipped or failed: {e}")

app = FastAPI(title="SafeTracker API")

# Path to uploads directory (at project root)
uploads_path = root_path / "uploads"

# Ensure uploads directory exists (Note: Vercel is read-only except /tmp)
if not uploads_path.exists():
    try:
        os.makedirs(uploads_path)
    except Exception as e:
        print(f"Could not create uploads directory: {e}")

# Mount uploads directory to serve static files
# Use /api/uploads prefix to match how the frontend requests images
if uploads_path.exists():
    app.mount("/api/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],  # For production, you could restrict this to your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(router.router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    for error in exc.errors():
        loc = error.get("loc", [])
        if "image" in loc:
            return JSONResponse(
                status_code=400, content={"detail": "You must upload image"}
            )
        if "address" in loc:
            return JSONResponse(
                status_code=400, content={"detail": "Volunteer must enter address"}
            )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.get("/api/health")
def health():
    from os import getenv

    return {
        "status": "ok",
        "database": "configured"
        if getenv("DATABASE_URL")
        else "using fallback (check env vars)",
    }


@app.get("/")
def root():
    return {"message": "Welcome to SafeTracker API"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8500)
