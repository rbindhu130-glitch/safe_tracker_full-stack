from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
import sys

# Add the project root to sys.path to find the api module
sys.path.append(os.path.abspath('.'))
sys.path.append(os.path.abspath('./api'))

from api.models import Incident, User

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"))
Session = sessionmaker(bind=engine)
session = Session()

print("--- INCIDENTS ---")
incidents = session.query(Incident).all()
for inc in incidents:
    print(f"ID: {inc.id}, Title: {inc.title}, Status: {inc.status}, Reporter: {inc.reporter_id}, Volunteer: {inc.volunteer_id}, Address: {inc.full_address}")

print("\n--- USERS (Volunteers) ---")
volunteers = session.query(User).filter(User.role == "volunteer").all()
for vol in volunteers:
    print(f"ID: {vol.id}, Username: {vol.username}, Address: {vol.address}, Approved: {vol.is_approved}")
