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
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://kinross_user:kinross_secure_2025@localhost:5432/kinross_chemical")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:80,http://localhost").split(",")

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "")
redis_client = None

# SMTP Configuration  
SMTP_SERVER = os.getenv("SMTP_SERVER", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", ""))
NOTIFICATION_FROM_EMAIL = os.getenv("NOTIFICATION_FROM_EMAIL", "")

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = os.getenv("ALGORITHM", "")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "") )

# Create uploads directory for hazard logos
Path("uploads/hazard").mkdir(parents=True, exist_ok=True)

# FastAPI app
app = FastAPI(
    title="Kinross Chemical Container Safety API",
    description="Chemical Container Safety Assessment System for Kinross Gold Corporation",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
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

class User(BaseModel):
    id: int
    email: str
    name: str
    role: str  # 'admin', 'user', 'viewer'
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
async def submit_container(submission: ContainerSubmission):
    """Submit a new container with hazards and pair distances"""
    try:
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
                    INSERT INTO containers (department, location, submitted_by, container, container_type)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                """, submission.department, submission.location, submission.submitted_by, 
                    submission.container, submission.container_type)
                
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
async def get_containers():
    """Get all containers with their hazards and pairs"""
    try:
        # Get all containers
        container_rows = await execute_query("""
            SELECT * FROM containers 
            ORDER BY submitted_at DESC
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
                SELECT hp.*, 
                       ha.name as hazard_a_name, 
                       hb.name as hazard_b_name
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
                "hazards": hazards,
                "pairs": pairs
            })
        
        logger.info("Retrieved containers", count=len(containers))
        return containers
        
    except Exception as e:
        logger.error("Error fetching containers", error=str(e))
        raise HTTPException(status_code=500, detail=f"Error fetching containers: {str(e)}")

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
async def generate_container_id():
    """Generate a unique container ID following various patterns"""
    try:
        # Get all existing container IDs
        existing_containers = await execute_query("SELECT container FROM containers")
        existing_ids = {row['container'] for row in existing_containers}
        
        # Define possible patterns
        patterns = [
            "CONT-{num}",
            "CONTAINER-{letters}-{num}",
            "CONT-{num}-{letters}",
            "CONT-{num}-{letters2}"
        ]
        
        # Generate random components
        import random
        import string
        
        for _ in range(100):  # Try up to 100 times to find unique ID
            pattern = random.choice(patterns)
            num = random.randint(1001, 9999)
            letters = ''.join(random.choices(string.ascii_uppercase, k=3))
            letters2 = ''.join(random.choices(string.ascii_uppercase, k=3))
            
            # Generate ID based on pattern
            if pattern == "CONT-{num}":
                container_id = f"CONT-{num}"
            elif pattern == "CONTAINER-{letters}-{num}":
                container_id = f"CONTAINER-{letters}-{num}"
            elif pattern == "CONT-{num}-{letters}":
                container_id = f"CONT-{num}-{letters}"
            elif pattern == "CONT-{num}-{letters2}":
                container_id = f"CONT-{num}-{letters2}"
            
            # Check if unique
            if container_id not in existing_ids:
                return {"container_id": container_id}
        
        # Fallback if all attempts failed
        import time
        timestamp = str(int(time.time()))[-4:]
        fallback_id = f"CONT-{timestamp}-GEN"
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