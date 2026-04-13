from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Load .env from backend/ folder — works regardless of where server is started from
env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=env_path)

# PostgreSQL Connection URL from .env (pgAdmin)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# --- SUPABASE FIX ---
# 1. Fix 'postgres://' to 'postgresql://' (SQLAlchemy 2.0 requirement)
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 2. If using Supabase Pooler (port 6543), username MUST be 'postgres.[PROJECT_REF]'
if SQLALCHEMY_DATABASE_URL and "pooler.supabase.com" in SQLALCHEMY_DATABASE_URL:
    # Try multiple ways to get the PROJECT_REF
    project_ref = os.getenv("SUPABASE_PROJECT_REF")
    
    if not project_ref:
        supabase_url = os.getenv("SUPABASE_URL")
        if supabase_url:
            try:
                # Extract ref from https://ref.supabase.co
                project_ref = supabase_url.split("//")[-1].split(".")[0]
            except Exception: pass

    if project_ref:
        # Check if username already has the ref
        if f"postgres.{project_ref}" not in SQLALCHEMY_DATABASE_URL:
            # We need to replace the username 'postgres' with 'postgres.[ref]'
            # The replacement targets '://postgres:' to catch it in the authority part
            if "://postgres:" in SQLALCHEMY_DATABASE_URL:
                SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("://postgres:", f"://postgres.{project_ref}:")
                print(f"AUTO-FIX: Added project ref '{project_ref}' to DATABASE_URL.")
            elif "@" in SQLALCHEMY_DATABASE_URL:
                 # Alternative check if password-less or something weird
                 parts = SQLALCHEMY_DATABASE_URL.split("@")
                 if parts[0].endswith("postgres"):
                      SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres@", f"postgres.{project_ref}@")
                      print(f"AUTO-FIX (Alt): Added project ref '{project_ref}' to DATABASE_URL.")
    else:
        print("WARNING: Using Supabase Pooler but SUPABASE_URL or SUPABASE_PROJECT_REF is missing. Connection will likely fail.")
# --------------------

if not SQLALCHEMY_DATABASE_URL:
    print("WARNING: DATABASE_URL not found. System will fail on DB access.")
    # Use a dummy URL to allow the app to start and report errors via middleware
    SQLALCHEMY_DATABASE_URL = "postgresql://user:pass@localhost/dummy"

print(f"DEBUG: Using DATABASE_URL (redacted): {SQLALCHEMY_DATABASE_URL.split('@')[-1] if '@' in SQLALCHEMY_DATABASE_URL else 'None'}")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Supabase Storage Client


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
