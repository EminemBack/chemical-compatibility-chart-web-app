#!/usr/bin/env python3
"""
Simplified Chemical Container Safety Assessment API
Compatible with Python 3.13 and newer SQLAlchemy versions
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

# Create uploads directory for GHS logos
Path("uploads/ghs").mkdir(parents=True, exist_ok=True)

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
class GHSCategoryResponse(BaseModel):
    id: int
    name: str
    symbol_code: str
    description: Optional[str] = None
    logo_path: Optional[str] = None

class HazardPairData(BaseModel):
    ghs_category_a_id: int
    ghs_category_b_id: int
    distance: float

class ContainerSubmission(BaseModel):
    department: str
    location: str
    submitted_by: str
    container: str
    container_type: str
    selected_hazards: List[int]  # List of GHS category IDs
    hazard_pairs: List[HazardPairData]

# Database functions
def get_db_connection():
    """Get SQLite database connection"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # Enable dict-like access
    return conn

def init_database():
    """Initialize database with tables including new container columns"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enable SQLite optimizations
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    
    # Create GHS categories table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ghs_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            symbol_code TEXT NOT NULL UNIQUE,
            description TEXT,
            logo_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Check if containers table exists and what columns it has
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='containers'")
    table_exists = cursor.fetchone()
    
    if table_exists:
        # Check existing columns
        cursor.execute("PRAGMA table_info(containers)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'container' not in columns or 'container_type' not in columns:
            print("🔄 Migrating containers table to add new columns...")
            
            # Create new table with all required columns
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
            
            # Copy existing data if any exists
            try:
                cursor.execute("""
                    INSERT INTO containers_new (id, department, location, submitted_by, submitted_at)
                    SELECT id, department, location, submitted_by, submitted_at FROM containers
                """)
                print(f"✅ Migrated existing container data")
            except Exception as e:
                print(f"ℹ️  No existing data to migrate: {e}")
            
            # Drop old table and rename new one
            cursor.execute("DROP TABLE containers")
            cursor.execute("ALTER TABLE containers_new RENAME TO containers")
            print("✅ Migration completed!")
    else:
        # Create new containers table with all columns
        print("📋 Creating new containers table...")
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
        print("✅ Containers table created with all required columns")
    
    # Create container_hazards table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS container_hazards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            container_id INTEGER NOT NULL,
            ghs_category_id INTEGER NOT NULL,
            FOREIGN KEY (container_id) REFERENCES containers (id),
            FOREIGN KEY (ghs_category_id) REFERENCES ghs_categories (id)
        )
    """)
    
    # Create hazard_pairs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hazard_pairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            container_id INTEGER NOT NULL,
            ghs_category_a_id INTEGER NOT NULL,
            ghs_category_b_id INTEGER NOT NULL,
            distance REAL NOT NULL,
            is_isolated BOOLEAN NOT NULL,
            min_required_distance REAL,
            status TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (container_id) REFERENCES containers (id),
            FOREIGN KEY (ghs_category_a_id) REFERENCES ghs_categories (id),
            FOREIGN KEY (ghs_category_b_id) REFERENCES ghs_categories (id)
        )
    """)
    
    # Check if GHS categories exist, if not, add them
    cursor.execute("SELECT COUNT(*) FROM ghs_categories")
    if cursor.fetchone()[0] == 0:
        # Insert the 9 standard GHS categories
        ghs_categories = [
            ("Explosive", "GHS01", "Substances and mixtures which have explosive properties", "/uploads/ghs/ghs01_explosive.png"),
            ("Flammable", "GHS02", "Flammable gases, aerosols, liquids, and solids", "/uploads/ghs/ghs02_flammable.png"),
            ("Oxidizing", "GHS03", "Oxidizing gases, liquids and solids", "/uploads/ghs/ghs03_oxidizing.png"),
            ("Compressed Gas", "GHS04", "Gases under pressure", "/uploads/ghs/ghs04_gas.png"),
            ("Corrosive", "GHS05", "Corrosive to metals and causes severe skin burns", "/uploads/ghs/ghs05_corrosive.png"),
            ("Acute Toxicity", "GHS06", "Substances that are fatal or toxic", "/uploads/ghs/ghs06_toxic.png"),
            ("Serious Health Hazard", "GHS07", "Harmful if swallowed, causes skin or eye irritation", "/uploads/ghs/ghs07_harmful.png"),
            ("Health Hazard", "GHS08", "Carcinogenic, mutagenic, toxic to reproduction", "/uploads/ghs/ghs08_health.png"),
            ("Environmental Hazard", "GHS09", "Hazardous to the aquatic environment", "/uploads/ghs/ghs09_environment.png")
        ]
        
        cursor.executemany("""
            INSERT INTO ghs_categories (name, symbol_code, description, logo_path)
            VALUES (?, ?, ?, ?)
        """, ghs_categories)
        
        print("✅ Initialized database with 9 GHS categories")
    
    conn.commit()
    conn.close()

def calculate_hazard_status(ghs_a_code: str, ghs_b_code: str, distance: float) -> tuple[str, bool, float]:
    """
    Calculate safety status based on GHS categories and distance
    Returns: (status, is_isolated, min_required_distance)
    """
    
    # Define incompatible pairs that require separation
    incompatible_pairs = {
        ('GHS01', 'GHS02'): 25.0,  # Explosive + Flammable
        ('GHS01', 'GHS03'): 30.0,  # Explosive + Oxidizing
        ('GHS02', 'GHS03'): 20.0,  # Flammable + Oxidizing
        ('GHS01', 'GHS05'): 25.0,  # Explosive + Corrosive
        ('GHS01', 'GHS06'): 30.0,  # Explosive + Toxic
        ('GHS02', 'GHS05'): 15.0,  # Flammable + Corrosive
        ('GHS03', 'GHS05'): 20.0,  # Oxidizing + Corrosive
        ('GHS06', 'GHS05'): 15.0,  # Toxic + Corrosive
    }
    
    # Special combinations that must be completely isolated (never together)
    isolated_pairs = {
        ('GHS01', 'GHS02'),  # Explosive + Flammable - MUST be isolated
        ('GHS01', 'GHS03'),  # Explosive + Oxidizing - MUST be isolated
    }
    
    # Normalize pair order for lookup
    pair = tuple(sorted([ghs_a_code, ghs_b_code]))
    
    # Same hazard type - can be together with minimal separation
    if ghs_a_code == ghs_b_code:
        min_distance = 3.0
        if distance >= min_distance:
            return "safe", False, min_distance  # Not isolated, same type
        else:
            return "danger", False, min_distance
    
    # Check if pair must be completely isolated (never together)
    if pair in isolated_pairs:
        return "danger", True, float('inf')  # Must be isolated, infinite distance required
    
    # Check if pair requires special separation distance
    if pair in incompatible_pairs:
        min_distance = incompatible_pairs[pair]
        is_isolated = False  # Can be together with proper distance
        
        if distance >= min_distance:
            return "safe", is_isolated, min_distance
        elif distance >= min_distance * 0.6:  # 60% of required distance
            return "caution", is_isolated, min_distance
        else:
            return "danger", is_isolated, min_distance
    
    # Compatible pairs - standard safety distances
    min_distance = 5.0  # Standard minimum for compatible materials
    
    if distance >= min_distance:
        return "safe", False, min_distance  # Not isolated, compatible
    elif distance >= min_distance * 0.6:  # 3m for compatible
        return "caution", False, min_distance
    else:
        return "danger", False, min_distance

# Routes
@app.get("/")
def read_root():
    return {"message": "Kinross Chemical Container Safety API", "status": "running"}

@app.get("/ghs-categories/", response_model=List[GHSCategoryResponse])
def get_ghs_categories():
    """Get all GHS categories with their logos"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, symbol_code, description, logo_path FROM ghs_categories ORDER BY symbol_code")
    categories = []
    
    for row in cursor.fetchall():
        categories.append(GHSCategoryResponse(
            id=row['id'],
            name=row['name'],
            symbol_code=row['symbol_code'],
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
        print(f"🧪 Selected hazards: {submission.selected_hazards}")
        print(f"📏 Hazard pairs: {len(submission.hazard_pairs)}")
        
        # Create container record with all required fields
        cursor.execute("""
            INSERT INTO containers (department, location, submitted_by, container, container_type)
            VALUES (?, ?, ?, ?, ?)
        """, (submission.department, submission.location, submission.submitted_by, 
              submission.container, submission.container_type))
        
        container_id = cursor.lastrowid
        print(f"✅ Container created with ID: {container_id}")
        
        # Add selected hazards
        for hazard_id in submission.selected_hazards:
            print(f"🔗 Linking hazard {hazard_id} to container {container_id}")
            cursor.execute("""
                INSERT INTO container_hazards (container_id, ghs_category_id)
                VALUES (?, ?)
            """, (container_id, hazard_id))
        
        # Add hazard pairs with distances and status (only if pairs exist)
        if submission.hazard_pairs:
            for i, pair_data in enumerate(submission.hazard_pairs):
                print(f"📊 Processing pair {i+1}/{len(submission.hazard_pairs)}: {pair_data.ghs_category_a_id} ↔ {pair_data.ghs_category_b_id}")
                
                # Get GHS category codes for status calculation
                cursor.execute("SELECT symbol_code FROM ghs_categories WHERE id = ?", (pair_data.ghs_category_a_id,))
                ghs_a_row = cursor.fetchone()
                
                cursor.execute("SELECT symbol_code FROM ghs_categories WHERE id = ?", (pair_data.ghs_category_b_id,))
                ghs_b_row = cursor.fetchone()
                
                if not ghs_a_row or not ghs_b_row:
                    error_msg = f"Invalid GHS category ID: {pair_data.ghs_category_a_id} or {pair_data.ghs_category_b_id}"
                    print(f"❌ {error_msg}")
                    raise HTTPException(status_code=400, detail=error_msg)
                
                print(f"🏷️  Categories: {ghs_a_row['symbol_code']} + {ghs_b_row['symbol_code']}, Distance: {pair_data.distance}m")
                
                # Calculate status, isolation, and minimum distance
                status, is_isolated, min_required_distance = calculate_hazard_status(
                    ghs_a_row['symbol_code'], 
                    ghs_b_row['symbol_code'], 
                    pair_data.distance
                )
                
                print(f"📈 Calculated: Status={status}, Isolated={is_isolated}, MinDist={min_required_distance}")
                
                # Check if min_required_distance is infinity
                min_dist_value = None if min_required_distance == float('inf') else min_required_distance
                
                cursor.execute("""
                    INSERT INTO hazard_pairs (container_id, ghs_category_a_id, ghs_category_b_id, 
                                            distance, is_isolated, min_required_distance, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (container_id, pair_data.ghs_category_a_id, pair_data.ghs_category_b_id, 
                      pair_data.distance, is_isolated, min_dist_value, status))
        else:
            print("📝 Single hazard container - no pairs to process")
        
        conn.commit()
        print(f"✅ Successfully saved container {container_id} with {len(submission.hazard_pairs)} pairs")
        
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
        print(f"📋 Submission data: {submission}")
        import traceback
        traceback.print_exc()
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
            SELECT g.name, g.symbol_code 
            FROM ghs_categories g
            JOIN container_hazards ch ON g.id = ch.ghs_category_id
            WHERE ch.container_id = ?
        """, (container_id,))
        hazards = [{"name": row['name'], "symbol_code": row['symbol_code']} for row in cursor.fetchall()]
        
        # Get pairs for this container
        cursor.execute("""
            SELECT hp.*, 
                   ga.name as ghs_a_name, 
                   gb.name as ghs_b_name
            FROM hazard_pairs hp
            JOIN ghs_categories ga ON hp.ghs_category_a_id = ga.id
            JOIN ghs_categories gb ON hp.ghs_category_b_id = gb.id
            WHERE hp.container_id = ?
        """, (container_id,))
        
        pairs = []
        for pair_row in cursor.fetchall():
            # Handle NULL min_required_distance (when it was infinity)
            min_dist = pair_row['min_required_distance']
            if min_dist is None:
                min_dist = float('inf')
            
            pairs.append({
                "id": pair_row['id'],
                "ghs_a_name": pair_row['ghs_a_name'],
                "ghs_b_name": pair_row['ghs_b_name'],
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
def get_preview_status(ghs_a_id: int, ghs_b_id: int, distance: float):
    """Get real-time status preview for a hazard pair"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get GHS category codes
        cursor.execute("SELECT symbol_code FROM ghs_categories WHERE id = ?", (ghs_a_id,))
        ghs_a_row = cursor.fetchone()
        
        cursor.execute("SELECT symbol_code FROM ghs_categories WHERE id = ?", (ghs_b_id,))
        ghs_b_row = cursor.fetchone()
        
        if not ghs_a_row or not ghs_b_row:
            raise HTTPException(status_code=400, detail="Invalid GHS category ID")
        
        # Calculate status using the same backend logic
        status, is_isolated, min_required_distance = calculate_hazard_status(
            ghs_a_row['symbol_code'], 
            ghs_b_row['symbol_code'], 
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
        
        cursor.execute("SELECT COUNT(*) FROM ghs_categories")
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
                "ghs_categories": categories_count,
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
    print("📊 Database initialized")
    print("🔗 API Documentation: http://localhost:8000/docs")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)