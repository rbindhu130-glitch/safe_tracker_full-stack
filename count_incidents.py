
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
import sys

sys.path.append(os.path.abspath('.'))
sys.path.append(os.path.abspath('./api'))

from api.models import Incident

load_dotenv(dotenv_path='./backend/.env')

engine = create_engine(os.getenv("DATABASE_URL"))
Session = sessionmaker(bind=engine)
session = Session()

reported = session.query(Incident).filter(Incident.status == "reported").all()
print(f"REPORTED INCIDENTS: {len(reported)}")
for inc in reported:
    print(f"  ID: {inc.id}, Title: {inc.title}")

pending = session.query(Incident).filter(Incident.status == "pending").all()
print(f"PENDING INCIDENTS: {len(pending)}")
for inc in pending:
    print(f"  ID: {inc.id}, Title: {inc.title}")
