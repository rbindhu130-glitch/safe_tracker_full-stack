from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# PostgreSQL Connection URL from .env (pgAdmin)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise RuntimeError("DATABASE_URL not found in environment variables. Please check your .env file.")

# Mask password for security logs
try:
    if "@" in SQLALCHEMY_DATABASE_URL:
        masked_url = SQLALCHEMY_DATABASE_URL.split("@")[0].rsplit(":", 1)[0] + ":****@" + SQLALCHEMY_DATABASE_URL.split("@")[1]
        print(f"DEBUG: Connecting to Database: {masked_url}")
except Exception:
    print("DEBUG: Database connection configured.")

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
