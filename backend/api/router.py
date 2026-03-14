from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
from api.database import get_db, supabase_client
from api.models import User, Incident, Complaint, ChatMessage
from api.schemas import IncidentUpdate
from api import schemas


router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/signup")
def signup(
    username: str = Form(...),
    Mobile: str = Form(...),
    email: str = Form(...),
    role: str = Form(...),
    password: str = Form(...),
    image: Optional[UploadFile] = File(None),
    address: str = Form(None),
    db: Session = Depends(get_db),
):
    is_file = image is not None and hasattr(image, "filename") and image.filename != ""

    if role == "volunteer":
        if not is_file and (not address or address.strip() == ""):
            raise HTTPException(
                status_code=400, detail="Volunteer must upload image and enter address"
            )
        if not is_file:
            raise HTTPException(status_code=400, detail="Volunteer must upload image")
        if not address or address.strip() == "":
            raise HTTPException(status_code=400, detail="Volunteer must enter address")

    if role == "user":
        if is_file:
            raise HTTPException(status_code=400, detail="User should not upload image")
        if address:
            raise HTTPException(
                status_code=400, detail="User should not provide address"
            )

    image_path = None

    if role == "volunteer" and is_file:
        # PRO-LEVEL: Clean the filename
        original_name = image.filename
        clean_name = "".join(
            c if c.isalnum() or c in "._-" else "_" for c in original_name
        )
        file_name = f"profile_{email}_{clean_name}"

        if supabase_client:
            # Upload to Supabase Storage
            try:
                # Ensure we are at the start of the file
                image.file.seek(0)
                file_content = image.file.read()
                
                # Upload to 'safetracker' bucket
                supabase_client.storage.from_("safetracker").upload(
                    path=file_name,
                    file=file_content,
                    file_options={"content-type": image.content_type, "upsert": "true"},
                )
                
                # Get public URL
                image_path = supabase_client.storage.from_(
                    "safetracker"
                ).get_public_url(file_name)
                
            except Exception as e:
                print(f"Supabase upload error: {e}")
                # ONLY fallback to local if NOT on Vercel
                if os.environ.get("VERCEL"):
                    raise HTTPException(
                        status_code=500, 
                        detail=f"Deployment Storage Error: Could not upload to Supabase. Reason: {str(e)}"
                    )
                
                # Local dev fallback
                try:
                    os.makedirs("uploads", exist_ok=True)
                    image_path = f"uploads/{clean_name}"
                    with open(image_path, "wb") as buffer:
                        image.file.seek(0)
                        shutil.copyfileobj(image.file, buffer)
                except Exception as local_e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Local Storage Error: {str(local_e)}"
                    )
        else:
            # No Supabase configured
            if os.environ.get("VERCEL"):
                 raise HTTPException(status_code=500, detail="Cloud Storage (Supabase) not configured on Vercel.")
            
            os.makedirs("uploads", exist_ok=True)
            image_path = f"uploads/{clean_name}"
            with open(image_path, "wb") as buffer:
                image.file.seek(0)
                shutil.copyfileobj(image.file, buffer)

    from sqlalchemy.exc import IntegrityError

    user = User(
        username=username,
        mobile=Mobile,
        email=email,
        role=role,
        password=password,
        profile_image=image_path,
        address=address,
        is_approved=(role != "volunteer"),  # Volunteers need admin approval
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already exists")
    except Exception as e:
        db.rollback()
        print(f"DEBUG Signup Error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

    return {
        "message": "Signup successful",
        "user_id": user.id,
        "role": user.role,
        "user": schemas.UserResponse.model_validate(user),
    }


@router.put("/users/{user_id}")
def update_user(
    user_id: int, user_update: schemas.UserUpdate, db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_update.emergency_contact_email is not None:
        user.emergency_contact_email = user_update.emergency_contact_email

    db.commit()
    db.refresh(user)
    return {"message": "User updated successfully"}


@router.post("/login")
def login(
    username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)
):
    # HARDCODED SUPERADMIN LOGIN
    if username == "superadmin" and password == "admin123":
        return {
            "message": "Login successful",
            "user": {
                "id": 0,
                "username": "superadmin",
                "email": "superadmin@safetracker.com",
                "mobile": "0000000000",
                "role": "admin",
                "address": "System",
                "is_approved": True,
                "profile_image": None
            },
        }

    user = (
        db.query(User)
        .filter(User.username == username, User.password == password)
        .first()
    )
    if not user:
        raise HTTPException(status_code=400, detail="User or volunteer not found. Please sign up first.")

    # Prevent accidental admin role from database if not using superadmin credentials
    if user.role == "admin" and (username != "superadmin" or password != "admin123"):
        raise HTTPException(status_code=400, detail="Invalid admin credentials")

    if user.role == "volunteer" and not user.is_approved:
        raise HTTPException(
            status_code=403,
            detail="Your account is pending admin approval. Please check back later.",
        )

    return {
        "message": "Login successful",
        "user": schemas.UserResponse.model_validate(user),
    }


# --- Incidents ---


@router.post("/incidents", response_model=schemas.IncidentCreateResponse)
def create_incident(incident: schemas.IncidentCreate, db: Session = Depends(get_db)):
    new_incident = Incident(**incident.model_dump())
    db.add(new_incident)
    db.commit()
    db.refresh(new_incident)

    return new_incident


@router.get("/incident/me/{incident_id}", response_model=schemas.IncidentStatusResponse)
def get_incident_status(incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.delete("/incidents/{incident_id}")
def delete_incident(
    incident_id: int, user_id: int = Query(...), db: Session = Depends(get_db)
):
    # Validate user ownership
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Ensure only the reporter can delete
    if incident.reporter_id != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this incident"
        )

    db.delete(incident)
    db.commit()
    return {"message": "Incident deleted"}


@router.put("/incidents/{incident_id}", response_model=schemas.IncidentResponse)
def update_incident(
    incident_id: int,
    incident_update: IncidentUpdate,
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.reporter_id != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to update this incident"
        )

    if incident_update.title:
        incident.title = incident_update.title
    if incident_update.full_address:
        incident.full_address = incident_update.full_address
    if incident_update.latitude is not None:
        incident.latitude = incident_update.latitude
    if incident_update.longitude is not None:
        incident.longitude = incident_update.longitude

    db.commit()
    db.refresh(incident)

    # Manual mapping for response model
    res = schemas.IncidentResponse.model_validate(incident)
    res.reporter_name = incident.reporter.username if incident.reporter else "Unknown"
    res.volunteer_name = (
        incident.volunteer.username if incident.volunteer else "Waiting..."
    )
    return res


@router.get("/incidents")
def get_incidents(db: Session = Depends(get_db)):
    try:
        incidents = db.query(Incident).all()
        response = []
        for inc in incidents:
            try:
                inc_data = schemas.IncidentResponse.model_validate(inc)
                inc_data.reporter_name = (
                    inc.reporter.username if inc.reporter else "Unknown"
                )
                inc_data.volunteer_name = (
                    inc.volunteer.username if inc.volunteer else "Waiting..."
                )
                response.append(inc_data)
            except Exception as inner_e:
                print(
                    f"DEBUG Error processing incident #{getattr(inc, 'id', '?')}: {inner_e}"
                )
        return response
    except Exception as e:
        print(f"DEBUG Error in GET /incidents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/incidents/user/{user_id}")
def get_user_incidents(user_id: int, db: Session = Depends(get_db)):
    try:
        incidents = db.query(Incident).filter(Incident.reporter_id == user_id).all()
        response = []
        for inc in incidents:
            try:
                inc_data = schemas.IncidentResponse.model_validate(inc)
                inc_data.reporter_name = (
                    inc.reporter.username if inc.reporter else "Unknown"
                )
                inc_data.volunteer_name = (
                    inc.volunteer.username if inc.volunteer else "Waiting..."
                )
                response.append(inc_data)
            except Exception as inner_e:
                print(
                    f"DEBUG Error processing user incident #{getattr(inc, 'id', '?')}: {inner_e}"
                )
        return response
    except Exception as e:
        print(f"DEBUG Error in GET /incidents/user/{user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/incidents/{incident_id}/accept")
def accept_incident(incident_id: int, volunteer_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.volunteer_id:
        raise HTTPException(status_code=400, detail="Incident already assigned")
    incident.volunteer_id = volunteer_id
    incident.status = "in_progress"
    db.commit()
    return {"message": "Incident accepted and started"}


@router.put("/incidents/{incident_id}/start")
def start_incident(incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.status = "in_progress"
    db.commit()
    return {"message": "Incident started"}


@router.put("/incidents/{incident_id}/live-location")
def update_live_location(
    incident_id: int, lat: float, lng: float, db: Session = Depends(get_db)
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.latitude = lat
    incident.longitude = lng
    db.commit()
    return {"message": "Live location updated", "lat": lat, "lng": lng}


@router.put("/incidents/{incident_id}/complete")
def complete_incident(incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Change status to 'awaiting_confirmation'
    incident.status = "awaiting_confirmation"
    db.commit()

    return {"message": "Incident marked as completed, awaiting user confirmation"}


@router.put("/incidents/{incident_id}/confirm")
def confirm_incident(incident_id: int, confirmed: bool, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if confirmed:
        incident.status = "closed"
    else:
        # Re-open and reassign (effectively clearing volunteer)
        incident.status = "pending"
        incident.volunteer_id = None

    db.commit()
    return {"message": "Response recorded", "status": incident.status}


# Removed verify_incident_email endpoint as it is unused without SMTP configuration.


@router.get("/available-incidents", response_model=List[schemas.IncidentResponse])
def get_available_incidents(db: Session = Depends(get_db)):
    # Return only reported incidents for volunteers
    incidents = db.query(Incident).filter(Incident.status == "reported").all()
    response = []
    for inc in incidents:
        inc_data = schemas.IncidentResponse.model_validate(inc)
        inc_data.reporter_name = inc.reporter.username if inc.reporter else "Unknown"
        inc_data.volunteer_name = "Waiting..."
        response.append(inc_data)
    return response


# --- Admin Endpoints ---


@router.get("/users-raw")
def get_all_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.delete("/admin/user/{user_id}")
def delete_user_admin(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Optional: Delete associated incidents or set them to null
    db.query(Incident).filter(Incident.reporter_id == user_id).delete()
    db.query(Incident).filter(Incident.volunteer_id == user_id).update(
        {"volunteer_id": None, "status": "reported"}
    )

    db.delete(user)
    db.commit()
    return {"message": "User and their data removed successfully"}


@router.put("/admin/approve/{user_id}")
def approve_volunteer(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != "volunteer":
        raise HTTPException(status_code=400, detail="Only volunteers need approval")

    user.is_approved = True
    db.commit()
    return {"message": f"Volunteer {user.username} approved successfully"}


# --- Complaints/Contact Form ---


@router.post("/complaints", response_model=schemas.ComplaintResponse)
def create_complaint(complaint: schemas.ComplaintCreate, db: Session = Depends(get_db)):
    new_complaint = Complaint(**complaint.model_dump())
    db.add(new_complaint)
    db.commit()
    db.refresh(new_complaint)
    return new_complaint


@router.get("/complaints", response_model=List[schemas.ComplaintResponse])
def get_complaints(db: Session = Depends(get_db)):
    return db.query(Complaint).order_by(Complaint.created_at.desc()).all()


# --- Profile Management ---


@router.put("/profile/update", response_model=schemas.UserResponse)
def update_profile(
    username: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    mobile: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    user_id: int = Form(...),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if username:
        # Check if username is already taken by another user
        existing_username = (
            db.query(User).filter(User.username == username, User.id != user_id).first()
        )
        if existing_username:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = username
    if email:
        # Optional: Check if email is already taken by another user
        existing_user = (
            db.query(User).filter(User.email == email, User.id != user_id).first()
        )
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = email
    if mobile:
        user.mobile = mobile
    if address:
        user.address = address

    if image and image.filename:
        original_name = image.filename
        clean_name = "".join(
            c if c.isalnum() or c in "._-" else "_" for c in original_name
        )
        file_name = f"profile_{user_id}_{clean_name}"

        if supabase_client:
            try:
                file_content = image.file.read()
                supabase_client.storage.from_("safetracker").upload(
                    path=file_name,
                    file=file_content,
                    file_options={"content-type": image.content_type, "upsert": "true"},
                )
                user.profile_image = supabase_client.storage.from_(
                    "safetracker"
                ).get_public_url(file_name)
            except Exception as e:
                print(f"Update profile image error: {e}")
                # Fallback
                os.makedirs("uploads", exist_ok=True)
                file_path = f"uploads/profile_{user_id}_{clean_name}"
                with open(file_path, "wb") as buffer:
                    image.file.seek(0)
                    shutil.copyfileobj(image.file, buffer)
                user.profile_image = file_path
        else:
            os.makedirs("uploads", exist_ok=True)
            file_path = f"uploads/profile_{user_id}_{clean_name}"
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            user.profile_image = file_path

    db.commit()
    db.refresh(user)
    return user


@router.get(
    "/incidents/{incident_id}/chat", response_model=List[schemas.ChatMessageResponse]
)
def get_chat_messages(incident_id: int, db: Session = Depends(get_db)):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.incident_id == incident_id)
        .order_by(ChatMessage.timestamp.asc())
        .all()
    )

    response = []
    for msg in messages:
        m_data = schemas.ChatMessageResponse.model_validate(msg)
        m_data.sender_name = msg.sender.username if msg.sender else "Unknown"
        response.append(m_data)
    return response


@router.post(
    "/incidents/{incident_id}/chat", response_model=schemas.ChatMessageResponse
)
def post_chat_message(
    incident_id: int, chat: schemas.ChatMessageCreate, db: Session = Depends(get_db)
):
    db_msg = ChatMessage(
        incident_id=incident_id,
        sender_id=chat.sender_id,
        message=chat.message,
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)

    m_data = schemas.ChatMessageResponse.model_validate(db_msg)
    m_data.sender_name = db_msg.sender.username if db_msg.sender else "Unknown"
    return m_data
