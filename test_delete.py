from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env
env_path = Path("c:/project_rework/backend/.env")
load_dotenv(dotenv_path=env_path)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def test_delete(incident_id, user_id):
    db = SessionLocal()
    try:
        print(f"Attempting to delete incident {incident_id} as user {user_id}")
        incident = db.execute(text("SELECT * FROM incidents WHERE id = :id"), {"id": incident_id}).fetchone()
        if not incident:
            print("Incident not found")
            return
        
        print(f"Incident found: {incident}")
        print(f"Incident reporter_id: {incident.reporter_id}")
        
        if incident.reporter_id != user_id:
            print(f"Unauthorized: {incident.reporter_id} != {user_id}")
            return

        # Check for messages
        msg_count = db.execute(text("SELECT COUNT(*) FROM chat_messages WHERE incident_id = :id"), {"id": incident_id}).scalar()
        print(f"Message count: {msg_count}")

        # Try delete
        db.execute(text("DELETE FROM chat_messages WHERE incident_id = :id"), {"id": incident_id})
        db.execute(text("DELETE FROM incidents WHERE id = :id"), {"id": incident_id})
        db.commit()
        print("Delete successful")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Test deleting incident 11 for user 29
    test_delete(11, 29)
