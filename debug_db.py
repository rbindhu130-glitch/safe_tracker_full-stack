from sqlalchemy import create_engine, text
import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path("c:/project_rework/backend/.env")
load_dotenv(dotenv_path=env_path)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(SQLALCHEMY_DATABASE_URL)

with engine.connect() as conn:
    print("\n=== USERS ===")
    users = conn.execute(text("SELECT id, username, role FROM users ORDER BY id")).fetchall()
    for u in users:
        print(f"ID: {u[0]} | Name: {u[1]} | Role: {u[2]}")
    
    print("\n=== INCIDENTS ===")
    incidents = conn.execute(text("SELECT id, title, status, reporter_id FROM incidents ORDER BY id")).fetchall()
    for i in incidents:
        print(f"ID: {i[0]} | Title: {i[1]} | Status: {i[2]} | ReporterID: {i[3]}")
    
    print("\n=== CHAT MESSAGE COUNTS ===")
    msg_counts = conn.execute(text("SELECT incident_id, COUNT(*) FROM chat_messages GROUP BY incident_id")).fetchall()
    for m in msg_counts:
        print(f"IncidentID: {m[0]} | MsgCount: {m[1]}")
