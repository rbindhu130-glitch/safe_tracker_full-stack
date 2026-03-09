from api.database import engine
from sqlalchemy import text
import sys

try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        print("Successfully connected to the database!")
except Exception as e:
    print(f"Error connecting to the database: {e}")
    sys.exit(1)
