from backend.database import engine
from sqlalchemy import text


def add_column():
    with engine.connect() as conn:
        try:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN emergency_contact_email VARCHAR")
            )
            print("Column added successfully.")
        except Exception as e:
            print(f"Error (maybe column exists): {e}")


if __name__ == "__main__":
    add_column()
