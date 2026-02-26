from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    mobile = Column(String)
    password = Column(String)
    role = Column(String)  # 'user' or 'volunteer'
    profile_image = Column(String, nullable=True)
    address = Column(String, nullable=True)
    emergency_contact_email = Column(String, nullable=True)
    is_approved = Column(
        Boolean, default=True
    )  # Default True for users, will set to False for volunteers in signup logic
    incidents_reported = relationship(
        "Incident", back_populates="reporter", foreign_keys="Incident.reporter_id"
    )
    incidents_accepted = relationship(
        "Incident", back_populates="volunteer", foreign_keys="Incident.volunteer_id"
    )


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    full_address = Column(String)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(
        String, default="reported"
    )  # 'reported', 'accepted', 'in_progress', 'awaiting_confirmation', 'closed'
    created_at = Column(DateTime, default=datetime.utcnow)

    reporter_id = Column(Integer, ForeignKey("users.id"))
    volunteer_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    reporter = relationship(
        "User", back_populates="incidents_reported", foreign_keys=[reporter_id]
    )
    volunteer = relationship(
        "User", back_populates="incidents_accepted", foreign_keys=[volunteer_id]
    )


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String)
    subject = Column(String)
    message = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
