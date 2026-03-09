import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
db_url = os.getenv("DATABASE_URL")
print(f"URL: {db_url}")

engine = create_engine(db_url)
try:
    with engine.connect() as conn:
        res = conn.execute(
            text("SELECT username, password, role FROM users")
        ).fetchall()
        print("Existing Users:")
        for r in res:
            print(f"  User: {r[0]}, Password: {r[1]}, Role: {r[2]}")
except Exception as e:
    print(f"Error: {e}")
