#!/usr/bin/env python3
"""
Updated Chemical Container Safety Assessment API
With PostgreSQL database support and Docker containerization
"""

from fastapi import FastAPI, HTTPException, Depends, Header, File, UploadFile
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
import shutil
import uuid

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
Path("uploads/containers").mkdir(parents=True, exist_ok=True) # For container attachments

# Detect production mode
PRODUCTION = os.getenv("PRODUCTION", "false").lower() == "true"

# File upload settings
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB

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
    whatsapp_number: str  # WhatsApp contact number
    container: str
    container_type: str
    selected_hazards: List[int]  # List of hazard category IDs
    hazard_pairs: List[HazardPairData]
    # status: str
    # approval_comment: Optional[str]
    # approved_by: Optional[str]
    # approved_at: Optional[datetime]

class ReworkRequest(BaseModel):
    container_id: int
    rework_reason: str

class AttachmentInfo(BaseModel):
    id: int
    photo_type: str
    file_path: str
    file_name: str
    uploaded_at: datetime

class ContainerWithAttachments(BaseModel):
    id: int
    department: str
    location: str
    submitted_by: str
    container: str
    container_type: str
    status: str
    submitted_at: datetime
    attachments: List[AttachmentInfo] = []

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

class AdminContainerReviewRequest(BaseModel):
    review_comment: str

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

async def send_email(to_email: str, subject: str, body: str):
    """Generic email sender with HTML support"""
    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # Create HTML part
        html_part = MIMEText(body, 'html')
        msg.attach(html_part)
        
        # Send via SMTP
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, to_email, msg.as_string())
        server.quit()
        
        logger.info("Email sent successfully", to_email=to_email, subject=subject)
        
    except Exception as e:
        logger.error("Failed to send email", error=str(e), to_email=to_email)
        # Don't raise - we don't want email failures to block operations

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

# Add email notification function
async def send_deletion_notification(email: str, name: str, container_id: str, hod_name: str, reason: str):
    """Send notification to user when container is deleted by HOD"""
    try:
        msg = MIMEMultipart()
        msg['From'] = NOTIFICATION_FROM_EMAIL
        msg['To'] = email
        msg['Subject'] = f"Container {container_id} - Deleted"

        body = f"""
            Hello {name},

            Your container safety assessment for {container_id} has been deleted by HOD.

            Deleted by: {hod_name}
            Reason: {reason}

            If you believe this was done in error, please contact the HOD or Safety Team.

            Best regards,
            Kinross Chemical Safety Team
        """

        msg.attach(MIMEText(body, 'plain'))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.sendmail(NOTIFICATION_FROM_EMAIL, email, msg.as_string())
        server.quit()

        logger.info("Deletion notification sent", email=email, container_id=container_id)

    except Exception as e:
        logger.error("Failed to send deletion notification", error=str(e))

def validate_image_file(file: UploadFile) -> bool:
    """Validate uploaded image file"""
    # Check file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Check content type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    return True

async def save_attachment_file(file: UploadFile, container_id: int, photo_type: str) -> tuple:
    """Save uploaded file and return (file_path, file_name, file_size)"""
    validate_image_file(file)
    
    # Create directory for this container
    container_dir = Path(f"uploads/containers/{container_id}")
    container_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    ext = file.filename.rsplit('.', 1)[-1].lower()
    unique_filename = f"{photo_type}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = container_dir / unique_filename
    
    # Save file
    file_size = 0
    with file_path.open("wb") as buffer:
        content = await file.read()
        file_size = len(content)
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400, 
                detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        buffer.write(content)
    
    # Return relative path for database
    relative_path = f"/uploads/containers/{container_id}/{unique_filename}"
    return relative_path, file.filename, file_size

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
                    INSERT INTO containers (department, location, submitted_by, whatsapp_number, container, container_type, status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING id
                """, submission.department, submission.location, submission.submitted_by, 
                    submission.whatsapp_number, submission.container, submission.container_type, 'pending_review')
                
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
        if current_user['role'] in ['hod', 'admin']:
            container_query = """SELECT id, department, location, submitted_by, whatsapp_number,
                    container, container_type, submitted_at, status, 
                    approval_comment, approved_by, approved_at,
                    rework_reason, rework_count, reworked_by, reworked_at,
                    admin_reviewer, admin_review_date, admin_review_comment
                    FROM containers ORDER BY submitted_at DESC"""
            container_params = []
        else:
            container_query = """SELECT id, department, location, submitted_by, whatsapp_number, 
                    container, container_type, submitted_at, status, 
                    approval_comment, approved_by, approved_at,
                    rework_reason, rework_count, reworked_by, reworked_at,
                    admin_reviewer, admin_review_date, admin_review_comment
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
                "whatsapp_number": container_row['whatsapp_number'],
                "status": container_row.get('status', 'pending'),
                "approval_comment": container_row.get('approval_comment'),
                "approved_by": container_row.get('approved_by'),
                "approved_at": container_row['approved_at'].isoformat() if container_row.get('approved_at') else None,
                "rework_reason": container_row.get('rework_reason'),        
                "rework_count": container_row.get('rework_count'),          
                "reworked_by": container_row.get('reworked_by'),            
                "reworked_at": container_row.get('reworked_at').isoformat() if container_row.get('reworked_at') else None,
                "admin_reviewer": container_row['admin_reviewer'],
                "admin_review_date": container_row['admin_review_date'].isoformat() if container_row['admin_review_date'] else None,
                "admin_review_comment": container_row['admin_review_comment'],
                "hazards": hazards,
                "pairs": pairs
            })
        
        logger.info("Retrieved containers", count=len(containers), user_role=current_user['role'])
        return containers
        
    except Exception as e:
        logger.error("Error fetching containers", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error fetching containers: {str(e)}")

# Attachment Routes
@app.post("/containers/{container_id}/attachments")
async def upload_attachment(
    container_id: int,
    photo_type: str,
    file: UploadFile = File(...),
    authorization: str = Header(None)
):
    """Upload a single attachment photo for a container"""
    # user = await get_current_user(authorization)
    current_user = await get_current_user_from_token(authorization)
    
    # Validate photo_type
    valid_types = ['front', 'inside', 'side']
    if photo_type not in valid_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid photo_type. Must be one of: {', '.join(valid_types)}"
        )
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Check if container exists and user has permission
        container = await conn.fetchrow(
            "SELECT * FROM containers WHERE id = $1", container_id
        )
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Check permission: only container owner, HOD, or admin can upload
        if current_user['role'] not in ['hod', 'admin'] and container['submitted_by'] != current_user['name']:
            raise HTTPException(status_code=403, detail="Not authorized to upload attachments")
        
        # Save file
        file_path, file_name, file_size = await save_attachment_file(file, container_id, photo_type)
        
        # Delete old attachment of same type if exists
        await conn.execute(
            "DELETE FROM container_attachments WHERE container_id = $1 AND photo_type = $2",
            container_id, photo_type
        )
        
        # Insert new attachment record
        attachment = await conn.fetchrow("""
            INSERT INTO container_attachments 
            (container_id, photo_type, file_path, file_name, file_size, uploaded_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, photo_type, file_path, file_name, uploaded_at
        """, container_id, photo_type, file_path, file_name, file_size, current_user['name'])
        
        return {
            "success": True,
            "attachment": {
                "id": attachment['id'],
                "photo_type": attachment['photo_type'],
                "file_path": attachment['file_path'],
                "file_name": attachment['file_name'],
                "uploaded_at": attachment['uploaded_at'].isoformat()
            }
        }

@app.get("/containers/{container_id}/attachments")
async def get_attachments(
    container_id: int,
    authorization: str = Header(None)
):
    """Get all attachments for a container"""
    # user = await get_current_user(authorization)
    current_user = await get_current_user_from_token(authorization)
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Check if container exists
        container = await conn.fetchrow(
            "SELECT * FROM containers WHERE id = $1", container_id
        )
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Get attachments
        attachments = await conn.fetch("""
            SELECT id, photo_type, file_path, file_name, file_size, uploaded_by, uploaded_at
            FROM container_attachments
            WHERE container_id = $1
            ORDER BY photo_type
        """, container_id)
        
        return {
            "container_id": container_id,
            "attachments": [
                {
                    "id": att['id'],
                    "photo_type": att['photo_type'],
                    "file_path": att['file_path'],
                    "file_name": att['file_name'],
                    "file_size": att['file_size'],
                    "uploaded_by": att['uploaded_by'],
                    "uploaded_at": att['uploaded_at'].isoformat()
                }
                for att in attachments
            ]
        }

@app.delete("/containers/{container_id}/attachments/{photo_type}")
async def delete_attachment(
    container_id: int,
    photo_type: str,
    authorization: str = Header(None)
):
    """Delete a specific attachment"""
    # user = await get_current_user(authorization)
    current_user = await get_current_user_from_token(authorization)
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Check permission
        container = await conn.fetchrow(
            "SELECT * FROM containers WHERE id = $1", container_id
        )
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        if current_user['role'] not in ['hod', 'admin'] and container['submitted_by'] != current_user['name']:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Get attachment to delete file
        attachment = await conn.fetchrow(
            "SELECT file_path FROM container_attachments WHERE container_id = $1 AND photo_type = $2",
            container_id, photo_type
        )
        
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")
        
        # Delete file from filesystem
        file_path = Path(attachment['file_path'].lstrip('/'))
        if file_path.exists():
            file_path.unlink()
        
        # Delete from database
        await conn.execute(
            "DELETE FROM container_attachments WHERE container_id = $1 AND photo_type = $2",
            container_id, photo_type
        )
        
        return {"success": True, "message": "Attachment deleted"}

# generate PDF download endpoint
@app.get("/container-pdf/{container_id}")
async def download_container_pdf(container_id: int):
    """Direct download endpoint for container PDF via QR code"""
    try:
        # Get container data
        container = await execute_single(
            "SELECT * FROM containers WHERE id = $1", 
            container_id
        )
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Return HTML page that triggers PDF download
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Container {container['container']} - Download PDF</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #1E3A5F 0%, #162B47 100%);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                }}
                .container {{
                    background: white;
                    color: #1E3A5F;
                    padding: 3rem;
                    border-radius: 12px;
                    text-align: center;
                    max-width: 500px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }}
                h1 {{ margin: 0 0 1rem 0; color: #D4A553; }}
                p {{ font-size: 1.1rem; margin: 1rem 0; }}
                .info {{ 
                    background: #f5f5f5; 
                    padding: 1rem; 
                    border-radius: 8px; 
                    margin: 1.5rem 0;
                }}
                .download-btn {{
                    display: inline-block;
                    background: linear-gradient(135deg, #D4A553, #B8933A);
                    color: white;
                    padding: 1rem 2rem;
                    border-radius: 6px;
                    text-decoration: none;
                    font-weight: bold;
                    font-size: 1.1rem;
                    margin-top: 1rem;
                    cursor: pointer;
                    border: none;
                }}
                .download-btn:hover {{
                    background: linear-gradient(135deg, #B8933A, #D4A553);
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🛡️ Container Safety Label</h1>
                <div class="info">
                    <p><strong>Container ID:</strong> {container['container']}</p>
                    <p><strong>Department:</strong> {container['department']}</p>
                    <p><strong>Location:</strong> {container['location']}</p>
                </div>
                <p>Click the button below to download the safety label PDF</p>
                <button class="download-btn" onclick="window.location.href='/?download={container_id}'">
                    📄 Download PDF
                </button>
                <p style="font-size: 0.9rem; margin-top: 2rem; color: #666;">
                    Kinross Gold Corporation<br/>
                    Chemical Safety Assessment System
                </p>
            </div>
        </body>
        </html>
        """
        
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html_content)
        
    except Exception as e:
        logger.error("Error in PDF download endpoint", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

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

# Preview Endpoint
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
        
        if current_user['role'] != 'hod':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        container_rows = await execute_query("""
            SELECT c.*, u.name as submitter_name, u.email as submitter_email
            FROM containers c 
            JOIN users u ON c.submitted_by = u.name
            WHERE c.status IN ('pending_review', 'pending')
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
                "whatsapp_number": container_row['whatsapp_number'], # ✅ INCLUDE PHONE NUMBER
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
        
        if current_user['role'] != 'hod':
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
        
        # ADD THIS: Check current container status
        container = await execute_single(
            "SELECT status, container FROM containers WHERE id = $1",
            container_id
        )
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Only allow approval of pending, admin_reviewed, or rework_requested containers
        if container['status'] not in ['pending_review', 'pending', 'rework_requested']:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot approve container with status '{container['status']}'. Container may have already been processed."
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

# Rework Request Endpoints
@app.post("/containers/{container_id}/rework")
async def request_rework(
    container_id: int,
    rework_request: ReworkRequest,
    authorization: str = Header(None)
):
    """Request rework for a container (Admin or HOD)"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        # Allow both admin and HOD to rework
        if current_user['role'] not in ['admin', 'hod']:
            raise HTTPException(status_code=403, detail="Admin or HOD access required")
        
        # Get container
        container = await execute_single(
            "SELECT * FROM containers WHERE id = $1",
            container_id
        )
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Admin can only rework pending_review, HOD can rework pending_review or pending
        if current_user['role'] == 'admin' and container['status'] != 'pending_review':
            raise HTTPException(
                status_code=400,
                detail="Admin can only rework containers in pending_review status"
            )
        
        if current_user['role'] == 'hod' and container['status'] not in ['pending_review', 'pending']:
            raise HTTPException(
                status_code=400,
                detail="Container cannot be reworked in current status"
            )
        
        # Update container status to rework_requested
        await execute_command("""
            UPDATE containers
            SET status = 'rework_requested',
                rework_reason = $1,
                rework_count = COALESCE(rework_count, 0) + 1,
                reworked_by = $2,
                reworked_at = $3
            WHERE id = $4
        """,
            rework_request.rework_reason.strip(),
            current_user['name'],
            datetime.utcnow(),
            container_id
        )
        
        # Get submitter email for notification
        submitter = await execute_single(
            "SELECT email, name FROM users WHERE name = $1",
            container['submitted_by']
        )
        
        if submitter:
                await send_email(
                    to_email=submitter['email'],
                    subject=f"⚠️ Rework Required - Container #{container['container']}",
                    body=f"""
                    <h2>Container Submission Requires Rework</h2>
                    <p>Your container safety assessment has been reviewed and requires modifications.</p>
                    
                    <h3>Container Details:</h3>
                    <ul>
                        <li><strong>Container ID:</strong> {container['container']}</li>
                        <li><strong>Department:</strong> {container['department']}</li>
                        <li><strong>Location:</strong> {container['location']}</li>
                        <li><strong>Reviewed by:</strong> {current_user['name']}</li>
                    </ul>
                    
                    <h3>Reason for Rework:</h3>
                    <p style="background: #fff3e0; padding: 15px; border-left: 4px solid #ff9800; margin: 15px 0;">
                        {rework_request.rework_reason.strip()}
                    </p>
                    
                    <p><strong>Action Required:</strong> Please log in to the system, review the feedback, and resubmit your assessment with the requested changes.</p>
                    
                    <p>This is rework request #{container['rework_count'] + 1} for this container.</p>
                    
                    <p>Best regards,<br>Kinross Chemical Safety System</p>
                    """
                )
        
        logger.info(
            "Container rework requested",
            container_id=container_id,
            reworked_by=current_user['name']
        )
        
        return {"message": "Container sent for rework successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error requesting rework", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error requesting rework: {str(e)}")

@app.post("/containers/{container_id}/admin-review")
async def admin_review_container(
    container_id: int,
    review_request: AdminContainerReviewRequest,
    authorization: str = Header(None)
):
    """Admin reviews a container and changes status from pending_review to pending"""
    try:
        current_user = await get_current_user_from_token(authorization)

        if current_user['role'] != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")

        if not review_request.review_comment or review_request.review_comment.strip() == "":
            raise HTTPException(status_code=400, detail="Review comment is required")

        if len(review_request.review_comment.strip()) < 10:
            raise HTTPException(
                status_code=400,
                detail="Review comment must be at least 10 characters long"
            )

        container = await execute_single(
            "SELECT * FROM containers WHERE id = $1",
            container_id
        )

        if not container:
            raise HTTPException(status_code=404, detail="Container not found")

        # Only pending_review containers can be reviewed by admin
        if container['status'] != 'pending_review':
            raise HTTPException(
                status_code=400,
                detail=f"Container cannot be reviewed in {container['status']} status"
            )

        # Change status from pending_review to pending (ready for HOD)
        await execute_command("""
            UPDATE containers
            SET status = 'pending',
                admin_reviewer = $1,
                admin_review_date = $2,
                admin_review_comment = $3
            WHERE id = $4
        """,
            current_user['name'],
            datetime.utcnow(),
            review_request.review_comment.strip(),
            container_id
        )
        
        # Get HOD users to notify
        # hod_users = await execute_query(
        #     "SELECT email, name FROM users WHERE role = 'hod' AND department = $1 AND active = true",
        #     "Health & Safety"
        # )
        
        # Send email to HOD
        if HOD_EMAILS and HOD_EMAILS[0]:  # Check if HOD_EMAILS is configured
            for hod_email in HOD_EMAILS:
                logger.info("Notifying HOD after admin review", hod_email=hod_email, container_id=container['container'])
                hod = await execute_single(
                    "SELECT email, name FROM users WHERE email = $1 AND active = true",
                    hod_email.lower().strip()
                )
                # if hod['email']:
                try:
                    hod_email_body = f"""
Hello {hod['name']},

A container has been reviewed by Admin and is ready for your final approval.

Container Details:
- Container ID: {container['container']}
- Department: {container['department']}
- Location: {container['location']}
- Submitted by: {container['submitted_by']}
- Reviewed by: {current_user['name']} (Admin)

Admin Review Comments:
{review_request.review_comment.strip()}

Please log in to the system to approve or reject this container.

Best regards,
Kinross Safety System
                    """
                    await send_email(
                        to_email=hod_email,
                        subject=f"✅ Container Ready for HOD Approval - {container['container']}",
                        body=hod_email_body
                    )
                    
                    logger.info("HOD notification sent after admin review", 
                            email=hod['email'],
                            container_id=container['container'])
                    
                except Exception as e:
                    logger.error(f"Failed to send HOD notification", error=str(e))
        
        # Notify submitter that their container is progressing
        submitter = await execute_single(
            "SELECT email FROM users WHERE name = $1", 
            container['submitted_by']
        )
        
        if submitter and submitter['email']:
            try:
                submitter_email_body = f"""
Hello {container['submitted_by']},

Your container submission has been reviewed by the Admin team and is now awaiting HOD approval.

Container Details:
  - Container ID: {container['container']}
  - Department: {container['department']}
  - Location: {container['location']}
  - Reviewed by: {current_user['name']} (Admin)

Status: Admin Reviewed ✅

Your submission will be reviewed by the HOD for final approval.

Best regards,
Kinross Safety Team
                """
                await send_email(
                    submitter['email'],
                    f"📋 Container Under Review - {container['container']}",
                    body=submitter_email_body
                )
                
            except Exception as e:
                logger.error("Failed to send submitter notification", error=str(e))
        
        return {
            "success": True,
            "message": f"Container reviewed and forwarded to HOD for approval",
            "container_id": container_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error processing admin review", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error processing admin review: {str(e)}")

@app.put("/containers/{container_id}/update")
async def update_container(
    container_id: int,
    container_data: ContainerSubmission,
    authorization: str = Header(None)
):
    """Update a reworked container and change status back to pending"""
    user = await get_current_user_from_token(authorization)
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Get existing container
        existing = await conn.fetchrow(
            "SELECT * FROM containers WHERE id = $1", container_id
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Only the submitter can update their reworked container
        if existing['submitted_by'] != user['name']:
            raise HTTPException(
                status_code=403, 
                detail="Only the original submitter can update this container"
            )
        
        # Only rework_requested containers can be updated
        if existing['status'] != 'rework_requested':
            raise HTTPException(
                status_code=400, 
                detail="Only containers requiring rework can be updated"
            )
        
        try:
            async with conn.transaction():
                # Update container - reset to pending status
                await conn.execute("""
                    UPDATE containers 
                    SET department = $1,
                        location = $2,
                        container_type = $3,
                        whatsapp_number = $4,
                        status = 'pending_review',
                        rework_reason = NULL,
                        reworked_by = NULL,
                        reworked_at = NULL
                    WHERE id = $5
                """, 
                container_data.department,
                container_data.location,
                container_data.container_type,
                container_data.whatsapp_number,
                container_id)
                
                # Delete old hazards
                await conn.execute(
                    "DELETE FROM container_hazards WHERE container_id = $1",
                    container_id
                )
                
                # Insert new hazards
                for hazard_id in container_data.selected_hazards:
                    await conn.execute("""
                        INSERT INTO container_hazards (container_id, hazard_category_id)
                        VALUES ($1, $2)
                    """, container_id, hazard_id)
                
                # Delete old pairs
                await conn.execute(
                    "DELETE FROM hazard_pairs WHERE container_id = $1",
                    container_id
                )
                
                # Insert new pairs with status calculation (same as submit_container)
                if container_data.hazard_pairs:
                    for pair_data in container_data.hazard_pairs:
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

            # Build email data structure
            await send_email(
                to_email=SAFETY_TEAM_EMAIL,
                subject=f"🔄 Container Resubmitted - {existing['container']}",
                body=f"""
                <h2>Container Has Been Resubmitted After Rework</h2>
                <p>A container that required rework has been updated and resubmitted for approval.</p>
                
                <h3>Container Details:</h3>
                <ul>
                    <li><strong>Container ID:</strong> {existing['container']}</li>
                    <li><strong>Department:</strong> {container_data.department}</li>
                    <li><strong>Location:</strong> {container_data.location}</li>
                    <li><strong>Resubmitted by:</strong> {user['name']}</li>
                    <li><strong>Rework Count:</strong> {existing['rework_count'] or 0}</li>
                </ul>
                
                <p>Please log in to review the updated submission.</p>
                
                <p>Best regards,<br>Kinross Chemical Safety System</p>
                """
            )            
            
            logger.info("Container updated and resubmitted", 
                       container_id=container_id,
                       user=user['name'],
                       rework_count=existing['rework_count'])
            
            return {
                "success": True,
                "message": "Container updated and resubmitted for approval",
                "container_id": container_id
            }
            
        except Exception as e:
            logger.error("Error updating container", error=str(e), container_id=container_id)
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# Delete Containers Endpoint
@app.delete("/containers/{container_id}")
async def delete_container(
    container_id: int,
    deletion_data: dict,  # Add this parameter
    authorization: str = Header(None)
):
    """Delete a container (HOD only) with reason"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] != 'hod':
            raise HTTPException(status_code=403, detail="HOD access required")
        
        # Validate deletion reason
        deletion_reason = deletion_data.get('deletion_reason', '')
        if not deletion_reason or len(deletion_reason.strip()) < 10:
            raise HTTPException(
                status_code=400,
                detail="Deletion reason must be at least 10 characters long"
            )
        
        # Check if container exists and get submitter info
        container = await execute_single(
            "SELECT c.*, u.email, u.name as submitter_name FROM containers c JOIN users u ON c.submitted_by = u.name WHERE c.id = $1",
            container_id
        )
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Delete related records first (foreign key constraints)
                await conn.execute("DELETE FROM hazard_pairs WHERE container_id = $1", container_id)
                await conn.execute("DELETE FROM container_hazards WHERE container_id = $1", container_id)
                await conn.execute("DELETE FROM container_attachments WHERE container_id = $1", container_id)
                await conn.execute("DELETE FROM containers WHERE id = $1", container_id)
        
        # Send notification to submitter
        await send_deletion_notification(
            container['email'],
            container['submitter_name'],
            container['container'],
            current_user['name'],
            deletion_reason.strip()
        )
        
        logger.info("Container deleted", container_id=container_id, deleted_by=current_user['name'], reason=deletion_reason.strip())
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

# Analytics Endpoint
@app.get("/analytics/dashboard")
async def get_analytics_dashboard(authorization: str = Header(None)):
    """Get analytics data for dashboard (HOD only)"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] != 'hod':
            raise HTTPException(status_code=403, detail="HOD access required")
        
        # Get all containers with details
        containers = await execute_query("""
            SELECT 
                c.id,
                c.department,
                c.location,
                c.submitted_by,
                c.container_type,
                c.submitted_at,
                c.status
            FROM containers c
            ORDER BY c.submitted_at DESC
        """)
        
        # Get hazards for each container
        analytics_data = []
        for container in containers:
            hazards = await execute_query("""
                SELECT h.name, h.hazard_class
                FROM hazard_categories h
                JOIN container_hazards ch ON h.id = ch.hazard_category_id
                WHERE ch.container_id = $1
            """, container['id'])
            
            analytics_data.append({
                "id": container['id'],
                "department": container['department'],
                "location": container['location'],
                "submitted_by": container['submitted_by'],
                "container_type": container['container_type'],
                "submitted_at": container['submitted_at'].isoformat(),
                "status": container['status'],
                "hazards": [{"name": h['name'], "hazard_class": h['hazard_class']} for h in hazards]
            })
        
        logger.info("Analytics data retrieved", count=len(analytics_data), user=current_user['name'])
        return analytics_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching analytics data", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error fetching analytics data: {str(e)}")

# User Management Endpoints
@app.get("/users/")
async def get_all_users(authorization: str = Header(None)):
    """Get all users - Admin and HOD only"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['admin', 'hod']:
            raise HTTPException(status_code=403, detail="Admin or HOD access required")
        
        users = await execute_query("""
            SELECT id, email, name, role, department, active, created_at, updated_at
            FROM users
            ORDER BY created_at DESC
        """)
        
        return [dict(user) for user in users]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching users", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/users/")
async def create_user(
    email: Optional[str] = None,
    name: Optional[str] = None,
    role: Optional[str] = None,
    department: Optional[str] = None,
    authorization: str = Header(None)
):
    """Create new user - Admin and HOD only"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['admin', 'hod']:
            raise HTTPException(status_code=403, detail="Admin or HOD access required")
        
        # Validate role
        if role not in ['hod', 'admin', 'user', 'viewer']:
            raise HTTPException(status_code=400, detail="Invalid role")
        
        # Check if user already exists
        existing_user = await execute_single(
            "SELECT id FROM users WHERE email = $1", 
            email.lower().strip()
        )
        
        if existing_user:
            raise HTTPException(status_code=400, detail="User with this email already exists")
        
        # Create user
        user_id = await execute_value("""
            INSERT INTO users (email, name, role, department, active)
            VALUES ($1, $2, $3, $4, true)
            RETURNING id
        """, email.lower().strip(), name, role, department)
        
        logger.info("User created", user_id=user_id, created_by=current_user['name'])
        
        return {
            "message": "User created successfully",
            "user_id": user_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating user", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/users/{user_id}")
async def update_user(
    user_id: int,
    email: Optional[str] = None,
    name: Optional[str] = None,
    role: Optional[str] = None,
    department: Optional[str] = None,
    active: Optional[bool] = None,
    authorization: str = Header(None)
):
    """Update user - Admin and HOD only"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['admin', 'hod']:
            raise HTTPException(status_code=403, detail="Admin or HOD access required")
        
        # Get existing user
        user = await execute_single("SELECT * FROM users WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Validate role if provided
        if role and role not in ['hod', 'admin', 'user', 'viewer']:
            raise HTTPException(status_code=400, detail="Invalid role")
        
        # Build update query dynamically
        updates = []
        params = []
        param_count = 1
        
        if email is not None:
            updates.append(f"email = ${param_count}")
            params.append(email.lower().strip())
            param_count += 1
        
        if name is not None:
            updates.append(f"name = ${param_count}")
            params.append(name)
            param_count += 1
        
        if role is not None:
            updates.append(f"role = ${param_count}")
            params.append(role)
            param_count += 1
        
        if department is not None:
            updates.append(f"department = ${param_count}")
            params.append(department)
            param_count += 1
        
        if active is not None:
            updates.append(f"active = ${param_count}")
            params.append(active)
            param_count += 1
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        # Always update timestamp
        updates.append(f"updated_at = ${param_count}")
        params.append(datetime.utcnow())
        param_count += 1
        
        # Add user_id as last parameter
        params.append(user_id)
        
        # Build final query
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ${param_count}"
        
        await execute_command(query, *params)
        
        logger.info("User updated", user_id=user_id, updated_by=current_user['name'])
        
        return {"message": "User updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating user", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/users/{user_id}")
async def delete_user(user_id: int, authorization: str = Header(None)):
    """Delete user - Admin and HOD only"""
    try:
        current_user = await get_current_user_from_token(authorization)
        
        if current_user['role'] not in ['admin', 'hod']:
            raise HTTPException(status_code=403, detail="Admin or HOD access required")
        
        # Check if user exists
        user = await execute_single("SELECT * FROM users WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent deleting yourself
        if user_id == current_user['id']:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
        # Delete user
        await execute_command("DELETE FROM users WHERE id = $1", user_id)
        
        logger.info("User deleted", user_id=user_id, deleted_by=current_user['name'])
        
        return {"message": "User deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting user", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

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