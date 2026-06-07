from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
from database import get_db, supabase_client
from models import User, Incident, Complaint, ChatMessage
from schemas import IncidentUpdate
import schemas
from passlib.context import CryptContext


pwd_context = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")

def hash_password(password: str):
    safe_password = str(password)[:50]
    return pwd_context.hash(safe_password)

def verify_password(plain_password: str, hashed_password: str):
    safe_password = str(plain_password)[:50]
    return pwd_context.verify(safe_password, hashed_password)


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
        if image.content_type != "application/pdf":
            raise HTTPException(
                status_code=400, detail="Only PDF files are allowed for Aadhar card"
            )

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
        password=hash_password(password),
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
        .filter(User.username == username)
        .first()
    )
    if not user or not verify_password(password, user.password):
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


@router.post("/incidents", response_model=schemas.IncidentResponse)
def create_incident(incident: schemas.IncidentCreate, db: Session = Depends(get_db)):
    payload_data = incident.model_dump()
    print(f"DEBUG BACKEND: POST /incidents triggered. Payload: {payload_data}")
    try:
        # Check if reporter exists
        reporter_id = payload_data.get("reporter_id")
        reporter = db.query(User).filter(User.id == reporter_id).first()
        if not reporter:
             raise HTTPException(status_code=400, detail="Reporter user not found. Please log in again.")

        # Explicitly map fields to avoid any Pydantic/SQLAlchemy mismatch
        new_incident = Incident(
            title=payload_data.get("title"),
            full_address=payload_data.get("full_address"),
            latitude=payload_data.get("latitude"),
            longitude=payload_data.get("longitude"),
            reporter_id=reporter_id,
            status="reported"
        )
        db.add(new_incident)
        db.commit()
        db.refresh(new_incident)
        print(f"DEBUG BACKEND: Incident SAVED. ID: {new_incident.id}, Reporter: {new_incident.reporter_id}, Status: {new_incident.status}")
        
        # Verify immediately if it's visible for this user
        db_count = db.query(Incident).filter(Incident.reporter_id == new_incident.reporter_id).count()
        print(f"DEBUG BACKEND: After save, user {new_incident.reporter_id} now has {db_count} incidents in DB")

        return schemas.IncidentResponse(
            id=new_incident.id,
            title=new_incident.title,
            full_address=new_incident.full_address,
            latitude=new_incident.latitude,
            longitude=new_incident.longitude,
            status=new_incident.status,
            created_at=new_incident.created_at,
            reporter_id=new_incident.reporter_id,
            volunteer_id=new_incident.volunteer_id,
            reporter_name=new_incident.reporter.username if new_incident.reporter else "Unknown",
            volunteer_name="Waiting...",
            volunteer_latitude=None,
            volunteer_longitude=None,
            unread_count=0
        )
    except Exception as e:
        print(f"DEBUG BACKEND ERROR during creation: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


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
    print(f"DEBUG BACKEND: DELETE /incidents/{incident_id} called by user {user_id}")
    # Validate user ownership
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        print(f"DEBUG BACKEND: Incident {incident_id} not found")
        raise HTTPException(status_code=404, detail="Incident not found")

    # Ensure only the reporter can delete
    if incident.reporter_id != user_id:
        print(f"DEBUG BACKEND: Unauthorized delete attempt. Incident reporter: {incident.reporter_id}, requester: {user_id}")
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this incident"
        )

    try:
        db.delete(incident)
        db.commit()
        print(f"DEBUG BACKEND: Incident {incident_id} successfully deleted")
        return {"message": "Incident deleted"}
    except Exception as e:
        db.rollback()
        print(f"DEBUG BACKEND ERROR during deletion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    if incident.volunteer:
        res.volunteer_latitude = incident.volunteer.last_latitude
        res.volunteer_longitude = incident.volunteer.last_longitude
    return res


@router.get("/incidents")
def get_incidents(user_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    try:
        incidents = db.query(Incident).order_by(Incident.created_at.desc()).all()
        print(f"DEBUG: Found {len(incidents)} total incidents in DB")
        
        # If user_id is provided, check if the user is a volunteer
        user_obj = None
        if user_id:
            user_obj = db.query(User).filter(User.id == user_id).first()

        # If user is a volunteer, filter incidents based on nearest 5 matching or ownership
        if user_obj and user_obj.role == "volunteer":
            all_volunteers = db.query(User).filter(
                User.role == "volunteer",
                User.is_approved.is_(True),
                User.last_latitude.isnot(None),
                User.last_longitude.isnot(None)
            ).all()

            from datetime import timedelta
            time_threshold = datetime.utcnow() - timedelta(hours=24)
            
            filtered_incidents = []
            for inc in incidents:
                # If they own the incident, show it (e.g. accepted / in progress / history)
                if inc.volunteer_id == user_id:
                    filtered_incidents.append(inc)
                # If it's reported/pending, check conditions
                elif (inc.status == "reported" or inc.status == "pending") and not inc.volunteer_id:
                    # Skip old unassigned requests (older than 24 hours)
                    if inc.created_at and inc.created_at < time_threshold:
                        continue
                        
                    if inc.latitude is None or inc.longitude is None:
                        # Fallback: if no coords, show to all
                        filtered_incidents.append(inc)
                    elif user_obj.last_latitude is None or user_obj.last_longitude is None:
                        # If volunteer hasn't shared location yet, do NOT show them anything to prevent clutter
                        pass
                    else:
                        # Distance computation
                        vol_distances = []
                        for v in all_volunteers:
                            dist = calculate_distance(inc.latitude, inc.longitude, v.last_latitude, v.last_longitude)
                            vol_distances.append((v.id, dist))
                        
                        vol_distances.sort(key=lambda x: x[1])
                        nearest_ids = [x[0] for x in vol_distances[:5]]
                        
                        # Find the distance of the current user to this incident
                        user_dist = next((dist for vid, dist in vol_distances if vid == user_id), None)
                        
                        # Only show if they are in top 5 AND within 10 km
                        if user_id in nearest_ids and user_dist is not None and user_dist <= 10.0:
                            filtered_incidents.append(inc)
            incidents = filtered_incidents

        response = []
        for inc in incidents:
            try:
                unread_count = 0
                if user_id:
                    try:
                        unread_count = (
                            db.query(ChatMessage)
                            .filter(
                                ChatMessage.incident_id == inc.id,
                                ChatMessage.sender_id != user_id,
                                (ChatMessage.is_read.is_(False)) | (ChatMessage.is_read.is_(None)),
                            )
                            .count()
                        )
                    except Exception as e:
                        print(f"Unread count error: {e}")

                inc_data = schemas.IncidentResponse.model_validate(inc)
                inc_data.reporter_name = (
                    inc.reporter.username if inc.reporter else "Unknown"
                )
                inc_data.volunteer_name = (
                    inc.volunteer.username if inc.volunteer else "Waiting..."
                )
                if inc.volunteer:
                    inc_data.volunteer_latitude = inc.volunteer.last_latitude
                    inc_data.volunteer_longitude = inc.volunteer.last_longitude
                inc_data.unread_count = unread_count
                response.append(inc_data)
            except Exception as inner_e:
                print(
                    f"DEBUG Error processing incident #{getattr(inc, 'id', '?')}: {inner_e}"
                )
        return response
    except Exception as e:
        print(f"DEBUG Error in GET /incidents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/incidents/user/{user_id}", response_model=List[schemas.IncidentResponse])
def get_user_incidents(user_id: int, db: Session = Depends(get_db)):
    print(f"DEBUG BACKEND: Fetching incidents for user_id={user_id} (Type: {type(user_id)})")
    try:
        # Check if user exists
        user_obj = db.query(User).filter(User.id == user_id).first()
        if not user_obj:
            print(f"DEBUG BACKEND: User {user_id} NOT FOUND in database.")
            # Fallback: try filtering directly just in case user table is weirdly indexed
            incidents = db.query(Incident).filter(Incident.reporter_id == user_id).order_by(Incident.created_at.desc()).all()
        else:
            print(f"DEBUG BACKEND: User {user_obj.username} found. Fetching their incidents...")
            incidents = db.query(Incident).filter(Incident.reporter_id == user_id).order_by(Incident.created_at.desc()).all()
        
        print(f"DEBUG BACKEND: Query returned {len(incidents)} incidents for user {user_id}")
        
        response_list = []
        for inc in incidents:
            try:
                unread_count = 0
                try:
                    unread_count = (
                        db.query(ChatMessage)
                        .filter(
                            ChatMessage.incident_id == inc.id,
                            ChatMessage.sender_id != user_id,
                            (ChatMessage.is_read.is_(False)) | (ChatMessage.is_read.is_(None)),
                        )
                        .count()
                    )
                except Exception as e:
                    print(f"Unread count error for inc {inc.id}: {e}")

                # Manual mapping to ensure stability
                inc_data = schemas.IncidentResponse(
                    id=inc.id,
                    title=inc.title,
                    full_address=inc.full_address,
                    latitude=inc.latitude,
                    longitude=inc.longitude,
                    status=inc.status,
                    created_at=inc.created_at,
                    reporter_id=inc.reporter_id,
                    volunteer_id=inc.volunteer_id,
                    reporter_name=inc.reporter.username if inc.reporter else "Unknown",
                    volunteer_name=inc.volunteer.username if inc.volunteer else "Waiting...",
                    volunteer_latitude=inc.volunteer.last_latitude if inc.volunteer else None,
                    volunteer_longitude=inc.volunteer.last_longitude if inc.volunteer else None,
                    unread_count=unread_count
                )
                response_list.append(inc_data)
            except Exception as inner_e:
                print(f"DEBUG BACKEND ERROR processing incident {getattr(inc, 'id', '?')}: {inner_e}")
                
        return response_list
    except Exception as e:
        print(f"DEBUG BACKEND CRITICAL ERROR in GET /incidents/user/{user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/incidents/{incident_id}/accept")
def accept_incident(incident_id: int, volunteer_id: int, db: Session = Depends(get_db)):
    # Check if volunteer exists
    volunteer = db.query(User).filter(User.id == volunteer_id).first()
    if not volunteer:
        print(f"DEBUG BACKEND: volunteer_id {volunteer_id} not found in users table")
        raise HTTPException(
            status_code=400, 
            detail="Volunteer account not found. Your session may have expired or been removed. Please log out and sign up again."
        )

    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.volunteer_id:
        raise HTTPException(status_code=400, detail="Incident already assigned")
    
    try:
        incident.volunteer_id = volunteer_id
        incident.status = "in_progress"
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"DEBUG BACKEND ERROR during accept: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
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


import math
from datetime import datetime

def calculate_distance(lat1: Optional[float], lon1: Optional[float], lat2: Optional[float], lon2: Optional[float]) -> float:
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return float('inf')
    # Haversine Formula
    R = 6371.0  # Earth radius in kilometers
    try:
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat / 2) ** 2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
    except Exception:
        return float('inf')


@router.put("/volunteer/location")
def update_volunteer_location(
    volunteer_id: int = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == volunteer_id).first()
    if not user or user.role != "volunteer":
        raise HTTPException(status_code=400, detail="Invalid volunteer ID")
    
    user.last_latitude = lat
    user.last_longitude = lng
    db.commit()
    return {"message": "Location updated successfully"}


@router.get("/available-incidents", response_model=List[schemas.IncidentResponse])
def get_available_incidents(volunteer_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    # Return only reported incidents for volunteers
    incidents = db.query(Incident).filter(Incident.status == "reported").all()
    
    # If no volunteer_id is supplied, fall back to returning all reported incidents sorted by date
    if not volunteer_id:
        incidents_sorted = sorted(incidents, key=lambda x: x.created_at or datetime.min, reverse=True)
        response = []
        for inc in incidents_sorted:
            inc_data = schemas.IncidentResponse.model_validate(inc)
            inc_data.reporter_name = inc.reporter.username if inc.reporter else "Unknown"
            inc_data.volunteer_name = "Waiting..."
            response.append(inc_data)
        return response
        
    # Get the volunteer
    vol = db.query(User).filter(User.id == volunteer_id).first()
    if not vol:
        raise HTTPException(status_code=404, detail="Volunteer not found")
        
    # Get all active approved volunteers with coordinates to find relative distances
    all_volunteers = db.query(User).filter(
        User.role == "volunteer",
        User.is_approved.is_(True),
        User.last_latitude.isnot(None),
        User.last_longitude.isnot(None)
    ).all()
    
    visible_incidents = []
    
    for inc in incidents:
        # If incident doesn't have coordinates, show it to all volunteers as a fallback
        if inc.latitude is None or inc.longitude is None:
            visible_incidents.append(inc)
            continue
            
        # If this querying volunteer has no coordinates yet, show it (so list is not blank initially)
        if vol.last_latitude is None or vol.last_longitude is None:
            visible_incidents.append(inc)
            continue
            
        # Calculate distance from this incident to all active volunteers
        vol_distances = []
        for v in all_volunteers:
            dist = calculate_distance(inc.latitude, inc.longitude, v.last_latitude, v.last_longitude)
            vol_distances.append((v.id, dist))
            
        # Sort volunteers by distance
        vol_distances.sort(key=lambda x: x[1])
        
        # Get top 5 nearest volunteer IDs
        nearest_ids = [x[0] for x in vol_distances[:5]]
        
        # If the querying volunteer is in the top 5 nearest, show the incident to them
        if vol.id in nearest_ids:
            visible_incidents.append(inc)

    # Sort visible incidents by date (newest first)
    visible_incidents.sort(key=lambda x: x.created_at or datetime.min, reverse=True)
    
    response = []
    for inc in visible_incidents:
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


@router.delete("/admin/complaint/{complaint_id}")
def delete_complaint_admin(complaint_id: int, db: Session = Depends(get_db)):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    db.delete(complaint)
    db.commit()
    return {"message": "Complaint removed successfully"}



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
    # Check if sender exists
    sender = db.query(User).filter(User.id == chat.sender_id).first()
    if not sender:
        raise HTTPException(status_code=400, detail="Sender not found. Please log in again.")

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


@router.put("/incidents/{incident_id}/chat/read")
def mark_chat_as_read(
    incident_id: int, user_id: int = Query(...), db: Session = Depends(get_db)
):
    messages = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.incident_id == incident_id,
            ChatMessage.sender_id != user_id,
            ChatMessage.is_read.is_(False),
        )
        .all()
    )
    for msg in messages:
        msg.is_read = True
    db.commit()
    return {"message": "Messages marked as read"}
