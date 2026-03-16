
import os
import sys
from pathlib import Path

# Add the root path to sys.path
root_path = Path(__file__).resolve().parent
if str(root_path) not in sys.path:
    sys.path.append(str(root_path))
if str(root_path / "api") not in sys.path:
    sys.path.append(str(root_path / "api"))

from api.database import SessionLocal
from api.models import Incident, User

db = SessionLocal()

# Check user 60
user_id = 60
print(f"--- Checking for User ID: {user_id} ---")

# 1. Total incidents in DB
total_incs = db.query(Incident).count()
print(f"Total incidents in DB: {total_incs}")

# 2. Get all incidents and print their reporter_id
all_incs = db.query(Incident).all()
print("All Incidents IDs and Reporter IDs:")
for inc in all_incs:
    print(f"  Incident ID: {inc.id}, Reporter ID: {inc.reporter_id}, Type: {type(inc.reporter_id)}")

# 3. Test the filter logic
filtered_incs = db.query(Incident).filter(Incident.reporter_id == user_id).all()
print(f"Filtered incidents for user {user_id}: {len(filtered_incs)}")

# 4. Check if we can find by exact ID match
if all_incs:
    test_id = all_incs[0].reporter_id
    print(f"Testing filter with ID {test_id} (from first incident)...")
    res = db.query(Incident).filter(Incident.reporter_id == test_id).all()
    print(f"Found {len(res)} incidents for reporter_id {test_id}")

db.close()
