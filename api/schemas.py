from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    username: str
    email: str
    mobile: str
    role: str
    address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    profile_image: Optional[str] = None
    is_approved: bool


class IncidentBase(BaseModel):
    title: str
    full_address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


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
    created_at: Optional[datetime] = None
    reporter_id: int
    volunteer_id: Optional[int] = None
    reporter_name: Optional[str] = None
    volunteer_name: Optional[str] = None
    unread_count: int = 0


class IncidentCreateResponse(BaseModel):
    id: int
    title: str
    full_address: str
    status: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class IncidentStatusResponse(BaseModel):
    id: int
    title: str
    full_address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: Optional[datetime] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class ComplaintResponse(ComplaintCreate):
    id: int
    created_at: datetime


class ChatMessageBase(BaseModel):
    message: str
    incident_id: int
    sender_id: int

    model_config = ConfigDict(from_attributes=True)


class ChatMessageCreate(ChatMessageBase):
    pass


class ChatMessageResponse(ChatMessageBase):
    id: int
    timestamp: datetime
    sender_name: Optional[str] = None
    is_read: bool
