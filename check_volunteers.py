from api.database import SessionLocal
from api.models import User

db = SessionLocal()
volunteers = db.query(User).filter(User.role == "volunteer").all()
print(f"Total volunteers: {len(volunteers)}")
for v in volunteers:
    print(f"ID: {v.id}, Username: {v.username}, Address: {v.address}, Approved: {v.is_approved}")
db.close()
