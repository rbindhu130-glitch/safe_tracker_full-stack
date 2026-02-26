from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from . import models, database, router
import os

# Create database tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="SafeTracker API")

# Ensure uploads directory exists
if not os.path.exists("uploads"):
    os.makedirs("uploads")

# Mount uploads directory to serve static files (using absolute path)
UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# Configure CORS
origins = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5504",
    "http://127.0.0.1:5504",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(router.router)


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
                status_code=400, content={"detail": "Volunteer must address enter"}
            )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.get("/")
def root():
    return {"message": "Welcome to SafeTracker API"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8500)
