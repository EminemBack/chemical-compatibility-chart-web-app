#!/usr/bin/env python3
"""
SQLite Database Setup Script for Chemical Compatibility Chart
Run this script to initialize the database with sample data
"""

import sqlite3
from datetime import datetime
import os

def setup_database():
    """Initialize SQLite database with sample data"""
    
    # Database file path
    db_path = "chemical_compatibility.db"
    
    # Connect to SQLite database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Setting up SQLite database...")
    
    # Enable WAL mode for better concurrent access
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=1000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    
    # Create tables (will be created by FastAPI, but good to have backup)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            logo_path VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS compatibility_matrix (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_a_id INTEGER NOT NULL,
            product_b_id INTEGER NOT NULL,
            distance REAL NOT NULL,
            color_code VARCHAR(10) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_a_id) REFERENCES products (id),
            FOREIGN KEY (product_b_id) REFERENCES products (id)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name VARCHAR(255) NOT NULL,
            product_ids TEXT NOT NULL,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Insert sample chemical products
    sample_products = [
        ("Hydrochloric Acid", None),
        ("Sodium Hydroxide", None),
        ("Acetone", None),
        ("Benzene", None),
        ("Sulfuric Acid", None),
        ("Ammonia", None),
        ("Methanol", None),
        ("Ethanol", None),
        ("Hydrogen Peroxide", None),
        ("Acetic Acid", None)
    ]
    
    # Check if products already exist
    cursor.execute("SELECT COUNT(*) FROM products")
    existing_count = cursor.fetchone()[0]
    
    if existing_count == 0:
        print("Adding sample chemical products...")
        cursor.executemany(
            "INSERT INTO products (name, logo_path) VALUES (?, ?)",
            sample_products
        )
        print(f"Added {len(sample_products)} sample products")
    else:
        print(f"Database already has {existing_count} products")
    
    # Add sample compatibility data
    sample_compatibility = [
        (1, 2, 3.5, "red"),     # Hydrochloric Acid + Sodium Hydroxide = Dangerous
        (1, 3, 8.0, "yellow"),  # Hydrochloric Acid + Acetone = Moderate
        (1, 4, 12.0, "yellow"), # Hydrochloric Acid + Benzene = Moderate
        (2, 3, 18.0, "green"),  # Sodium Hydroxide + Acetone = Safe
        (3, 4, 20.0, "green"),  # Acetone + Benzene = Safe
        (5, 6, 2.0, "red"),     # Sulfuric Acid + Ammonia = Dangerous
        (7, 8, 25.0, "green"),  # Methanol + Ethanol = Safe
    ]
    
    # Check if compatibility data already exists
    cursor.execute("SELECT COUNT(*) FROM compatibility_matrix")
    existing_matrix_count = cursor.fetchone()[0]
    
    if existing_matrix_count == 0:
        print("Adding sample compatibility data...")
        cursor.executemany(
            "INSERT INTO compatibility_matrix (product_a_id, product_b_id, distance, color_code) VALUES (?, ?, ?, ?)",
            sample_compatibility
        )
        print(f"Added {len(sample_compatibility)} compatibility pairs")
    else:
        print(f"Database already has {existing_matrix_count} compatibility pairs")
    
    # Create useful indexes for performance
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_compatibility_products ON compatibility_matrix (product_a_id, product_b_id)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_requests_user ON requests (user_name)
    """)
    
    # Commit changes
    conn.commit()
    
    # Display database statistics
    cursor.execute("SELECT COUNT(*) FROM products")
    product_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM compatibility_matrix")
    matrix_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM requests")
    request_count = cursor.fetchone()[0]
    
    print("\n" + "="*50)
    print("Database Setup Complete!")
    print("="*50)
    print(f"Database file: {os.path.abspath(db_path)}")
    print(f"Products: {product_count}")
    print(f"Compatibility pairs: {matrix_count}")
    print(f"Requests: {request_count}")
    print("="*50)
    
    # Close connection
    conn.close()

def view_database_contents():
    """Display current database contents"""
    conn = sqlite3.connect("chemical_compatibility.db")
    cursor = conn.cursor()
    
    print("\nCurrent Products:")
    cursor.execute("SELECT id, name FROM products ORDER BY id")
    products = cursor.fetchall()
    for product in products:
        print(f"  {product[0]}: {product[1]}")
    
    print("\nCurrent Compatibility Matrix:")
    cursor.execute("""
        SELECT cm.id, p1.name, p2.name, cm.distance, cm.color_code
        FROM compatibility_matrix cm
        JOIN products p1 ON cm.product_a_id = p1.id
        JOIN products p2 ON cm.product_b_id = p2.id
        ORDER BY cm.id
    """)
    matrix = cursor.fetchall()
    for item in matrix:
        print(f"  {item[0]}: {item[1]} ↔ {item[2]} = {item[3]} ({item[4]})")
    
    conn.close()

if __name__ == "__main__":
    setup_database()
    view_database_contents()