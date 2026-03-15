import os
import sys
import json
import traceback
from pathlib import Path
from typing import Dict, List
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# Add the root path to sys.path to find models, database, etc.
is_vercel = os.environ.get("VERCEL") == "1"
root_path = Path(__file__).resolve().parent
if str(root_path) not in sys.path:
    sys.path.append(str(root_path))

import models
import database
import router

# Create database tables
try:
    models.Base.metadata.create_all(bind=database.engine)
except Exception as e:
    print(f"Database creation skipped or failed: {e}")

# Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[tuple]] = {}

    async def connect(self, websocket: WebSocket, incident_id: int, user_id: int):
        await websocket.accept()
        if incident_id not in self.active_connections:
            self.active_connections[incident_id] = []
        self.active_connections[incident_id].append((user_id, websocket))

    def disconnect(self, websocket: WebSocket, incident_id: int):
        if incident_id in self.active_connections:
            self.active_connections[incident_id] = [
                conn for conn in self.active_connections[incident_id]
                if conn[1] != websocket
            ]

    async def broadcast(self, message: dict, incident_id: int):
        if incident_id in self.active_connections:
            for _, websocket in self.active_connections[incident_id]:
                await websocket.send_json(message)

manager = ConnectionManager()

app = FastAPI(title="SafeTracker API")

@app.get("/api/health")
async def health_check(db: Session = Depends(database.get_db)):
    db_status = "Unknown"
    missing_vars = []
    
    if not os.getenv("DATABASE_URL"):
        missing_vars.append("DATABASE_URL")
    if not os.getenv("SUPABASE_URL"):
        missing_vars.append("SUPABASE_URL")
    if not os.getenv("SUPABASE_KEY"):
        missing_vars.append("SUPABASE_KEY")
        
    try:
        db.execute(text("SELECT 1"))
        db_status = "Connected"
    except Exception as e:
        db_status = f"Error: {str(e)}"
        
    storage_status = "Skipped"
    if database.supabase_client:
        try:
            database.supabase_client.storage.get_bucket("safetracker")
            storage_status = "Connected"
        except Exception as e:
            storage_status = f"Error: {str(e)}"

    return {
        "status": "online",
        "database": db_status,
        "storage": storage_status,
        "is_vercel": os.environ.get("VERCEL") == "1"
    }

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_details = traceback.format_exc()
    print(f"GLOBAL ERROR: {error_details}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Internal Server Error: {str(exc)}",
            "traceback": error_details,
        },
    )

@app.middleware("http")
async def log_requests(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        error_details = traceback.format_exc()
        print(f"Middleware Error: {error_details}")
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"Internal Server Error: {str(e)}",
                "traceback": error_details
            }
        )

@app.websocket("/ws/chat/{incident_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: int, user_id: int):
    print(f"WS Connect attempt: incident={incident_id}, user={user_id}", flush=True)
    db = database.SessionLocal()
    try:
        await manager.connect(websocket, int(incident_id), int(user_id))
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            db_msg = models.ChatMessage(
                incident_id=incident_id,
                sender_id=user_id,
                message=message_data["message"],
            )
            db.add(db_msg)
            db.commit()
            db.refresh(db_msg)
            
            sender_name = db_msg.sender.username if db_msg.sender else "Unknown"
            
            broadcast_data = {
                "id": db_msg.id,
                "incident_id": int(incident_id),
                "sender_id": int(user_id),
                "sender_name": sender_name,
                "message": db_msg.message,
                "timestamp": db_msg.timestamp.isoformat(),
                "is_read": db_msg.is_read,
            }
            await manager.broadcast(broadcast_data, incident_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, incident_id)
    except Exception as e:
        print(f"WS Error: {traceback.format_exc()}")
        manager.disconnect(websocket, incident_id)
    finally:
        db.close()

# Static files setup (Skip on Vercel as it is read-only)
if not is_vercel:
    uploads_path = root_path / "uploads"
    if not uploads_path.exists():
        try:
            os.makedirs(uploads_path)
        except Exception as e:
            print(f"Could not create uploads directory: {e}")
    
    if uploads_path.exists():
        app.mount("/api/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

    # Serve the frontend directory
    frontend_path = root_path.parent / "frontend"
    if frontend_path.exists():
        app.mount("/frontend", StaticFiles(directory=str(frontend_path)), name="frontend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8500)
