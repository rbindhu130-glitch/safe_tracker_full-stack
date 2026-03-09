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

from typing import Dict, List
from fastapi import WebSocket, WebSocketDisconnect
import json


# Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        # Dictionary mapping incident_id to a list of (user_id, websocket)
        self.active_connections: Dict[int, List[tuple]] = {}

    async def connect(self, websocket: WebSocket, incident_id: int, user_id: int):
        await websocket.accept()
        if incident_id not in self.active_connections:
            self.active_connections[incident_id] = []
        self.active_connections[incident_id].append((user_id, websocket))

    def disconnect(self, websocket: WebSocket, incident_id: int):
        if incident_id in self.active_connections:
            self.active_connections[incident_id] = [
                conn
                for conn in self.active_connections[incident_id]
                if conn[1] != websocket
            ]

    async def broadcast(self, message: dict, incident_id: int):
        if incident_id in self.active_connections:
            for _, websocket in self.active_connections[incident_id]:
                await websocket.send_json(message)


manager = ConnectionManager()

app = FastAPI(title="SafeTracker API")


@app.websocket("/ws/chat/{incident_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: int, user_id: int):
    await manager.connect(websocket, incident_id, user_id)
    db = next(database.get_db())
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)

            # Save message to DB
            db_msg = models.ChatMessage(
                incident_id=incident_id,
                sender_id=user_id,
                message=message_data["message"],
            )
            db.add(db_msg)
            db.commit()
            db.refresh(db_msg)

            # Ensure we have the latest sender info
            db.refresh(db_msg)
            sender_name = db_msg.sender.username if db_msg.sender else "Unknown"

            # Broadcast to everyone in this incident
            broadcast_data = {
                "id": db_msg.id,
                "incident_id": int(incident_id),
                "sender_id": int(user_id),
                "sender_name": sender_name,
                "message": db_msg.message,
                "timestamp": db_msg.timestamp.isoformat(),
            }
            await manager.broadcast(broadcast_data, incident_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, incident_id)
    except Exception as e:
        print(f"WS Error: {e}")
        manager.disconnect(websocket, incident_id)
    finally:
        db.close()


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

    uvicorn.run(app, host="0.0.0.0", port=8500)
