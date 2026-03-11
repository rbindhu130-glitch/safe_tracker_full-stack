from api.database import SessionLocal
from api.models import Incident, User

db = SessionLocal()
incidents = db.query(Incident).all()
print(f"Total incidents: {len(incidents)}")
for inc in incidents:
    reporter = db.query(User).filter(User.id == inc.reporter_id).first()
    print(f"ID: {inc.id}, Title: {inc.title}, Status: {inc.status}, Reporter: {reporter.username if reporter else 'Unknown'}, Address: {inc.full_address}")
db.close()
