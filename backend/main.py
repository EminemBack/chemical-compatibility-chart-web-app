#!/usr/bin/env python3
"""
Updated Chemical Container Safety Assessment API
With PostgreSQL database support and Docker containerization
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import asyncpg
import os
import json
from pathlib import Path
import structlog

# handling auth
import redis
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import secrets
from jose import JWTError, jwt
from datetime import timedelta

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "").split(",")

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "")
redis_client = None

# SMTP Configuration  
SMTP_SERVER = os.getenv("SMTP_SERVER", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", ""))
NOTIFICATION_FROM_EMAIL = os.getenv("NOTIFICATION_FROM_EMAIL", "")
SAFETY_TEAM_EMAIL = os.getenv("SAFETY_TEAM_EMAIL", "")
HOD_EMAILS = os.getenv("HOD_EMAILS", "").split(",")  # List of HOD emails for deletion requests

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = os.getenv("ALGORITHM", "")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "") )

# Create uploads directory for hazard logos
Path("uploads/hazard").mkdir(parents=True, exist_ok=True)

# Detect production mode
PRODUCTION = os.getenv("PRODUCTION", "false").lower() == "true"

# FastAPI app
app = FastAPI(
    title="Kinross Chemical Container Safety API",
    description="Chemical Container Safety Assessment System for Kinross Gold Corporation",
    version="2.0.0",
    docs_url="/docs" if not PRODUCTION else None,
    redoc_url="/redoc" if not PRODUCTION else None,
    openapi_url="/openapi.json" if not PRODUCTION else None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Database connection pool
db_pool = None

# Pydantic models
class HazardCategoryResponse(BaseModel):
    id: int
    name: str
    hazard_class: str
    subclass: Optional[str] = None
    description: Optional[str] = None
    logo_path: Optional[str] = None

class HazardPairData(BaseModel):
    hazard_category_a_id: int
    hazard_category_b_id: int
    distance: float

class ContainerSubmission(BaseModel):
    department: str
    location: str
    submitted_by: str
    container: str
    container_type: str
    selected_hazards: List[int]  # List of hazard category IDs
    hazard_pairs: List[HazardPairData]
    # status: str
    # approval_comment: Optional[str]
    # approved_by: Optional[str]
    # approved_at: Optional[datetime]

class User(BaseModel):
    id: int
    email: str
    name: str
    role: str  # 'hod', 'admin', 'user', 'viewer'
    department: str
    active: bool

class AuthRequest(BaseModel):
    email: str

class VerifyCodeRequest(BaseModel):
    email: str
    code: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    department: str

class ApprovalRequest(BaseModel):
    container_id: int
    status: str  # 'approved' or 'rejected'
    comment: Optional[str] = None

# New models for deletion requests and reviews
class DeletionRequest(BaseModel):
    container_id: int
    reason: str

class DeletionReview(BaseModel):
    deletion_request_id: int
    status: str  # 'approved' or 'rejected'
    comment: str

class AdminReviewRequest(BaseModel):
    deletion_request_id: int
    comment: str
    recommendation: str  # 'approve' or 'reject'

class HODDecisionRequest(BaseModel):
    deletion_request_id: int
    decision: str  # 'approved' or 'rejected'
    comment: str

# Database functions
async def get_db_pool():
    """Get database connection pool"""
    global db_pool
    if db_pool is None:
        try:
            db_pool = await asyncpg.create_pool(
                DATABASE_URL,
                min_size=1,
                max_size=10,
                command_timeout=60
            )
            logger.info("Database connection pool created", database_url=DATABASE_URL.split('@')[1])
        except Exception as e:
            logger.error("Failed to create database pool", error=str(e))
            raise
    return db_pool

async def execute_query(query: str, *args):
    """Execute a query and return results"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute_single(query: str, *args):
    """Execute a query and return single result"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)

async def execute_value(query: str, *args):
    """Execute a query and return single value"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)

async def execute_command(query: str, *args):
    """Execute a command (INSERT/UPDATE/DELETE)"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)

def calculate_hazard_status(class_a: str, class_b: str, distance: float) -> tuple[str, bool, float]:
    """
    Calculate safety status based on hazard classes and distance
    Based on the updated compatibility matrix
    Returns: (status, is_isolated, min_required_distance)
    """
    
    # Updated compatibility matrix based on the image and your notes
    compatibility_matrix = {
        # Flammable Gas (2.1) - Row 1
        ("2.1", "2.1"): ("OK_TOGETHER", 0.0),
        ("2.1", "2.2"): ("OK_TOGETHER", 0.0),
        ("2.1", "2.3"): ("SEGREGATE_3M", 3.0),
        ("2.1", "3"): ("SEGREGATE_5M", 5.0),
        ("2.1", "4.1"): ("SEGREGATE_5M", 5.0),
        ("2.1", "4.2"): ("SEGREGATE_5M", 5.0),
        ("2.1", "4.3"): ("SEGREGATE_5M", 5.0),
        ("2.1", "5.1"): ("SEGREGATE_3M", 3.0),
        ("2.1", "5.2"): ("ISOLATE", float('inf')),
        ("2.1", "6"): ("SEGREGATE_3M", 3.0),
        ("2.1", "8"): ("SEGREGATE_5M", 5.0),
        
        # Non-Flammable Non-Toxic Gas (2.2) - Row 2
        ("2.2", "2.2"): ("OK_TOGETHER", 0.0),
        ("2.2", "2.3"): ("OK_TOGETHER", 0.0),
        ("2.2", "3"): ("SEGREGATE_5M", 5.0),
        ("2.2", "4.1"): ("SEGREGATE_5M", 5.0),
        ("2.2", "4.2"): ("SEGREGATE_5M", 5.0),
        ("2.2", "4.3"): ("SEGREGATE_5M", 5.0),
        ("2.2", "5.1"): ("SEGREGATE_3M", 3.0),
        ("2.2", "5.2"): ("ISOLATE", float('inf')),
        ("2.2", "6"): ("SEGREGATE_3M", 3.0),
        ("2.2", "8"): ("SEGREGATE_5M", 5.0),
        
        # Toxic Gas (2.3) - Row 3
        ("2.3", "2.3"): ("MAY_NOT_COMPATIBLE", 3.0),
        ("2.3", "3"): ("SEGREGATE_5M", 5.0),  
        ("2.3", "4.1"): ("SEGREGATE_5M", 5.0),
        ("2.3", "4.2"): ("SEGREGATE_5M", 5.0),
        ("2.3", "4.3"): ("SEGREGATE_5M", 5.0),
        ("2.3", "5.1"): ("SEGREGATE_3M", 3.0),
        ("2.3", "5.2"): ("ISOLATE", float('inf')),
        ("2.3", "6"): ("SEGREGATE_3M", 3.0),
        ("2.3", "8"): ("SEGREGATE_5M", 5.0),
        
        # Flammable Liquid (3) - Row 4
        ("3", "3"): ("OK_TOGETHER", 0.0),
        ("3", "4.1"): ("SEGREGATE_3M", 3.0),
        ("3", "4.2"): ("SEGREGATE_5M", 5.0),
        ("3", "4.3"): ("SEGREGATE_5M", 5.0),
        ("3", "5.1"): ("SEGREGATE_5M", 5.0),
        ("3", "5.2"): ("ISOLATE", float('inf')),
        ("3", "6"): ("SEGREGATE_3M", 3.0),
        ("3", "8"): ("SEGREGATE_3M", 3.0),
        
        # Flammable Solid (4.1) - Row 5
        ("4.1", "4.1"): ("OK_TOGETHER", 0.0),
        ("4.1", "4.2"): ("SEGREGATE_3M", 3.0),
        ("4.1", "4.3"): ("SEGREGATE_5M", 5.0),
        ("4.1", "5.1"): ("SEGREGATE_3M", 3.0),
        ("4.1", "5.2"): ("ISOLATE", float('inf')),
        ("4.1", "6"): ("SEGREGATE_3M", 3.0),
        ("4.1", "8"): ("MAY_NOT_COMPATIBLE", 3.0),
        
        # Spontaneously Combustible (4.2) - Row 6
        ("4.2", "4.2"): ("OK_TOGETHER", 0.0),
        ("4.2", "4.3"): ("SEGREGATE_5M", 5.0),
        ("4.2", "5.1"): ("SEGREGATE_5M", 5.0),
        ("4.2", "5.2"): ("ISOLATE", float('inf')),
        ("4.2", "6"): ("SEGREGATE_3M", 3.0),
        ("4.2", "8"): ("SEGREGATE_3M", 3.0),
        
        # Dangerous When Wet (4.3) - Row 7
        ("4.3", "4.3"): ("OK_TOGETHER", 0.0),
        ("4.3", "5.1"): ("SEGREGATE_5M", 5.0),
        ("4.3", "5.2"): ("ISOLATE", float('inf')),
        ("4.3", "6"): ("SEGREGATE_3M", 3.0),
        ("4.3", "8"): ("SEGREGATE_5M", 5.0),
        
        # Oxidizing Agent (5.1) - Row 8
        ("5.1", "5.1"): ("MAY_NOT_COMPATIBLE", 3.0),
        ("5.1", "5.2"): ("ISOLATE", float('inf')),
        ("5.1", "6"): ("SEGREGATE_3M", 3.0),
        ("5.1", "8"): ("SEGREGATE_3M", 3.0),
        
        # Organic Peroxide (5.2) - Row 9
        ("5.2", "5.2"): ("OK_TOGETHER", 0.0),
        ("5.2", "6"): ("ISOLATE", float('inf')),
        ("5.2", "8"): ("SEGREGATE_3M", 3.0),
        
        # Toxic (6) - Row 10
        ("6", "6"): ("OK_TOGETHER", 0.0),
        ("6", "8"): ("SEGREGATE_5M", 5.0),
        
        # Corrosive (8) - Row 11
        ("8", "8"): ("MAY_NOT_COMPATIBLE", 3.0),
    }    

    # Convert hazard names to class codes for lookup
    name_to_class = {
        "Flammable Gas": "2.1",
        "Non-Flammable Non-Toxic Gas": "2.2", 
        "Toxic Gas": "2.3",
        "Flammable Liquid": "3",
        "Flammable Solid": "4.1",
        "Spontaneously Combustible": "4.2",
        "Dangerous When Wet": "4.3",
        "Oxidizing Agent": "5.1",
        "Organic Peroxide": "5.2",
        "Toxic": "6",
        "Corrosive": "8"
    }
    
    # Get class codes
    class_code_a = name_to_class.get(class_a, class_a)
    class_code_b = name_to_class.get(class_b, class_b)
    
    # Look up compatibility (normalize pair order for symmetric lookup)
    pair_key = tuple(sorted([class_code_a, class_code_b]))
    compatibility = compatibility_matrix.get(pair_key)
    
    if not compatibility:
        # Default for unknown pairs
        action = "SEGREGATE_3M"
        min_distance = 3.0
    else:
        action, min_distance = compatibility
    
    # Process the action based on your notes
    if action == "ISOLATE":
        return "danger", True, min_distance
    elif action == "OK_TOGETHER":
        if distance >= 0:  # Any distance is okay
            return "safe", False, 0.0
        else:
            return "safe", False, 0.0
    elif action == "MAY_NOT_COMPATIBLE":
        # Per your note: "MAY NOT be compatible" -> if same goods else apply 3M
        if class_code_a == class_code_b:
            # Same goods - treat as OK
            return "safe", False, 0.0
        else:
            # Different goods - apply 3M rule
            min_distance = 3.0
            if distance >= min_distance:
                return "safe", False, min_distance
            elif distance >= min_distance * 0.6:  # 60% of required
                return "caution", False, min_distance
            else:
                return "danger", False, min_distance
    elif action == "SEGREGATE_3M":
        min_distance = 3.0
    elif action == "SEGREGATE_5M":
        min_distance = 5.0
    
    # Check distance requirements for segregation
    if distance >= min_distance:
        return "safe", False, min_distance
    elif distance >= min_distance * 0.6:  # 60% of required distance
        return "caution", False, min_distance
    else:
        return "danger", False, min_distance

# Redis Connection Function
async def get_redis_client():
    """Get Redis client"""
    global redis_client
    if redis_client is None:
        try:
            redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            # Test connection
            redis_client.ping()
            logger.info("Redis connection established")
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise
    return redis_client

async def send_verification_email(email: str, code: str, name: str):
    """Send verification email via SMTP (no authentication)"""
    try:
        msg = MIMEMultipart()
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = email
        msg['Subject'] = 'Chemical Safety System - Verification Code'
        
        body = f"""
            Hello {name},

            Your verification code for the Chemical Safety Assessment System is: {code}

            This code will expire in 5 minutes.

            If you did not request this code, please ignore this email.

            Best regards,
            Kinross Chemical Safety System
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Connect to SMTP server (no authentication)
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, email, msg.as_string())
        server.quit()
        
        logger.info("Verification email sent", email=email)
        
    except Exception as e:
        logger.error("Failed to send verification email", error=str(e), email=email)
        raise

async def send_approval_email(email: str, name: str, container_id: str, status: str, comment: str):
    """Send approval/rejection email"""
    try:
        status_text = "APPROVED" if status == "approved" else "REJECTED"
        
        msg = MIMEMultipart()
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = email
        msg['Subject'] = f"Container {container_id} - {status_text}"
        
        body = f"""
            Hello {name},

            Your container safety assessment for {container_id} has been {status_text}.

            Status: {status_text}
            Comments: {comment}

            You can view the updated status in the Chemical Safety Assessment System.

            Best regards,
            Kinross Chemical Safety Team
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, email, msg.as_string())
        server.quit()
        
        logger.info("Approval email sent", email=email, status=status)
        
    except Exception as e:
        logger.error("Failed to send approval email", error=str(e))

async def send_submission_notification(container_data: dict, submitter_name: str, submitter_email: str):
    """Send notification to safety team when container is submitted"""
    try:
        msg = MIMEMultipart()
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = SAFETY_TEAM_EMAIL
        msg['Subject'] = f"New Container Safety Assessment - {container_data['container']}"
        
        # Build hazards list
        hazards_list = "\n".join([f"  - Class {h['hazard_class']}: {h['name']}" 
                                   for h in container_data.get('hazards', [])])
        
        # Build pairs assessment
        pairs_info = ""
        if container_data.get('pairs'):
            pairs_info = "\n\nHazard Pair Assessments:"
            for pair in container_data['pairs']:
                status_emoji = "✅" if pair['status'] == 'safe' else "⚠️" if pair['status'] == 'caution' else "❌"
                min_dist = pair.get('min_required_distance')
                min_dist_text = "Must Be Isolated" if min_dist is None else f"{min_dist}m"
                
                pairs_info += f"""
  {status_emoji} {pair['hazard_a_name']} ↔ {pair['hazard_b_name']}
     Actual Distance: {pair['distance']}m
     Required Distance: {min_dist_text}
     Status: {pair['status'].upper()}
"""
        
        body = f"""
New Container Safety Assessment Submitted

CONTAINER DETAILS:
─────────────────────────────────────────
Container ID: {container_data['container']}
Container Type: {container_data['container_type']}
Department: {container_data['department']}
Location: {container_data['location']}
Submitted By: {submitter_name} ({submitter_email})
Submitted At: {container_data.get('submitted_at', 'N/A')}

HAZARDS PRESENT:
─────────────────────────────────────────
{hazards_list}
{pairs_info}

ACTION REQUIRED:
─────────────────────────────────────────
Please review this container safety assessment in the Chemical Safety System.
Login to approve or reject this submission.

System URL: [Your System URL Here]

Best regards,
Kinross Chemical Safety System (Automated Notification)
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, SAFETY_TEAM_EMAIL, msg.as_string())
        server.quit()
        
        logger.info("Safety team notification sent", 
                   container_id=container_data['container'], 
                   safety_email=SAFETY_TEAM_EMAIL)
        
    except Exception as e:
        logger.error("Failed to send safety team notification", 
                    error=str(e), 
                    container_id=container_data.get('container'))
        # Don't raise - we don't want email failures to block submissions

async def send_deletion_request_to_admin(container_data: dict, requester_name: str, requester_email: str, reason: str):
    """Send notification to ADMIN when user requests deletion"""
    try:
        # # Get all Admin emails, will try to send to all Admins later
        # admin_users = await execute_query(
        #     "SELECT email, name FROM users WHERE role = 'admin' AND active = true"
        # )
        
        # if not admin_users:
        #     logger.warning("No Admin users found to notify for deletion request")
        #     return
        
        # admin_emails = [user['email'] for user in admin_users]
        
        msg = MIMEMultipart()
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = SAFETY_TEAM_EMAIL
        msg['Subject'] = f"Container Deletion Request - Admin Review Required - {container_data['container']}"
        
        body = f"""
Container Deletion Request - ADMIN REVIEW REQUIRED

DELETION REQUEST DETAILS:
─────────────────────────────────────────
Container ID: {container_data['container']}
Department: {container_data['department']}
Location: {container_data['location']}
Container Type: {container_data['container_type']}

Requested By: {requester_name} ({requester_email})
Reason for Deletion:
{reason}

CONTAINER INFORMATION:
─────────────────────────────────────────
Current Status: {container_data.get('status', 'N/A')}
Submitted By: {container_data.get('submitted_by', 'N/A')}
Submitted At: {container_data.get('submitted_at', 'N/A')}

ACTION REQUIRED:
─────────────────────────────────────────
As Administrator, please review this deletion request and provide your
recommendation. After your review, it will be forwarded to the HOD for
final approval.

Login to the Chemical Safety System to review this request.

System URL: [Your System URL Here]

Best regards,
Kinross Chemical Safety System (Automated Notification)
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, SAFETY_TEAM_EMAIL, msg.as_string())
        server.quit()
        
        logger.info("Admin deletion request notification sent", 
                   container_id=container_data['container']) 
                #    admin_count=len(admin_emails))
        
    except Exception as e:
        logger.error("Failed to send admin deletion notification", error=str(e))

async def send_deletion_decision_notification(container_id: str, requester_email: str, requester_name: str, status: str, comment: str, hod_name: str):
    """Send notification to requester about deletion decision"""
    try:
        status_text = "APPROVED" if status == "approved" else "REJECTED"
        
        msg = MIMEMultipart()
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = requester_email
        msg['Subject'] = f"Deletion Request {status_text} - {container_id}"
        
        body = f"""
Hello {requester_name},

Your deletion request for container {container_id} has been {status_text}.

Decision: {status_text}
Reviewed By: {hod_name} (Head of Department)
Comments: {comment}

{"The container has been permanently deleted from the system." if status == "approved" else "The container remains in the system."}

Best regards,
Kinross Chemical Safety Team
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, requester_email, msg.as_string())
        server.quit()
        
        logger.info("Deletion decision notification sent", 
                   requester_email=requester_email, 
                   status=status)
        
    except Exception as e:
        logger.error("Failed to send deletion decision notification", error=str(e))

async def send_admin_review_to_hod(container_data: dict, admin_name: str, user_reason: str, admin_comment: str, admin_recommendation: str):
    """Send notification to HOD after admin reviews deletion request"""
    try:
        # # Get all HOD emails
        # hod_users = await execute_query(
        #     "SELECT email, name FROM users WHERE role = 'hod' AND active = true"
        # )
        
        # if not hod_users:
        #     logger.warning("No HOD users found to notify")
        #     return
        
        hod_emails = HOD_EMAILS #[user['email'] for user in hod_users]
        
        recommendation_text = "RECOMMENDS APPROVAL" if admin_recommendation == 'approve' else "RECOMMENDS REJECTION"
        
        msg = MIMEMultipart()
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = ', '.join(hod_emails)
        msg['Subject'] = f"Deletion Request Ready for HOD Approval - {container_data['container']}"
        
        body = f"""
Container Deletion Request - HOD APPROVAL REQUIRED

ADMIN REVIEW COMPLETED - {recommendation_text}

CONTAINER DETAILS:
─────────────────────────────────────────
Container ID: {container_data['container']}
Department: {container_data['department']}
Location: {container_data['location']}
Submitted By: {container_data.get('submitted_by', 'N/A')}

USER'S DELETION REASON:
─────────────────────────────────────────
{user_reason}

ADMIN REVIEW:
─────────────────────────────────────────
Reviewed By: {admin_name}
Recommendation: {recommendation_text}
Admin Comments:
{admin_comment}

ACTION REQUIRED:
─────────────────────────────────────────
As Head of Department, please make the final decision on this deletion request.
Login to the Chemical Safety System to approve or reject.

System URL: [Your System URL Here]

Best regards,
Kinross Chemical Safety System (Automated Notification)
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, hod_emails, msg.as_string())
        server.quit()
        
        logger.info("HOD notification sent after admin review", 
                   container_id=container_data['container'])
        
    except Exception as e:
        logger.error("Failed to send HOD notification", error=str(e))

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Routes
@app.get("/")
async def read_root():
    return {
        "message": "Kinross Chemical Container Safety API",
        "status": "running",
        "version": "2.0.0",
        "database": "PostgreSQL"
    }

@app.get("/hazard-categories/", response_model=List[HazardCategoryResponse])
async def get_hazard_categories():
    """Get all hazard categories"""
    try:
        rows = await execute_query("""
            SELECT id, name, hazard_class, subclass, description, logo_path 
            FROM hazard_categories 
            ORDER BY hazard_class, subclass, name
        """)
        
        categories = []
        for row in rows:
            categories.append(HazardCategoryResponse(
                id=row['id'],
                name=row['name'],
                hazard_class=row['hazard_class'],
                subclass=row['subclass'],
                description=row['description'],
                logo_path=row['logo_path']
            ))
        
        logger.info("Retrieved hazard categories", count=len(categories))
        return categories
        
    except Exception as e:
        logger.error("Error fetching hazard categories", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error fetching hazard categories: {str(e)}")

@app.post("/containers/")
async def submit_container(submission: ContainerSubmission, authorization: str = Header(None)):
    """Submit a new container with hazards and pair distances"""
    try:
        # AUTHENTICATION CHECK:
        current_user = await get_current_user_from_token(authorization)        
        logger.info("Container submission started", user=current_user['name'], submission_data=submission.dict())
        
        logger.info("Submitting container", 
                   department=submission.department, 
                   location=submission.location,
                   container=submission.container,
                   hazard_count=len(submission.selected_hazards),
                   pair_count=len(submission.hazard_pairs))
        
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Create container record
                container_id = await conn.fetchval("""
                    INSERT INTO containers (department, location, submitted_by, container, container_type, status)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                """, submission.department, submission.location, submission.submitted_by, 
                    submission.container, submission.container_type, 'pending')
                
                logger.info("Container created", container_id=container_id)
                
                # Add selected hazards
                for hazard_id in submission.selected_hazards:
                    await conn.execute("""
                        INSERT INTO container_hazards (container_id, hazard_category_id)
                        VALUES ($1, $2)
                    """, container_id, hazard_id)
                
                # Add hazard pairs with distances and status
                if submission.hazard_pairs:
                    for pair_data in submission.hazard_pairs:
                        # Get hazard category names for status calculation
                        hazard_a_row = await conn.fetchrow(
                            "SELECT name FROM hazard_categories WHERE id = $1", 
                            pair_data.hazard_category_a_id
                        )
                        
                        hazard_b_row = await conn.fetchrow(
                            "SELECT name FROM hazard_categories WHERE id = $1", 
                            pair_data.hazard_category_b_id
                        )
                        
                        if not hazard_a_row or not hazard_b_row:
                            raise HTTPException(status_code=400, detail=f"Invalid hazard category ID")
                        
                        # Calculate status, isolation, and minimum distance
                        status, is_isolated, min_required_distance = calculate_hazard_status(
                            hazard_a_row['name'], 
                            hazard_b_row['name'], 
                            pair_data.distance
                        )
                        
                        # Handle infinity distance
                        min_dist_value = None if min_required_distance == float('inf') else min_required_distance
                        
                        await conn.execute("""
                            INSERT INTO hazard_pairs (container_id, hazard_category_a_id, hazard_category_b_id, 
                                                    distance, is_isolated, min_required_distance, status)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                        """, container_id, pair_data.hazard_category_a_id, pair_data.hazard_category_b_id, 
                             pair_data.distance, is_isolated, min_dist_value, status)
        
                # SECTION - Fetch full container data for email
                container_full_data = await conn.fetchrow("""
                    SELECT id, department, location, submitted_by, container, container_type, submitted_at
                    FROM containers WHERE id = $1
                """, container_id)
                
                # Get hazards
                hazard_rows = await conn.fetch("""
                    SELECT h.name, h.hazard_class, h.subclass 
                    FROM hazard_categories h
                    JOIN container_hazards ch ON h.id = ch.hazard_category_id
                    WHERE ch.container_id = $1
                """, container_id)
                
                # Get pairs
                pair_rows = await conn.fetch("""
                    SELECT hp.*, ha.name as hazard_a_name, hb.name as hazard_b_name
                    FROM hazard_pairs hp
                    JOIN hazard_categories ha ON hp.hazard_category_a_id = ha.id
                    JOIN hazard_categories hb ON hp.hazard_category_b_id = hb.id
                    WHERE hp.container_id = $1
                """, container_id)
                
            # Build email data structure
            email_data = {
                'container': container_full_data['container'],
                'container_type': container_full_data['container_type'],
                'department': container_full_data['department'],
                'location': container_full_data['location'],
                'submitted_at': container_full_data['submitted_at'].isoformat(),
                'hazards': [{"name": row['name'], "hazard_class": row['hazard_class']} for row in hazard_rows],
                'pairs': [
                    {
                        'hazard_a_name': row['hazard_a_name'],
                        'hazard_b_name': row['hazard_b_name'],
                        'distance': row['distance'],
                        'min_required_distance': row['min_required_distance'],
                        'status': row['status']
                    } for row in pair_rows
                ]
            }
        
        # ✅ SEND EMAIL NOTIFICATION TO SAFETY TEAM
        await send_submission_notification(
            email_data, 
            current_user['name'], 
            current_user['email']
        )
        
        logger.info("Container assessment submitted successfully", container_id=container_id)
        
        return {
            "message": "Container safety assessment submitted successfully",
            "container_id": container_id,
            "department": submission.department,
            "location": submission.location,
            "container": submission.container,
            "container_type": submission.container_type,
            "pairs_processed": len(submission.hazard_pairs)
        }
        
    except Exception as e:
        logger.error("Error saving container data", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error saving container data: {str(e)}")

@app.get("/containers/")
async def get_containers(authorization: str = Header(None)):
    """Get containers with user-specific filtering"""
    try:
        # Get current user
        current_user = await get_current_user_from_token(authorization)
        
        # Build query based on user role
        if current_user['role'] == 'admin':
            container_query = """SELECT id, department, location, submitted_by, container, container_type, 
                                submitted_at, status, approval_comment, approved_by, approved_at 
                                FROM containers ORDER BY submitted_at DESC"""
            container_params = []
        else:
            container_query = """SELECT id, department, location, submitted_by, container, container_type, 
                                submitted_at, status, approval_comment, approved_by, approved_at 
                                FROM containers WHERE submitted_by = $1 ORDER BY submitted_at DESC"""
            container_params = [current_user['name']]
        
        container_rows = await execute_query(container_query, *container_params)
        containers = []
        
        for container_row in container_rows:
            container_id = container_row['id']
            
            # Get hazards for this container
            hazard_rows = await execute_query("""
                SELECT h.name, h.hazard_class, h.subclass 
                FROM hazard_categories h
                JOIN container_hazards ch ON h.id = ch.hazard_category_id
                WHERE ch.container_id = $1
            """, container_id)
            
            hazards = [{"name": row['name'], "hazard_class": row['hazard_class'], "subclass": row['subclass']} 
                      for row in hazard_rows]
            
            # Get pairs for this container
            pair_rows = await execute_query("""
                SELECT hp.*, ha.name as hazard_a_name, hb.name as hazard_b_name
                FROM hazard_pairs hp
                JOIN hazard_categories ha ON hp.hazard_category_a_id = ha.id
                JOIN hazard_categories hb ON hp.hazard_category_b_id = hb.id
                WHERE hp.container_id = $1
            """, container_id)
            
            pairs = []
            for pair_row in pair_rows:
                min_dist = pair_row['min_required_distance']
                # Handle infinity values properly for JSON serialization
                if min_dist is None or min_dist == float('inf'):
                    min_dist = None  # Use None instead of infinity
                
                pairs.append({
                    "id": pair_row['id'],
                    "hazard_a_name": pair_row['hazard_a_name'],
                    "hazard_b_name": pair_row['hazard_b_name'],
                    "distance": pair_row['distance'],
                    "is_isolated": bool(pair_row['is_isolated']),
                    "min_required_distance": min_dist,
                    "status": pair_row['status']
                })
            
            containers.append({
                "id": container_row['id'],
                "department": container_row['department'],
                "location": container_row['location'],
                "submitted_by": container_row['submitted_by'],
                "container": container_row['container'],
                "container_type": container_row['container_type'],
                "submitted_at": container_row['submitted_at'].isoformat(),
                "status": container_row.get('status', 'pending'),
                "approval_comment": container_row.get('approval_comment'),
                "approved_by": container_row.get('approved_by'),
                "approved_at": container_row['approved_at'].isoformat() if container_row.get('approved_at') else None,
                "hazards": hazards,
                "pairs": pairs
            })
        
        logger.info("Retrieved containers", count=len(containers), user_role=current_user['role'])
        return containers
        
    except Exception as e:
        logger.error("Error fetching containers", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error fetching containers: {str(e)}")

async def get_current_user_from_token(authorization: str = None):
    """Extract user from JWT token"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header")
        
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await execute_single(
            "SELECT id, email, name, role, department FROM users WHERE email = $1 AND active = true",
            email
        )
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return dict(user)
        
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/preview-status/")
async def get_preview_status(hazard_a_id: int, hazard_b_id: int, distance: float):
    """Get real-time status preview for a hazard pair"""
    try:
        # Get hazard category names
        hazard_a_row = await execute_single(
            "SELECT name FROM hazard_categories WHERE id = $1", hazard_a_id
        )
        
        hazard_b_row = await execute_single(
            "SELECT name FROM hazard_categories WHERE id = $1", hazard_b_id
        )
        
        if not hazard_a_row or not hazard_b_row:
            raise HTTPException(status_code=400, detail="Invalid hazard category ID")
        
        # Calculate status using the backend logic
        status, is_isolated, min_required_distance = calculate_hazard_status(
            hazard_a_row['name'], 
            hazard_b_row['name'], 
            distance
        )
        
        return {
            "status": status,
            "is_isolated": is_isolated,
            "min_required_distance": min_required_distance if min_required_distance != float('inf') else None
        }
        
    except Exception as e:
        logger.error("Error calculating status", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error calculating status: {str(e)}")

# Auth Endpoints
@app.post("/auth/request-code")
async def request_verification_code(auth_request: AuthRequest):
    """Send verification code to user email"""
    try:
        email = auth_request.email.lower().strip()
        
        # Check if user exists in database
        user = await execute_single(
            "SELECT id, email, name, role, department, active FROM users WHERE email = $1", 
            email
        )
        
        if not user or not user['active']:
            raise HTTPException(status_code=404, detail="User not found or inactive")
        
        # Generate 6-digit code
        code = str(secrets.randbelow(900000) + 100000)
        
        # Store code in Redis with 5-minute expiration
        redis_client = await get_redis_client()
        redis_key = f"verification_code:{email}"
        redis_client.setex(redis_key, 300, code)  # 5 minutes expiration
        
        # Send email
        await send_verification_email(email, code, user['name'])
        
        logger.info("Verification code sent", email=email, user_id=user['id'])
        return {"message": "Verification code sent to your email"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error sending verification code", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to send verification code")

@app.post("/auth/verify-code")
async def verify_code(verify_request: VerifyCodeRequest):
    """Verify code and return user session"""
    try:
        email = verify_request.email.lower().strip()
        
        # Get code from Redis
        redis_client = await get_redis_client()
        redis_key = f"verification_code:{email}"
        stored_code = redis_client.get(redis_key)
        
        if not stored_code:
            raise HTTPException(status_code=400, detail="Verification code not found or expired")
        
        # Check code
        if verify_request.code != stored_code:
            raise HTTPException(status_code=400, detail="Invalid verification code")
        
        # Get user data
        user = await execute_single(
            "SELECT id, email, name, role, department FROM users WHERE email = $1 AND active = true", 
            email
        )
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Delete code from Redis
        redis_client.delete(redis_key)
        
        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user['email'], "user_id": user['id'], "role": user['role']},
            expires_delta=access_token_expires
        )
        logger.info(f'Access token: {access_token}')
        logger.info("User authenticated successfully", email=email, user_id=user['id'])
        
        return {
            "user": {
                "id": user['id'],
                "email": user['email'],
                "name": user['name'],
                "role": user['role'],
                "department": user['department']
            },
            "access_token": access_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error verifying code", error=str(e))
        raise HTTPException(status_code=500, detail="Verification failed")

@app.get("/auth/me", response_model=UserResponse)
async def get_current_user(authorization: str = Header(None)):
    """Get current user from token"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header")
        
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await execute_single(
            "SELECT id, email, name, role, department FROM users WHERE email = $1 AND active = true",
            email
        )
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return UserResponse(**user)
        
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error("Error getting current user", error=str(e))
        raise HTTPException(status_code=401, detail="Authentication failed")

# Containers Approval Process Functions
@app.get("/containers/pending")
async def get_pending_containers(authorization: str = Header(None)):
    """Get pending containers for admin approval"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['hod', 'admin']:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        container_rows = await execute_query("""
            SELECT c.*, u.name as submitter_name, u.email as submitter_email
            FROM containers c 
            JOIN users u ON c.submitted_by = u.name
            WHERE c.status = 'pending'
            ORDER BY c.submitted_at ASC
        """)
        
        containers = []
        
        for container_row in container_rows:
            container_id = container_row['id']
            
            # Get hazards for this container
            hazard_rows = await execute_query("""
                SELECT h.name, h.hazard_class, h.subclass 
                FROM hazard_categories h
                JOIN container_hazards ch ON h.id = ch.hazard_category_id
                WHERE ch.container_id = $1
            """, container_id)
            
            hazards = [{"name": row['name'], "hazard_class": row['hazard_class'], "subclass": row['subclass']} 
                      for row in hazard_rows]
            
            # Get pairs for this container
            pair_rows = await execute_query("""
                SELECT hp.*, ha.name as hazard_a_name, hb.name as hazard_b_name
                FROM hazard_pairs hp
                JOIN hazard_categories ha ON hp.hazard_category_a_id = ha.id
                JOIN hazard_categories hb ON hp.hazard_category_b_id = hb.id
                WHERE hp.container_id = $1
            """, container_id)
            
            pairs = []
            for pair_row in pair_rows:
                min_dist = pair_row['min_required_distance']
                if min_dist is None or min_dist == float('inf'):
                    min_dist = None
                
                pairs.append({
                    "id": pair_row['id'],
                    "hazard_a_name": pair_row['hazard_a_name'],
                    "hazard_b_name": pair_row['hazard_b_name'],
                    "distance": pair_row['distance'],
                    "is_isolated": bool(pair_row['is_isolated']),
                    "min_required_distance": min_dist,
                    "status": pair_row['status']
                })
            
            containers.append({
                "id": container_row['id'],
                "department": container_row['department'],
                "location": container_row['location'],
                "submitted_by": container_row['submitted_by'],
                "container": container_row['container'],
                "container_type": container_row['container_type'],
                "submitted_at": container_row['submitted_at'].isoformat(),
                "status": container_row.get('status', 'pending'),
                "approval_comment": container_row.get('approval_comment'),
                "approved_by": container_row.get('approved_by'),
                "approved_at": container_row['approved_at'].isoformat() if container_row.get('approved_at') else None,
                "hazards": hazards,
                "pairs": pairs
            })
        
        return containers
        
    except Exception as e:
        logger.error("Error fetching pending containers", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error fetching pending containers: {str(e)}")

@app.post("/containers/{container_id}/approve")
async def approve_container(
    container_id: int, 
    approval: ApprovalRequest,
    authorization: str = Header(None)
):
    """Approve or reject a container"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['hod', 'admin']:
            raise HTTPException(status_code=403, detail="Admin access required")

        # VALIDATION - Check for non-empty comment
        if not approval.comment or approval.comment.strip() == "":
            raise HTTPException(
                status_code=400, 
                detail="Comment is required. Please provide a reason for approval or rejection."
            )
        
        # VALIDATION - Minimum comment length
        if len(approval.comment.strip()) < 10:
            raise HTTPException(
                status_code=400,
                detail="Comment must be at least 10 characters long. Please provide a detailed reason."
            )
                
        # Update container status
        await execute_command("""
            UPDATE containers 
            SET status = $1, approval_comment = $2, approved_by = $3, approved_at = $4
            WHERE id = $5
        """, approval.status, approval.comment.strip(), current_user['name'], datetime.utcnow(), container_id)
        
        # Get container and user details for email
        container_data = await execute_single("""
            SELECT c.container, u.email, u.name as user_name
            FROM containers c 
            JOIN users u ON c.submitted_by = u.name 
            WHERE c.id = $1
        """, container_id)
        
        if container_data:
            # Send notification email
            await send_approval_email(
                container_data['email'],
                container_data['user_name'],
                container_data['container'],
                approval.status,
                approval.comment.strip()  # Use trimmed comment
            )
        
        logger.info("Container approval processed", container_id=container_id, status=approval.status, comment_length=len(approval.comment.strip()))
        return {"message": f"Container {approval.status} successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error processing approval", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error processing approval: {str(e)}")

# Delete Containers Endpoint
@app.delete("/containers/{container_id}")
async def delete_container(container_id: int, authorization: str = Header(None)):
    """Delete a container (admin only)"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['hod', 'admin']:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Check if container exists
        container = await execute_single("SELECT * FROM containers WHERE id = $1", container_id)
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Delete related records first (foreign key constraints)
                await conn.execute("DELETE FROM hazard_pairs WHERE container_id = $1", container_id)
                await conn.execute("DELETE FROM container_hazards WHERE container_id = $1", container_id)
                await conn.execute("DELETE FROM containers WHERE id = $1", container_id)
        
        logger.info("Container deleted", container_id=container_id, deleted_by=current_user['name'])
        return {"message": "Container deleted successfully"}
        
    except Exception as e:
        logger.error("Error deleting container", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error deleting container: {str(e)}")

@app.post("/containers/{container_id}/request-deletion")
async def request_container_deletion(
    container_id: int,
    deletion_request: DeletionRequest,
    authorization: str = Header(None)
):
    """Request deletion of a container (requires HOD approval)"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        # Only regular users can request deletions
        if current_user['role'] != 'user':
            raise HTTPException(status_code=403, detail="Only regular users can request container deletions")
        
        # Validate reason
        if not deletion_request.reason or deletion_request.reason.strip() == "":
            raise HTTPException(status_code=400, detail="Deletion reason is required")
        
        if len(deletion_request.reason.strip()) < 20:
            raise HTTPException(
                status_code=400,
                detail="Deletion reason must be at least 20 characters long"
            )
        
        # Check if container exists
        container = await execute_single(
            "SELECT * FROM containers WHERE id = $1", 
            container_id
        )
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")

        # User can only delete their own containers
        if container['submitted_by'] != current_user['name']:
            raise HTTPException(
                status_code=403,
                detail="You can only request deletion of your own containers"
            )
                
        # Check if there's already a pending deletion request
        existing_request = await execute_single(
            "SELECT * FROM deletion_requests WHERE container_id = $1 AND status = 'pending'",
            container_id
        )
        if existing_request:
            raise HTTPException(
                status_code=400, 
                detail="A deletion request is already pending for this container"
            )
        
        # Create deletion request
        request_id = await execute_value("""
            INSERT INTO deletion_requests 
            (container_id, requested_by, requested_by_email, request_reason)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        """, container_id, current_user['name'], current_user['email'], deletion_request.reason.strip())
        
        # Get full container data for email
        container_data = {
            'container': container['container'],
            'department': container['department'],
            'location': container['location'],
            'container_type': container['container_type'],
            'status': container['status'],
            'submitted_by': container['submitted_by'],
            'submitted_at': container['submitted_at'].isoformat()
        }
        
        # Send notification to ADMINs (not HODs)
        await send_deletion_request_to_admin(
            container_data,
            current_user['name'],
            current_user['email'],
            deletion_request.reason.strip()
        )
        
        logger.info("Deletion request created", 
                   container_id=container_id, 
                   request_id=request_id,
                   requested_by=current_user['name'])
        
        return {
            "message": "Deletion request submitted successfully. Admin will review your request.",
            "request_id": request_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating deletion request", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error creating deletion request: {str(e)}")

@app.post("/deletion-requests/{request_id}/admin-review")
async def admin_review_deletion(
    request_id: int,
    review: AdminReviewRequest,
    authorization: str = Header(None)
):
    """Admin reviews deletion request and forwards to HOD"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        # Only admins can review
        if current_user['role'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Validate comment
        if not review.comment or review.comment.strip() == "":
            raise HTTPException(status_code=400, detail="Admin review comment is required")
        
        if len(review.comment.strip()) < 10:
            raise HTTPException(
                status_code=400,
                detail="Admin review comment must be at least 10 characters long"
            )
        
        # Validate recommendation
        if review.recommendation not in ['approve', 'reject']:
            raise HTTPException(status_code=400, detail="Recommendation must be 'approve' or 'reject'")
        
        # Get deletion request
        deletion_req = await execute_single(
            "SELECT * FROM deletion_requests WHERE id = $1",
            request_id
        )
        if not deletion_req:
            raise HTTPException(status_code=404, detail="Deletion request not found")
        
        if deletion_req['admin_reviewed']:
            raise HTTPException(status_code=400, detail="This request has already been reviewed by admin")
        
        if deletion_req['status'] != 'pending':
            raise HTTPException(status_code=400, detail="This request is not in pending status")
        
        # Update deletion request with admin review
        await execute_command("""
            UPDATE deletion_requests
            SET admin_reviewed = true,
                admin_reviewer = $1,
                admin_reviewer_email = $2,
                admin_review_comment = $3,
                admin_review_date = $4,
                status = 'admin_reviewed'
            WHERE id = $5
        """, current_user['name'], current_user['email'], 
            review.comment.strip(), datetime.utcnow(), request_id)
        
        # Get container data for email
        container = await execute_single(
            "SELECT * FROM containers WHERE id = $1",
            deletion_req['container_id']
        )
        
        container_data = {
            'container': container['container'],
            'department': container['department'],
            'location': container['location'],
            'container_type': container['container_type'],
            'submitted_by': container['submitted_by']
        }
        
        # Send notification to HOD
        await send_admin_review_to_hod(
            container_data,
            current_user['name'],
            deletion_req['request_reason'],
            review.comment.strip(),
            review.recommendation
        )
        
        logger.info("Admin reviewed deletion request",
                   request_id=request_id,
                   admin=current_user['name'],
                   recommendation=review.recommendation)
        
        return {
            "message": f"Admin review submitted successfully. Request forwarded to HOD with recommendation to {review.recommendation}.",
            "forwarded_to_hod": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in admin review", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error processing admin review: {str(e)}")

@app.get("/deletion-requests/pending")
async def get_pending_deletion_requests(authorization: str = Header(None)):
    """Get pending deletion requests (Admin sees pending, HOD sees admin_reviewed)"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['admin', 'hod']:
            raise HTTPException(status_code=403, detail="Admin or HOD access required")
        
        # Admin sees pending (not yet reviewed)
        # HOD sees admin_reviewed (reviewed by admin, awaiting HOD decision)
        if current_user['role'] == 'admin':
            status_filter = 'pending'
        else:  # HOD
            status_filter = 'admin_reviewed'
        
        requests = await execute_query("""
            SELECT 
                dr.*,
                c.container, c.department, c.location, c.container_type, 
                c.status as container_status, c.submitted_by, c.submitted_at
            FROM deletion_requests dr
            JOIN containers c ON dr.container_id = c.id
            WHERE dr.status = $1
            ORDER BY dr.request_date ASC
        """, status_filter)
        
        result = []
        for req in requests:
            item = {
                "id": req['id'],
                "container_id": req['container_id'],
                "container": req['container'],
                "department": req['department'],
                "location": req['location'],
                "container_type": req['container_type'],
                "container_status": req['container_status'],
                "submitted_by": req['submitted_by'],
                "submitted_at": req['submitted_at'].isoformat(),
                "requested_by": req['requested_by'],
                "requested_by_email": req['requested_by_email'],
                "request_reason": req['request_reason'],
                "request_date": req['request_date'].isoformat(),
                "admin_reviewed": req['admin_reviewed']
            }
            
            # Add admin review info if available (for HOD)
            if req['admin_reviewed']:
                item.update({
                    "admin_reviewer": req['admin_reviewer'],
                    "admin_review_comment": req['admin_review_comment'],
                    "admin_review_date": req['admin_review_date'].isoformat() if req['admin_review_date'] else None
                })
            
            result.append(item)
        
        logger.info("Retrieved deletion requests", 
                   role=current_user['role'],
                   status_filter=status_filter,
                   count=len(result))
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching deletion requests", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error fetching deletion requests: {str(e)}")

@app.post("/deletion-requests/{request_id}/hod-decision")
async def hod_final_decision(
    request_id: int,
    decision: HODDecisionRequest,
    authorization: str = Header(None)
):
    """HOD makes final decision on deletion request (after admin review)"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] != 'hod':
            raise HTTPException(status_code=403, detail="HOD access required")
        
        # Validate comment
        if not decision.comment or decision.comment.strip() == "":
            raise HTTPException(status_code=400, detail="HOD decision comment is required")
        
        if len(decision.comment.strip()) < 10:
            raise HTTPException(
                status_code=400,
                detail="HOD decision comment must be at least 10 characters long"
            )
        
        # Validate decision
        if decision.decision not in ['approved', 'rejected']:
            raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")
        
        # Get deletion request
        deletion_req = await execute_single(
            "SELECT * FROM deletion_requests WHERE id = $1",
            request_id
        )
        if not deletion_req:
            raise HTTPException(status_code=404, detail="Deletion request not found")
        
        # Must be admin_reviewed before HOD can decide
        if deletion_req['status'] != 'admin_reviewed':
            raise HTTPException(
                status_code=400, 
                detail="This request must be reviewed by admin first"
            )
        
        if not deletion_req['admin_reviewed']:
            raise HTTPException(
                status_code=400,
                detail="Admin review is required before HOD decision"
            )
        
        # Update deletion request with HOD decision
        await execute_command("""
            UPDATE deletion_requests
            SET status = $1,
                hod_reviewer = $2,
                hod_reviewer_email = $3,
                hod_review_comment = $4,
                hod_review_date = $5
            WHERE id = $6
        """, decision.decision, current_user['name'], current_user['email'],
            decision.comment.strip(), datetime.utcnow(), request_id)
        
        # If approved, delete the container
        container_deleted = False
        container_name = None
        if decision.decision == 'approved':
            container_id = deletion_req['container_id']
            
            # Get container info before deletion
            container = await execute_single(
                "SELECT container FROM containers WHERE id = $1",
                container_id
            )
            container_name = container['container'] if container else f"ID {container_id}"
            
            # Delete container (CASCADE will handle related records)
            await execute_command("DELETE FROM containers WHERE id = $1", container_id)
            container_deleted = True
            
            logger.info("Container deleted via HOD final approval",
                       container_id=container_id,
                       hod=current_user['name'])
        
        # Send notification to original requester
        await send_deletion_decision_notification(
            container_name or deletion_req['container_id'],
            deletion_req['requested_by_email'],
            deletion_req['requested_by'],
            decision.decision,
            decision.comment.strip(),
            current_user['name']
        )
        
        logger.info("HOD made final deletion decision",
                   request_id=request_id,
                   decision=decision.decision,
                   hod=current_user['name'])
        
        return {
            "message": f"Deletion request {decision.decision} successfully by HOD",
            "container_deleted": container_deleted
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in HOD decision", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error processing HOD decision: {str(e)}")

# API Health Check
@app.get("/health")
async def health_check():
    """Check database connectivity and stats"""
    try:
        # Test database connection
        categories_count = await execute_value("SELECT COUNT(*) FROM hazard_categories")
        containers_count = await execute_value("SELECT COUNT(*) FROM containers")
        pairs_count = await execute_value("SELECT COUNT(*) FROM hazard_pairs")
        
        # Get database version
        db_version = await execute_value("SELECT version()")
        
        return {
            "status": "healthy",
            "database": "PostgreSQL",
            "database_version": db_version.split(' ')[1] if db_version else "unknown",
            "stats": {
                "hazard_categories": categories_count,
                "containers": containers_count,
                "hazard_pairs": pairs_count
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# Container ID generation
@app.get("/generate-container-id/")
async def generate_container_id(department: str = None):
    """Generate a unique container ID with department abbreviation"""
    try:
        # Validate department abbreviation
        if not department:
            raise HTTPException(status_code=400, detail="Department abbreviation is required")
        
        # Get all existing container IDs
        existing_containers = await execute_query("SELECT container FROM containers")
        existing_ids = {row['container'] for row in existing_containers}
        
        import random
        import time
        # Try to generate unique ID (max 100 attempts)
        for _ in range(100):
            # Generate 4-digit random number
            num = random.randint(1000, 9999)
            
            # Format: CONT-{4digits}-{DEPT}
            container_id = f"CONT-{num}-{department}"
            
            # Check if unique
            if container_id not in existing_ids:
                logger.info("Generated container ID", container_id=container_id, department=department)
                return {"container_id": container_id}
        
        # Fallback with timestamp if all random attempts failed
        timestamp = str(int(time.time()))[-4:]
        fallback_id = f"CONT-{timestamp}-{department}"
        
        logger.warning("Using fallback container ID", container_id=fallback_id)
        return {"container_id": fallback_id}
        
    except Exception as e:
        logger.error("Error generating container ID", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error generating container ID: {str(e)}")

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize database and Redis connections on startup"""
    try:
        await get_db_pool()
        await get_redis_client()
        logger.info("Kinross Chemical Container Safety API started",
                   version="2.0.0",
                   database="PostgreSQL",
                   redis="Connected",
                   api_docs="http://localhost:8000/docs")
    except Exception as e:
        logger.error("Failed to start application", error=str(e))
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Close database connections on shutdown"""
    global db_pool
    if db_pool:
        await db_pool.close()
        logger.info("Database connections closed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host=os.getenv("API_HOST", "0.0.0.0"), 
        port=int(os.getenv("API_PORT", "8000")),
        reload=True
    )