#!/usr/bin/env python3
"""
Updated Chemical Container Safety Assessment API
With corrected hazard categories and compatibility matrix
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import sqlite3
import json
import os
from pathlib import Path

# Create uploads directory for hazard logos
Path("uploads/hazard").mkdir(parents=True, exist_ok=True)

# FastAPI app
app = FastAPI(title="Kinross Chemical Container Safety API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Database file
DATABASE_PATH = "chemical_compatibility.db"

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

# Database functions
def get_db_connection():
    """Get SQLite database connection"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # Enable dict-like access
    return conn

def init_database():
    """Initialize database with updated hazard categories"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enable SQLite optimizations
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    
    # Create hazard categories table (updated schema)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hazard_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            hazard_class TEXT NOT NULL,
            subclass TEXT,
            description TEXT,
            logo_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Check if containers table exists and migrate if needed
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='containers'")
    table_exists = cursor.fetchone()
    
    if table_exists:
        # Check existing columns
        cursor.execute("PRAGMA table_info(containers)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'container' not in columns or 'container_type' not in columns:
            print("🔄 Migrating containers table...")
            
            cursor.execute("""
                CREATE TABLE containers_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    department TEXT NOT NULL,
                    location TEXT NOT NULL,
                    submitted_by TEXT NOT NULL,
                    container TEXT NOT NULL DEFAULT 'Unknown',
                    container_type TEXT NOT NULL DEFAULT '20ft',
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            try:
                cursor.execute("""
                    INSERT INTO containers_new (id, department, location, submitted_by, submitted_at)
                    SELECT id, department, location, submitted_by, submitted_at FROM containers
                """)
                print("✅ Migrated existing container data")
            except Exception as e:
                print(f"ℹ️  No existing data to migrate: {e}")
            
            cursor.execute("DROP TABLE containers")
            cursor.execute("ALTER TABLE containers_new RENAME TO containers")
            print("✅ Migration completed!")
    else:
        cursor.execute("""
            CREATE TABLE containers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                department TEXT NOT NULL,
                location TEXT NOT NULL,
                submitted_by TEXT NOT NULL,
                container TEXT NOT NULL,
                container_type TEXT NOT NULL,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    
    # Create container_hazards table (updated foreign key)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='container_hazards'")
    if not cursor.fetchone():
        cursor.execute("""
            CREATE TABLE container_hazards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                container_id INTEGER NOT NULL,
                hazard_category_id INTEGER NOT NULL,
                FOREIGN KEY (container_id) REFERENCES containers (id),
                FOREIGN KEY (hazard_category_id) REFERENCES hazard_categories (id)
            )
        """)
    
    # Create hazard_pairs table (updated foreign keys)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='hazard_pairs'")
    if not cursor.fetchone():
        cursor.execute("""
            CREATE TABLE hazard_pairs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                container_id INTEGER NOT NULL,
                hazard_category_a_id INTEGER NOT NULL,
                hazard_category_b_id INTEGER NOT NULL,
                distance REAL NOT NULL,
                is_isolated BOOLEAN NOT NULL,
                min_required_distance REAL,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (container_id) REFERENCES containers (id),
                FOREIGN KEY (hazard_category_a_id) REFERENCES hazard_categories (id),
                FOREIGN KEY (hazard_category_b_id) REFERENCES hazard_categories (id)
            )
        """)
    
    # Drop and recreate hazard categories with updated classification
    cursor.execute("DELETE FROM hazard_categories")
    
    # Updated hazard categories based on your requirements:
    # - Removed Oxidizing Gas
    # - Updated Gas subclasses to 2.1, 2.2, 2.3
    # - Updated Class 4 subclasses to 4.1, 4.2, 4.3
    hazard_categories = [
        ("Flammable Gas", "2", "2.1", "Gases which are flammable in air", "/uploads/hazard/class2_flammable_gas.png"),
        ("Non-Flammable Non-Toxic Gas", "2", "2.2", "Gases which are not flammable and not toxic", "/uploads/hazard/class2_nonflammable_gas.png"),
        ("Toxic Gas", "2", "2.3", "Gases which are known to be toxic or corrosive to humans", "/uploads/hazard/class2_toxic_gas.png"),
        ("Flammable Liquid", "3", "3", "Liquids having a flash point not more than 60°C", "/uploads/hazard/class3_flammable_liquid.png"),
        ("Flammable Solid", "4", "4.1", "Solid materials which can be readily ignited", "/uploads/hazard/class4_flammable_solid.png"),
        ("Spontaneously Combustible", "4", "4.2", "Substances liable to spontaneous combustion", "/uploads/hazard/class4_spontaneously_combustible.png"),
        ("Dangerous When Wet", "4", "4.3", "Substances which become spontaneously flammable when wet", "/uploads/hazard/class4_dangerous_when_wet.png"),
        ("Oxidizing Agent", "5", "5.1", "Substances which yield oxygen readily to support combustion", "/uploads/hazard/class5_1_oxidizing_agent.png"),
        ("Organic Peroxide", "5", "5.2", "Organic substances containing bivalent oxygen structure", "/uploads/hazard/class5_2_organic_peroxide.png"),
        ("Toxic", "6", "6", "Substances which are liable to cause death or serious injury if swallowed, inhaled, or absorbed through skin", "/uploads/hazard/class6_toxic.png"),
        ("Corrosive", "8", "8", "Substances which cause destruction to human skin, metals, or other materials", "/uploads/hazard/class8_corrosive.png")
    ]
    
    cursor.executemany("""
        INSERT INTO hazard_categories (name, hazard_class, subclass, description, logo_path)
        VALUES (?, ?, ?, ?, ?)
    """, hazard_categories)
    
    print("✅ Initialized database with updated 11 hazard categories")
    
    conn.commit()
    conn.close()

def calculate_hazard_status(class_a: str, class_b: str, distance: float) -> tuple[str, bool, float]:
    """
    Calculate safety status based on hazard classes and distance
    Based on the updated compatibility matrix and your notes
    Returns: (status, is_isolated, min_required_distance)
    """
    
    # Updated compatibility matrix based on the image and your notes
    # Key: (class_a, class_b) -> (action, min_distance_meters)
    # Actions: "OK_TOGETHER", "SEGREGATE_3M", "SEGREGATE_5M", "ISOLATE", "MAY_NOT_COMPATIBLE"
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
        ("2.3", "2.3"): ("MAY_NOT_COMPATIBLE", 3.0), # "MAY NOT be compatible, check goods"
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
        ("4.1", "8"): ("MAY_NOT_COMPATIBLE", 3.0), # "MAY NOT be compatible, check goods"
        
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
        ("5.1", "5.2"): ("ISOLATE", float('inf')),  # Changed from SEGREGATE_5M to ISOLATE per your note
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
        # Per your note: when Oxidizer Agent segregates with 5M -> isolate
        # But this case should already be handled as ISOLATE above
        min_distance = 5.0
    
    # Check distance requirements for segregation
    if distance >= min_distance:
        return "safe", False, min_distance
    elif distance >= min_distance * 0.6:  # 60% of required distance
        return "caution", False, min_distance
    else:
        return "danger", False, min_distance

# Routes
@app.get("/")
def read_root():
    return {"message": "Kinross Chemical Container Safety API", "status": "running"}

@app.get("/hazard-categories/", response_model=List[HazardCategoryResponse])
def get_hazard_categories():
    """Get all hazard categories"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, hazard_class, subclass, description, logo_path FROM hazard_categories ORDER BY hazard_class, subclass, name")
    categories = []
    
    for row in cursor.fetchall():
        categories.append(HazardCategoryResponse(
            id=row['id'],
            name=row['name'],
            hazard_class=row['hazard_class'],
            subclass=row['subclass'],
            description=row['description'],
            logo_path=row['logo_path']
        ))
    
    conn.close()
    return categories

@app.post("/containers/")
def submit_container(submission: ContainerSubmission):
    """Submit a new container with hazards and pair distances"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        print(f"📝 Submitting container: {submission.department} - {submission.location}")
        print(f"🚛 Container: {submission.container} ({submission.container_type})")
        print(f"⚠️  Selected hazards: {submission.selected_hazards}")
        print(f"📏 Hazard pairs: {len(submission.hazard_pairs)}")
        
        # Create container record
        cursor.execute("""
            INSERT INTO containers (department, location, submitted_by, container, container_type)
            VALUES (?, ?, ?, ?, ?)
        """, (submission.department, submission.location, submission.submitted_by, 
              submission.container, submission.container_type))
        
        container_id = cursor.lastrowid
        print(f"✅ Container created with ID: {container_id}")
        
        # Add selected hazards
        for hazard_id in submission.selected_hazards:
            cursor.execute("""
                INSERT INTO container_hazards (container_id, hazard_category_id)
                VALUES (?, ?)
            """, (container_id, hazard_id))
        
        # Add hazard pairs with distances and status
        if submission.hazard_pairs:
            for pair_data in submission.hazard_pairs:
                # Get hazard category names for status calculation
                cursor.execute("SELECT name FROM hazard_categories WHERE id = ?", (pair_data.hazard_category_a_id,))
                hazard_a_row = cursor.fetchone()
                
                cursor.execute("SELECT name FROM hazard_categories WHERE id = ?", (pair_data.hazard_category_b_id,))
                hazard_b_row = cursor.fetchone()
                
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
                
                cursor.execute("""
                    INSERT INTO hazard_pairs (container_id, hazard_category_a_id, hazard_category_b_id, 
                                            distance, is_isolated, min_required_distance, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (container_id, pair_data.hazard_category_a_id, pair_data.hazard_category_b_id, 
                      pair_data.distance, is_isolated, min_dist_value, status))
        
        conn.commit()
        
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
        conn.rollback()
        print(f"❌ Error saving container data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error saving container data: {str(e)}")
    finally:
        conn.close()

@app.get("/containers/")
def get_containers():
    """Get all containers with their hazards and pairs"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get all containers
    cursor.execute("SELECT * FROM containers ORDER BY submitted_at DESC")
    containers = []
    
    for container_row in cursor.fetchall():
        container_id = container_row['id']
        
        # Get hazards for this container
        cursor.execute("""
            SELECT h.name, h.hazard_class, h.subclass 
            FROM hazard_categories h
            JOIN container_hazards ch ON h.id = ch.hazard_category_id
            WHERE ch.container_id = ?
        """, (container_id,))
        hazards = [{"name": row['name'], "hazard_class": row['hazard_class'], "subclass": row['subclass']} for row in cursor.fetchall()]
        
        # Get pairs for this container
        cursor.execute("""
            SELECT hp.*, 
                   ha.name as hazard_a_name, 
                   hb.name as hazard_b_name
            FROM hazard_pairs hp
            JOIN hazard_categories ha ON hp.hazard_category_a_id = ha.id
            JOIN hazard_categories hb ON hp.hazard_category_b_id = hb.id
            WHERE hp.container_id = ?
        """, (container_id,))
        
        pairs = []
        for pair_row in cursor.fetchall():
            min_dist = pair_row['min_required_distance']
            if min_dist is None:
                min_dist = float('inf')
            
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
            "submitted_at": container_row['submitted_at'],
            "hazards": hazards,
            "pairs": pairs
        })
    
    conn.close()
    return containers

@app.post("/preview-status/")
def get_preview_status(hazard_a_id: int, hazard_b_id: int, distance: float):
    """Get real-time status preview for a hazard pair"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get hazard category names
        cursor.execute("SELECT name FROM hazard_categories WHERE id = ?", (hazard_a_id,))
        hazard_a_row = cursor.fetchone()
        
        cursor.execute("SELECT name FROM hazard_categories WHERE id = ?", (hazard_b_id,))
        hazard_b_row = cursor.fetchone()
        
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
        raise HTTPException(status_code=500, detail=f"Error calculating status: {str(e)}")
    finally:
        conn.close()

@app.get("/health")
def health_check():
    """Check database connectivity and stats"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM hazard_categories")
        categories_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM containers")
        containers_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM hazard_pairs")
        pairs_count = cursor.fetchone()[0]
        
        conn.close()
        
        return {
            "status": "healthy",
            "database": "sqlite",
            "stats": {
                "hazard_categories": categories_count,
                "containers": containers_count,
                "hazard_pairs": pairs_count
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    init_database()
    print("🚀 Kinross Chemical Container Safety API started")
    print("📊 Database initialized with updated hazard classification system")
    print("🔗 API Documentation: http://localhost:8000/docs")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)