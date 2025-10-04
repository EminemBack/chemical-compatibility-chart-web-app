#!/usr/bin/env python3
"""
GHS Chemical Database Setup Script
Populates the database with real GHS classified chemicals and their hazard information
"""

import sqlite3
from datetime import datetime
import os

def setup_ghs_database():
    """Initialize SQLite database with GHS chemical data"""
    
    # Database file path
    db_path = "chemical_compatibility.db"
    
    # Connect to SQLite database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Setting up GHS Chemical Database...")
    
    # Enable WAL mode for better concurrent access
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=1000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    
    # Update products table to include GHS information
    cursor.execute("""
        ALTER TABLE products ADD COLUMN hazard_class VARCHAR(255)
    """)
    
    cursor.execute("""
        ALTER TABLE products ADD COLUMN ghs_symbol VARCHAR(50)
    """)
    
    cursor.execute("""
        ALTER TABLE products ADD COLUMN cas_number VARCHAR(50)
    """)
    
    cursor.execute("""
        ALTER TABLE products ADD COLUMN hazard_statements TEXT
    """)
    
    print("Updated database schema for GHS data...")
    
    # Clear existing products
    cursor.execute("DELETE FROM products")
    cursor.execute("DELETE FROM compatibility_matrix")
    cursor.execute("DELETE FROM requests")
    
    # GHS Chemical Products with real data
    ghs_chemicals = [
        # Explosive Materials
        ("Ammonium Nitrate", "Explosive", "explosive", "7778-80-5", 
         "H271: May cause fire or explosion; strong oxidizer"),
        
        ("TNT (Trinitrotoluene)", "Explosive", "explosive", "118-96-7", 
         "H201: Explosive; mass explosion hazard"),
        
        # Flammable Liquids
        ("Acetone", "Flammable Liquid Category 2", "flammable", "67-64-1", 
         "H225: Highly flammable liquid and vapor"),
        
        ("Ethanol", "Flammable Liquid Category 2", "flammable", "64-17-5", 
         "H225: Highly flammable liquid and vapor"),
        
        ("Gasoline", "Flammable Liquid Category 1", "flammable", "8006-61-9", 
         "H224: Extremely flammable liquid and vapor"),
        
        ("Methanol", "Flammable Liquid Category 2", "flammable", "67-56-1", 
         "H225: Highly flammable liquid and vapor; H301: Toxic if swallowed"),
        
        # Oxidizing Agents
        ("Hydrogen Peroxide (30%)", "Oxidizing Liquid Category 1", "oxidizing", "7722-84-1", 
         "H271: May cause fire or explosion; strong oxidizer"),
        
        ("Sodium Hypochlorite", "Oxidizing Liquid Category 1", "oxidizing", "7681-52-9", 
         "H271: May cause fire or explosion; strong oxidizer"),
        
        # Compressed Gases
        ("Oxygen (Compressed)", "Oxidizing Gas Category 1", "compressed_gas", "7782-44-7", 
         "H270: May cause or intensify fire; oxidizer"),
        
        ("Acetylene", "Flammable Gas Category 1", "compressed_gas", "74-86-2", 
         "H220: Extremely flammable gas"),
        
        ("Propane", "Flammable Gas Category 1", "compressed_gas", "74-98-6", 
         "H220: Extremely flammable gas"),
        
        # Corrosive Materials
        ("Hydrochloric Acid (37%)", "Corrosive to Metals Category 1", "corrosive", "7647-01-0", 
         "H290: May be corrosive to metals; H314: Causes severe skin burns"),
        
        ("Sulfuric Acid (98%)", "Corrosive to Metals Category 1", "corrosive", "7664-93-9", 
         "H290: May be corrosive to metals; H314: Causes severe skin burns"),
        
        ("Sodium Hydroxide", "Corrosive to Metals Category 1", "corrosive", "1310-73-2", 
         "H290: May be corrosive to metals; H314: Causes severe skin burns"),
        
        ("Nitric Acid (70%)", "Corrosive to Metals Category 1", "corrosive", "7697-37-2", 
         "H272: May intensify fire; oxidizer; H314: Causes severe skin burns"),
        
        # Toxic Materials
        ("Sodium Cyanide", "Acute Toxicity Category 1", "toxic", "143-33-9", 
         "H300: Fatal if swallowed; H310: Fatal in contact with skin"),
        
        ("Mercury", "Acute Toxicity Category 2", "toxic", "7439-97-6", 
         "H330: Fatal if inhaled; H372: Causes damage to organs"),
        
        ("Formaldehyde (37%)", "Carcinogenicity Category 1B", "toxic", "50-00-0", 
         "H350: May cause cancer; H301: Toxic if swallowed"),
        
        # Health Hazards
        ("Benzene", "Carcinogenicity Category 1A", "health_hazard", "71-43-2", 
         "H350: May cause cancer; H340: May cause genetic defects"),
        
        ("Asbestos", "Carcinogenicity Category 1A", "health_hazard", "1332-21-4", 
         "H350: May cause cancer; H372: Causes damage to lungs"),
        
        ("Silica (Crystalline)", "Carcinogenicity Category 1A", "health_hazard", "14808-60-7", 
         "H350: May cause cancer; H372: Causes damage to lungs"),
        
        # Environmental Hazards
        ("Diesel Fuel", "Chronic Aquatic Toxicity Category 2", "environmental", "68334-30-5", 
         "H411: Toxic to aquatic life with long lasting effects"),
        
        ("PCBs (Polychlorinated Biphenyls)", "Chronic Aquatic Toxicity Category 1", "environmental", "1336-36-3", 
         "H410: Very toxic to aquatic life with long lasting effects"),
        
        # Harmful/Irritant Materials
        ("Calcium Hydroxide", "Serious Eye Damage Category 1", "harmful", "1305-62-0", 
         "H318: Causes serious eye damage; H315: Causes skin irritation"),
        
        ("Ammonia Solution (25%)", "Serious Eye Damage Category 1", "harmful", "7664-41-7", 
         "H314: Causes severe skin burns and eye damage"),
        
        ("Isopropanol", "Flammable Liquid Category 2", "harmful", "67-63-0", 
         "H225: Highly flammable liquid and vapor; H319: Causes serious eye irritation")
    ]
    
    print(f"Adding {len(ghs_chemicals)} GHS classified chemicals...")
    
    # Insert GHS chemicals
    cursor.executemany("""
        INSERT INTO products (name, hazard_class, ghs_symbol, cas_number, hazard_statements, logo_path) 
        VALUES (?, ?, ?, ?, ?, NULL)
    """, ghs_chemicals)
    
    # Add realistic compatibility data based on GHS classifications
    print("Adding chemical compatibility matrix based on GHS classifications...")
    
    # Get all products for compatibility matrix
    cursor.execute("SELECT id, name, ghs_symbol FROM products ORDER BY id")
    products = cursor.fetchall()
    
    compatibility_rules = []
    
    for i, product_a in enumerate(products):
        for j, product_b in enumerate(products):
            if i < j:  # Only create unique pairs
                distance, color = calculate_ghs_compatibility(product_a[2], product_b[2])
                compatibility_rules.append((product_a[0], product_b[0], distance, color))
    
    cursor.executemany("""
        INSERT INTO compatibility_matrix (product_a_id, product_b_id, distance, color_code) 
        VALUES (?, ?, ?, ?)
    """, compatibility_rules)
    
    # Commit changes
    conn.commit()
    
    # Display statistics
    cursor.execute("SELECT COUNT(*) FROM products")
    product_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM compatibility_matrix")
    matrix_count = cursor.fetchone()[0]
    
    print("\n" + "="*60)
    print("GHS CHEMICAL DATABASE SETUP COMPLETE!")
    print("="*60)
    print(f"Database: {os.path.abspath(db_path)}")
    print(f"GHS Chemicals: {product_count}")
    print(f"Compatibility Pairs: {matrix_count}")
    print(f"Hazard Classes Covered:")
    
    cursor.execute("SELECT DISTINCT ghs_symbol FROM products ORDER BY ghs_symbol")
    symbols = cursor.fetchall()
    for symbol in symbols:
        print(f"  - {symbol[0].title()}")
    
    print("="*60)
    print("Ready for Kinross Safety Management System!")
    
    # Close connection
    conn.close()

def calculate_ghs_compatibility(symbol_a, symbol_b):
    """
    Calculate compatibility distance based on GHS symbols
    Returns (distance_meters, color_code)
    """
    
    # High risk combinations (minimum 25m separation)
    high_risk_pairs = [
        ('explosive', 'flammable'),
        ('explosive', 'oxidizing'),
        ('explosive', 'compressed_gas'),
        ('flammable', 'oxidizing'),
        ('toxic', 'corrosive'),
        ('explosive', 'toxic'),
        ('explosive', 'corrosive')
    ]
    
    # Moderate risk combinations (10-20m separation)
    moderate_risk_pairs = [
        ('flammable', 'compressed_gas'),
        ('flammable', 'corrosive'),
        ('oxidizing', 'corrosive'),
        ('toxic', 'flammable'),
        ('health_hazard', 'flammable'),
        ('corrosive', 'compressed_gas'),
        ('oxidizing', 'toxic')
    ]
    
    # Check if it's the same substance
    if symbol_a == symbol_b:
        return 5.0, "yellow"  # Same class materials - moderate separation
    
    # Check high risk combinations
    pair = tuple(sorted([symbol_a, symbol_b]))
    for high_risk in high_risk_pairs:
        if pair == tuple(sorted(high_risk)):
            return 25.0, "red"  # High risk - large separation required
    
    # Check moderate risk combinations
    for moderate_risk in moderate_risk_pairs:
        if pair == tuple(sorted(moderate_risk)):
            return 12.0, "yellow"  # Moderate risk
    
    # Low risk combinations
    low_risk_classes = ['harmful', 'environmental']
    if symbol_a in low_risk_classes or symbol_b in low_risk_classes:
        return 8.0, "yellow"  # Moderate separation for low-risk materials
    
    # Default safe separation
    return 20.0, "green"  # Safe separation for compatible materials

def view_ghs_database():
    """Display the GHS database contents"""
    conn = sqlite3.connect("chemical_compatibility.db")
    cursor = conn.cursor()
    
    print("\n" + "="*80)
    print("GHS CHEMICAL INVENTORY")
    print("="*80)
    
    cursor.execute("""
        SELECT name, hazard_class, ghs_symbol, cas_number 
        FROM products 
        ORDER BY ghs_symbol, name
    """)
    
    current_symbol = None
    for product in cursor.fetchall():
        name, hazard_class, ghs_symbol, cas_number = product
        
        if ghs_symbol != current_symbol:
            current_symbol = ghs_symbol
            print(f"\n📋 {ghs_symbol.upper().replace('_', ' ')} CHEMICALS:")
            print("-" * 50)
        
        print(f"  • {name}")
        print(f"    Class: {hazard_class}")
        print(f"    CAS: {cas_number}")
        print()
    
    print("\n" + "="*80)
    print("COMPATIBILITY MATRIX SUMMARY")
    print("="*80)
    
    cursor.execute("""
        SELECT color_code, COUNT(*) as count
        FROM compatibility_matrix 
        GROUP BY color_code 
        ORDER BY count DESC
    """)
    
    for row in cursor.fetchall():
        color, count = row
        risk_level = {"red": "HIGH RISK", "yellow": "MODERATE RISK", "green": "LOW RISK"}[color]
        print(f"{risk_level}: {count} chemical pairs")
    
    conn.close()

if __name__ == "__main__":
    try:
        setup_ghs_database()
        view_ghs_database()
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print("Database already has GHS columns. Updating data only...")
            # Just update the data without adding columns
            conn = sqlite3.connect("chemical_compatibility.db")
            cursor = conn.cursor()
            cursor.execute("DELETE FROM products")
            cursor.execute("DELETE FROM compatibility_matrix")
            cursor.execute("DELETE FROM requests")
            
            # Re-run the chemical insertion part
            print("Cleared existing data. Re-run the script to add GHS chemicals.")
            conn.close()
        else:
            print(f"Database error: {e}")
    except Exception as e:
        print(f"Error: {e}")