from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Update these details with your PostgreSQL credentials from pgAdmin
# Format: "postgresql://username:password@localhost:port/database_name"
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safetracker.db")
# Mask password for security
if SQLALCHEMY_DATABASE_URL:
    try:
        # Mask the password: postgres://user:password@host... -> postgres://user:***@host...
        parts = SQLALCHEMY_DATABASE_URL.split("@")
        if len(parts) > 1:
            prefix = parts[0]
            host_info = parts[1]
            if ":" in prefix:
                user_part = prefix.split(":")[0] + ":" + prefix.split(":")[1]
                # Replace password after the first colon if exists
                if prefix.count(":") >= 2:  # handle cases like scheme://user:pass
                    user_part = prefix.rsplit(":", 1)[0]
                elif prefix.startswith("postgresql://") or prefix.startswith(
                    "postgres://"
                ):
                    user_part = (
                        prefix.split("://")[0]
                        + "://"
                        + prefix.split("://")[1].split(":")[0]
                    )

                print(f"DEBUG: Using DB (masked): {user_part}:****@{host_info}")
            else:
                print(f"DEBUG: Using DB: {SQLALCHEMY_DATABASE_URL}")
        else:
            print("DEBUG: Using DB URL (hidden)")
    except Exception:
        print("DEBUG: Database URL configured")


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
