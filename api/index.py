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

# Project root path setup
is_vercel = os.environ.get("VERCEL") == "1"
root_path = Path(__file__).resolve().parent

if str(root_path) not in sys.path:
    sys.path.append(str(root_path))

# Import project modules using absolute paths for Vercel reliability
try:
    import models
    import database
    import router
    print("DEBUG: Project modules imported successfully")
except ImportError as e:
    print(f"CRITICAL ERROR: Failed to import project modules: {e}")
    print(f"PYTHONPATH: {sys.path}")
    raise

# Database tables create
# Run this ONLY if configured, to avoid blocking startup if DB is down
try:
    if os.environ.get("DATABASE_URL"):
        print("DEBUG: Attempting database migration/init...")
        models.Base.metadata.create_all(bind=database.engine)

        # Manual database migration (new columns add panna)
        with database.engine.connect() as conn:

            # users table la is_approved column iruka nu check
            res = conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='is_approved'"
            ))
            if not res.fetchone():
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN is_approved BOOLEAN DEFAULT TRUE"
                ))
                conn.commit()

            # chat_messages table la is_read column check
            res3 = conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='is_read'"
            ))
            if not res3.fetchone():
                conn.execute(text(
                    "ALTER TABLE chat_messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE"
                ))
                conn.commit()
        print("DEBUG: Database migration/init completed")
    else:
        print("DEBUG: Skipping DB init - DATABASE_URL not set")

except Exception as e:
    print(f"Database creation/migration skipped or failed: {e}")
    # Don't raise here, allow the app to start so we can see errors in /api/health


# WebSocket connection manager (chat users manage panna)
class ConnectionManager:

    def __init__(self):
        # incident_id based ah users store pannum
        self.active_connections: Dict[int, List[tuple]] = {}

    async def connect(self, websocket: WebSocket, incident_id: int, user_id: int):
        # user connect aana websocket accept pannum
        await websocket.accept()

        if incident_id not in self.active_connections:
            self.active_connections[incident_id] = []

        # user connection store pannum
        self.active_connections[incident_id].append((user_id, websocket))

    def disconnect(self, websocket: WebSocket, incident_id: int):

        if incident_id in self.active_connections:
            # disconnected user remove pannum
            self.active_connections[incident_id] = [
                conn for conn in self.active_connections[incident_id]
                if conn[1] != websocket
            ]

    async def broadcast(self, message: dict, incident_id: int):

        if incident_id in self.active_connections:

            # incident chat la iruka ellarukum message send pannum
            for _, websocket in self.active_connections[incident_id]:
                await websocket.send_json(message)


# Manager object create
manager = ConnectionManager()

# FastAPI app create
app = FastAPI(title="SafeTracker API")


# Health check API (server working ah nu check panna)
@app.get("/api/health")
async def health_check(db: Session = Depends(database.get_db)):

    db_status = "Unknown"
    db_info = "None"

    try:
        # Check if we can reach the DB
        db.execute(text("SELECT 1"))
        db_status = "Connected"
    except Exception as e:
        db_status = f"Error: {str(e)}"
        
    try:
        # Get masked URL info for debugging
        url = database.SQLALCHEMY_DATABASE_URL
        if url:
             # Mask password: postgresql://user:****@host:port/db
             parts = url.split("://")
             auth_part = parts[1].split("@")[0]
             user = auth_part.split(":")[0]
             host = parts[1].split("@")[1]
             db_info = f"{parts[0]}://{user}:****@{host}"
    except Exception:
        db_info = "Could not parse URL"

    return {
        "status": "online",
        "database": db_status,
        "database_url_info": db_info,
        "is_vercel": os.environ.get("VERCEL") == "1",
        "timestamp": datetime.now().isoformat()
    }


# Global error handler
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


# WebSocket chat API
@app.websocket("/ws/chat/{incident_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: int, user_id: int):

    db = database.SessionLocal()

    try:
        # user connect
        await manager.connect(websocket, int(incident_id), int(user_id))

        while True:

            # message receive pannum
            data = await websocket.receive_text()

            message_data = json.loads(data)

            # database la message save pannum
            db_msg = models.ChatMessage(
                incident_id=incident_id,
                sender_id=user_id,
                message=message_data["message"],
            )

            db.add(db_msg)
            db.commit()
            db.refresh(db_msg)

            # sender name
            sender_name = db_msg.sender.username if db_msg.sender else "Unknown"

            # frontend ku send panna data
            broadcast_data = {
                "id": db_msg.id,
                "incident_id": int(incident_id),
                "sender_id": int(user_id),
                "sender_name": sender_name,
                "message": db_msg.message,
                "timestamp": db_msg.timestamp.isoformat(),
                "is_read": db_msg.is_read,
            }

            # chat users ellarukum broadcast pannum
            await manager.broadcast(broadcast_data, incident_id)

    except WebSocketDisconnect:
        manager.disconnect(websocket, incident_id)

    except Exception as e:
        print(f"WS Error: {traceback.format_exc()}")
        manager.disconnect(websocket, incident_id)

    finally:
        db.close()


# Static files setup (uploads folder)
if not is_vercel:

    uploads_path = root_path / "uploads"

    if not uploads_path.exists():
        os.makedirs(uploads_path)

    app.mount("/api/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

    # frontend folder serve panna
    frontend_path = root_path.parent / "frontend"

    if frontend_path.exists():
        app.mount("/frontend", StaticFiles(directory=str(frontend_path)), name="frontend")


# CORS setup (frontend connect panna allow pannum)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router include
app.include_router(router.router, prefix="/api")


# Run server
if __name__ == "__main__":

    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8500)