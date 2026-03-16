
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
import sys

sys.path.append(os.path.abspath('.'))
sys.path.append(os.path.abspath('./api'))

from api.models import Incident, User

load_dotenv(dotenv_path='./backend/.env')

engine = create_engine(os.getenv("DATABASE_URL"))
Session = sessionmaker(bind=engine)
session = Session()

print("--- ALL INCIDENTS ---")
incidents = session.query(Incident).all()
for inc in incidents:
    reporter_name = inc.reporter.username if inc.reporter else "Unknown"
    print(f"ID: {inc.id}, Title: {inc.title}, Status: {inc.status}, ReporterID: {inc.reporter_id}, ReporterName: {reporter_name}")

print("\n--- ALL USERS ---")
users = session.query(User).all()
for u in users:
    print(f"ID: {u.id}, Username: {u.username}, Role: {u.role}")
