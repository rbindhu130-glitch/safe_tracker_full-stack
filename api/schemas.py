from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    username: str
    email: str
    mobile: str
    role: str


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    profile_image: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    emergency_contact_email: Optional[str] = None


class IncidentBase(BaseModel):
    title: str
    full_address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class IncidentCreate(IncidentBase):
    reporter_id: int


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    full_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class IncidentResponse(IncidentBase):
    id: int
    status: str
    created_at: datetime
    reporter_id: int
    volunteer_id: Optional[int] = None
    reporter_name: Optional[str] = None
    volunteer_name: Optional[str] = None

    class Config:
        from_attributes = True


class IncidentCreateResponse(BaseModel):
    title: str
    full_address: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentStatusResponse(BaseModel):
    title: str
    full_address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime
    status: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class ComplaintCreate(BaseModel):
    name: str
    email: str
    subject: str
    message: str


class ComplaintResponse(ComplaintCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
