from api.database import SessionLocal
from api.models import Incident, User
import json

db = SessionLocal()
incidents = db.query(Incident).all()
print(f"Total incidents: {len(incidents)}")
results = []
for inc in incidents:
    reporter = db.query(User).filter(User.id == inc.reporter_id).first()
    results.append({
        "id": inc.id,
        "title": inc.title,
        "status": inc.status,
        "reporter": reporter.username if reporter else "Unknown",
        "address": inc.full_address,
        "volunteer_id": inc.volunteer_id
    })
print(json.dumps(results, indent=2))
db.close()
