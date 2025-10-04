#!/usr/bin/env python3
"""
GHS Categories Setup Script - FIXED VERSION
Initializes the database with the 9 standard GHS hazard pictograms
"""

import sqlite3
from datetime import datetime
import os

def setup_ghs_categories():
    """Initialize SQLite database with the 9 standard GHS categories"""
    
    # Database file path
    db_path = "chemical_compatibility.db"
    
    # Connect to SQLite database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Setting up GHS Categories Database...")
    
    # Enable WAL mode for better concurrent access
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL") 
    cursor.execute("PRAGMA cache_size=1000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    
    # Drop existing tables to ensure clean setup
    cursor.execute("DROP TABLE IF EXISTS hazard_pairs")
    cursor.execute("DROP TABLE IF EXISTS container_hazards") 
    cursor.execute("DROP TABLE IF EXISTS containers")
    cursor.execute("DROP TABLE IF EXISTS ghs_categories")
    
    # Create GHS categories table
    cursor.execute("""
        CREATE TABLE ghs_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            symbol_code VARCHAR(50) NOT NULL UNIQUE,
            description TEXT,
            logo_path VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create containers table
    cursor.execute("""
        CREATE TABLE containers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            department VARCHAR(255) NOT NULL,
            location VARCHAR(255) NOT NULL,
            submitted_by VARCHAR(255) NOT NULL,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create container_hazards table (many-to-many relationship)
    cursor.execute("""
        CREATE TABLE container_hazards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            container_id INTEGER NOT NULL,
            ghs_category_id INTEGER NOT NULL,
            FOREIGN KEY (container_id) REFERENCES containers (id),
            FOREIGN KEY (ghs_category_id) REFERENCES ghs_categories (id)
        )
    """)
    
    # Create hazard_pairs table
    cursor.execute("""
        CREATE TABLE hazard_pairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            container_id INTEGER NOT NULL,
            ghs_category_a_id INTEGER NOT NULL,
            ghs_category_b_id INTEGER NOT NULL,
            distance REAL NOT NULL,
            is_separable BOOLEAN NOT NULL DEFAULT 1,
            status VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (container_id) REFERENCES containers (id),
            FOREIGN KEY (ghs_category_a_id) REFERENCES ghs_categories (id),
            FOREIGN KEY (ghs_category_b_id) REFERENCES ghs_categories (id)
        )
    """)
    
    # The 9 Standard GHS Hazard Pictograms with descriptions
    ghs_categories = [
        (
            "Explosive",
            "GHS01",
            "Substances and mixtures which have explosive properties, are pyrotechnic substances, or substances which form potentially explosive mixtures with water",
            "/uploads/ghs/ghs01_explosive.png"
        ),
        (
            "Flammable",
            "GHS02", 
            "Flammable gases, aerosols, liquids, and solids. Self-reactive substances and mixtures. Pyrophoric liquids and solids. Self-heating substances and mixtures",
            "/uploads/ghs/ghs02_flammable.png"
        ),
        (
            "Oxidizing",
            "GHS03",
            "Oxidizing gases, liquids and solids. May cause or intensify fire; oxidizer. May cause fire or explosion",
            "/uploads/ghs/ghs03_oxidizing.png"
        ),
        (
            "Compressed Gas",
            "GHS04",
            "Gases under pressure: Compressed gases, liquefied gases, refrigerated liquefied gases, and dissolved gases",
            "/uploads/ghs/ghs04_gas.png"
        ),
        (
            "Corrosive",
            "GHS05",
            "Corrosive to metals and causes severe skin burns and eye damage. May be corrosive to metals",
            "/uploads/ghs/ghs05_corrosive.png"
        ),
        (
            "Acute Toxicity",
            "GHS06",
            "Substances that are fatal or toxic if swallowed, in contact with skin, or if inhaled",
            "/uploads/ghs/ghs06_toxic.png"
        ),
        (
            "Health Hazard",
            "GHS08",
            "Carcinogenic, mutagenic, toxic to reproduction, respiratory sensitizer, aspiration hazard, or organ toxicity",
            "/uploads/ghs/ghs08_health.png"
        ),
        (
            "Serious Health Hazard",
            "GHS07",
            "Harmful if swallowed, in contact with skin or if inhaled. Causes skin or eye irritation. May cause respiratory irritation or drowsiness",
            "/uploads/ghs/ghs07_harmful.png"
        ),
        (
            "Environmental Hazard", 
            "GHS09",
            "Hazardous to the aquatic environment - acute and chronic. Toxic to aquatic life",
            "/uploads/ghs/ghs09_environment.png"
        )
    ]
    
    print(f"Adding {len(ghs_categories)} GHS hazard categories...")
    
    # Insert GHS categories
    cursor.executemany("""
        INSERT INTO ghs_categories (name, symbol_code, description, logo_path) 
        VALUES (?, ?, ?, ?)
    """, ghs_categories)
    
    # Create useful indexes for performance
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_ghs_symbol_code ON ghs_categories (symbol_code)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_container_dept_location ON containers (department, location)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_hazard_pairs_container ON hazard_pairs (container_id)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_hazard_pairs_status ON hazard_pairs (status)
    """)
    
    # Commit changes
    conn.commit()
    
    # Display database statistics
    cursor.execute("SELECT COUNT(*) FROM ghs_categories")
    categories_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM containers")
    containers_count = cursor.fetchone()[0]
    
    print("\n" + "="*60)
    print("GHS CATEGORIES DATABASE SETUP COMPLETE!")
    print("="*60)
    print(f"Database file: {os.path.abspath(db_path)}")
    print(f"GHS Categories: {categories_count}")
    print(f"Containers: {containers_count}")
    print("\nGHS Categories Added:")
    
    cursor.execute("SELECT symbol_code, name FROM ghs_categories ORDER BY symbol_code")
    categories = cursor.fetchall()
    for code, name in categories:
        print(f"  • {code}: {name}")
    
    print("\n" + "="*60)
    print("IMPORTANT: Add your GHS logo PNG files to:")
    print("  backend/uploads/ghs/")
    print("Expected files:")
    for code, name in categories:
        filename = f"ghs{code[3:].zfill(2)}_{name.lower().replace(' ', '_')}.png"
        print(f"  • {filename}")
    print("="*60)
    
    # Close connection
    conn.close()

def view_ghs_categories():
    """Display the GHS categories"""
    conn = sqlite3.connect("chemical_compatibility.db")
    cursor = conn.cursor()
    
    print("\n" + "="*70)
    print("GHS HAZARD PICTOGRAM CATEGORIES")
    print("="*70)
    
    cursor.execute("""
        SELECT symbol_code, name, description 
        FROM ghs_categories 
        ORDER BY symbol_code
    """)
    
    for row in cursor.fetchall():
        code, name, description = row
        print(f"\n🔶 {code}: {name}")
        print(f"   Description: {description}")
    
    print("\n" + "="*70)
    
    conn.close()

def create_ghs_logo_placeholder_guide():
    """Create a guide for GHS logo placement"""
    
    logo_guide = """
# GHS Logo Setup Guide

Place your GHS pictogram PNG files in: `backend/uploads/ghs/`

Required files (recommended 200x200px PNG format):

1. ghs01_explosive.png     - Exploding bomb pictogram
2. ghs02_flammable.png     - Flame pictogram  
3. ghs03_oxidizing.png     - Flame over circle pictogram
4. ghs04_gas.png          - Gas cylinder pictogram
5. ghs05_corrosive.png     - Corrosion pictogram
6. ghs06_toxic.png        - Skull and crossbones pictogram
7. ghs07_harmful.png      - Exclamation mark pictogram
8. ghs08_health.png       - Health hazard pictogram
9. ghs09_environment.png  - Environment pictogram

You can download official GHS pictograms from:
- UNECE GHS: https://unece.org/ghs-pictograms
- OSHA: https://www.osha.gov/dsg/hazcom/ghsghs_pictograms.html

Ensure logos are:
- PNG format
- Square aspect ratio (200x200px recommended)
- Transparent background preferred
- High contrast for visibility
"""
    
    # Create uploads/ghs directory
    os.makedirs("uploads/ghs", exist_ok=True)
    
    # Write guide file
    with open("uploads/ghs/README_LOGO_SETUP.txt", "w") as f:
        f.write(logo_guide)
    
    print("Created logo setup guide: uploads/ghs/README_LOGO_SETUP.txt")

if __name__ == "__main__":
    try:
        setup_ghs_categories()
        view_ghs_categories()
        create_ghs_logo_placeholder_guide()
        
        print("\n✅ Setup complete! Next steps:")
        print("1. Add your GHS logo PNG files to uploads/ghs/")
        print("2. Restart your FastAPI server")
        print("3. Access the application to start creating container assessments")
        
    except Exception as e:
        print(f"❌ Error during setup: {e}")
        import traceback
        traceback.print_exc()