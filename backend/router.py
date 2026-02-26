from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
from .database import get_db
from .models import User, Incident, Complaint
from .schemas import IncidentUpdate
from . import schemas
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def send_completion_email(
    to_email: str,
    incident_title: str,
    volunteer_email: str,
    volunteer_name: str,
    incident_id: int,
):
    print(
        f"Preparing email - From Volunteer: {volunteer_email} ({volunteer_name}) -> To User: {to_email}"
    )

    # CONFIGURATION: The email account that physically sends the email
    smtp_server = "smtp.gmail.com"
    smtp_port = 587
    system_email = os.getenv("SMTP_EMAIL")
    system_password = os.getenv("SMTP_PASSWORD")

    subject = f"SafeTracker: Incident Completed '{incident_title}'"

    # HTML Body with Links
    base_url = "http://127.0.0.1:8500"
    yes_link = f"{base_url}/users/incidents/{incident_id}/verify?choice=yes"
    no_link = f"{base_url}/users/incidents/{incident_id}/verify?choice=no"

    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #333;">Incident Completion Confirmation</h2>
        <p>Hello,</p>
        <p>The volunteer <b>{volunteer_name}</b> ({volunteer_email}) has marked your incident '<b>{incident_title}</b>' as COMPLETED.</p>
        <p>Please confirm if the request has been fulfilled:</p>
        <div style="margin: 20px 0;">
            <a href="{yes_link}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">YES (Close Request)</a>
            <a href="{no_link}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">NO (Not Done)</a>
        </div>
        <p>If you select NO, the request will remain awaiting confirmation.</p>
        <br>
        <p>Stay Safe,<br>SafeTracker Team</p>
      </body>
    </html>
    """

    message = MIMEMultipart()
    # Using System Email as the actual sender to avoid Gmail rejection
    # But setting the display name to the Volunteer's name
    message["From"] = f"{volunteer_name} <{system_email}>"
    message["Reply-To"] = volunteer_email
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(html_body, "html"))

    server = None
    try:
        # Connect to the server and send email
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()  # Secure the connection
        server.login(system_email, system_password)
        server.sendmail(system_email, to_email, message.as_string())
        print(f"Email sent successfully to {to_email}")
        return {"status": "sent"}
    except Exception as e:
        print(f"Error sending email: {e}")
        print("\n" + "=" * 50)
        print(f"EMAIL SIMULATION (Real sending failed: {e})")
        print(f"FROM:     {volunteer_email} (Volunteer DB Email)")
        print(f"TO:       {to_email} (User DB Email)")
        print("-" * 20)
        print(f"Click YES (Verify): {yes_link}")
        print(f"Click NO (Reject): {no_link}")
        print("=" * 50 + "\n")
        return {"status": "failed_simulated", "error": str(e)}
    finally:
        if server:
            server.quit()


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
        os.makedirs("uploads", exist_ok=True)

        # PRO-LEVEL: Clean the filename to remove spaces and special chars
        original_name = image.filename
        clean_name = "".join(
            c if c.isalnum() or c in "._-" else "_" for c in original_name
        )

        image_path = f"uploads/{clean_name}"
        with open(image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)

        # Store full access path for the frontend
        image_path = f"uploads/{clean_name}"

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

    return {"message": "Signup successful", "user_id": user.id, "role": user.role}


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
    user = (
        db.query(User)
        .filter(User.username == username, User.password == password)
        .first()
    )
    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    if user.role == "volunteer" and not user.is_approved:
        raise HTTPException(
            status_code=403,
            detail="Your account is pending admin approval. Please check back later.",
        )

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "email": user.email,
            "address": user.address,
            "emergency_contact_email": user.emergency_contact_email,
        },
    }


# --- Incidents ---


@router.post("/incidents", response_model=schemas.IncidentCreateResponse)
def create_incident(incident: schemas.IncidentCreate, db: Session = Depends(get_db)):
    new_incident = Incident(**incident.dict())
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
def delete_incident(incident_id: int, user_id: int, db: Session = Depends(get_db)):
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


@router.put("/incidents/{incident_id}")
def update_incident(
    incident_id: int,
    incident_update: IncidentUpdate,
    user_id: int,
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
    return incident


@router.get("/incidents")
def get_incidents(db: Session = Depends(get_db)):
    incidents = db.query(Incident).all()

    response = []
    for inc in incidents:
        response.append(
            {
                "id": inc.id,
                "title": inc.title,
                "full_address": inc.full_address,
                "latitude": inc.latitude,
                "longitude": inc.longitude,
                "status": inc.status,
                "created_at": inc.created_at.isoformat() if inc.created_at else None,
                "reporter_id": inc.reporter_id,
                "volunteer_id": inc.volunteer_id,
                "reporter_name": inc.reporter.username if inc.reporter else "Unknown",
                "volunteer_name": inc.volunteer.username
                if inc.volunteer
                else "Waiting...",
            }
        )

    return response


@router.get("/incidents/user/{user_id}")
def get_user_incidents(user_id: int, db: Session = Depends(get_db)):
    incidents = db.query(Incident).filter(Incident.reporter_id == user_id).all()

    response = []
    for inc in incidents:
        response.append(
            {
                "id": inc.id,
                "title": inc.title,
                "full_address": inc.full_address,
                "latitude": inc.latitude,
                "longitude": inc.longitude,
                "status": inc.status,
                "created_at": inc.created_at.isoformat() if inc.created_at else None,
                "reporter_id": inc.reporter_id,
                "volunteer_id": inc.volunteer_id,
                "reporter_name": inc.reporter.username if inc.reporter else "Unknown",
                "volunteer_name": inc.volunteer.username
                if inc.volunteer
                else "Waiting...",
            }
        )
    return response


@router.put("/incidents/{incident_id}/accept")
def accept_incident(incident_id: int, volunteer_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.volunteer_id:
        raise HTTPException(status_code=400, detail="Incident already assigned")
    incident.volunteer_id = volunteer_id
    incident.status = (
        "in_progress"  # User wants to see 'In Progress' immediately after acceptance
    )
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

    email_result = {"status": "not_attempted"}

    # Send Email Notification
    # We fetch the volunteer (sender) and reporter (receiver) emails dynamically
    if incident.reporter and incident.reporter.email:
        rec_email = incident.reporter.email
        vol_email = (
            incident.volunteer.email if incident.volunteer else "volunteer@example.com"
        )
        vol_name = incident.volunteer.username if incident.volunteer else "Volunteer"

        print("DEBUG: Attempting to send completion email...")
        print(f"DEBUG: Recipient (User): {rec_email}")
        print(f"DEBUG: Sender (Volunteer): {vol_email}")

        email_result = send_completion_email(
            rec_email, incident.title, vol_email, vol_name, incident.id
        )
    else:
        print("DEBUG: Skip email - Incident reporter or email not found")
        email_result = {"status": "skipped", "reason": "no_reporter_email"}

    return {
        "message": "Incident marked as completed, awaiting user confirmation",
        "email_result": email_result,
    }


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


@router.get("/incidents/{incident_id}/verify", response_class=HTMLResponse)
def verify_incident_email(incident_id: int, choice: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        return HTMLResponse(content="<h1>Incident not found</h1>", status_code=404)

    if choice == "yes":
        incident.status = "closed"
        msg = f"""
        <html>
            <body style='text-align:center; padding:50px; font-family:sans-serif;'>
                <h1 style='color:green;'>✔️ Incident Closed</h1>
                <p>Thank you! The incident '{incident.title}' has been successfully closed.</p>
                <a href="http://127.0.0.1:5500/pages/user.html">Go to Dashboard</a>
            </body>
        </html>
        """
    else:
        # User selected NO
        # Per user request: "illa awaiting confirmation nu irukanum" (Else remain awaiting/or not closed)
        # We will keep it as 'awaiting_confirmation' (so status doesn't change from what volunteer set)

        msg = """
        <html>
            <body style='text-align:center; padding:50px; font-family:sans-serif;'>
                <h1 style='color:orange;'>⚠️ Confirmation Pending</h1>
                <p>You have selected <b>NO</b>.</p>
                <p>The incident status remains 'Awaiting Confirmation'.</p>
                <p>Please contact the volunteer if the work is not finished.</p>
                <a href="http://127.0.0.1:5500/pages/user.html">Go to Dashboard</a>
            </body>
        </html>
        """

    db.commit()
    return HTMLResponse(content=msg)


@router.get("/available-incidents", response_model=List[schemas.IncidentResponse])
def get_available_incidents(db: Session = Depends(get_db)):
    # Return only reported incidents for volunteers
    incidents = db.query(Incident).filter(Incident.status == "reported").all()
    response = []
    for inc in incidents:
        inc_data = schemas.IncidentResponse.from_orm(inc)
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
    new_complaint = Complaint(**complaint.dict())
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
    if address:
        user.address = address

    if image and image.filename:
        # Save new image
        os.makedirs("uploads", exist_ok=True)
        clean_name = "".join(
            c if c.isalnum() or c in "._-" else "_" for c in image.filename
        )
        file_path = f"uploads/profile_{user_id}_{clean_name}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        user.profile_image = file_path

    db.commit()
    db.refresh(user)
    return user
