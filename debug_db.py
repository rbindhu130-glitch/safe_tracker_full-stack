import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

with engine.begin() as conn:
    # Delete old admin
    conn.execute(text("DELETE FROM users WHERE username = 'admin'"))

    # Insert new admin
    sql = text("""
        INSERT INTO users (username, email, mobile, password, role, is_approved) 
        VALUES (:u, :e, :m, :p, :r, :a)
    """)
    conn.execute(
        sql,
        {
            "u": "admin",
            "e": "admin@safetracker.com",
            "m": "0000000000",
            "p": "admin123",
            "r": "admin",
            "a": True,
        },
    )
    print("Admin inserted.")

with engine.connect() as conn:
    res = conn.execute(text("SELECT username, password FROM users")).fetchall()
    print("Users in DB:")
    for r in res:
        print(f" - {r[0]}: {r[1]}")
