#!/usr/bin/env python3
"""
Application Startup Script for Chemical Compatibility Chart
This script handles the complete startup process for both development and production
"""

import os
import sys
import subprocess
import time
import webbrowser
from pathlib import Path

def check_requirements():
    """Check if all requirements are installed"""
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        print("✅ All Python requirements are installed")
        return True
    except ImportError as e:
        print(f"❌ Missing requirement: {e}")
        print("Please run: pip install -r requirements.txt")
        return False

def setup_directories():
    """Create necessary directories"""
    directories = ["uploads", "logs"]
    for directory in directories:
        Path(directory).mkdir(exist_ok=True)
        print(f"✅ Created directory: {directory}")

def check_database():
    """Check if database exists and is accessible"""
    db_path = "chemical_compatibility.db"
    if not os.path.exists(db_path):
        print("📁 Database not found. Creating new database...")
        # Import and run the setup script
        try:
            from setup_database import setup_database
            setup_database()
            print("✅ Database created successfully")
        except Exception as e:
            print(f"❌ Error creating database: {e}")
            return False
    else:
        print(f"✅ Database found: {db_path}")
    
    return True

def start_backend():
    """Start the FastAPI backend server"""
    print("\n🚀 Starting FastAPI backend server...")
    
    # Check if main.py exists
    if not os.path.exists("main.py"):
        print("❌ main.py not found. Please ensure the FastAPI application file exists.")
        return False
    
    try:
        # Start uvicorn server
        import uvicorn
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,  # Enable auto-reload for development
            log_level="info"
        )
    except Exception as e:
        print(f"❌ Error starting backend: {e}")
        return False

def start_frontend():
    """Instructions for starting the React frontend"""
    print("\n🎯 To start the React frontend:")
    print("1. Open a new terminal/command prompt")
    print("2. Navigate to the frontend directory")
    print("3. Run: npm start")
    print("4. Frontend will be available at: http://localhost:3000")

def display_startup_info():
    """Display startup information and URLs"""
    print("\n" + "="*60)
    print("🧪 CHEMICAL COMPATIBILITY CHART - STARTUP COMPLETE")
    print("="*60)
    print("📡 Backend API: http://localhost:8000")
    print("📋 API Documentation: http://localhost:8000/docs")
    print("🔍 Health Check: http://localhost:8000/health")
    print("🗂️  Database: SQLite (chemical_compatibility.db)")
    print("📁 File Uploads: ./uploads/")
    print("="*60)
    print("\n💡 Quick Start:")
    print("1. Visit http://localhost:8000/docs to test the API")
    print("2. Start the React frontend in another terminal")
    print("3. Use the application at http://localhost:3000")
    print("\n🆘 Need help?")
    print("- Check logs for errors")
    print("- Verify all requirements are installed")
    print("- Ensure ports 8000 and 3000 are available")
    print("="*60)

def main():
    """Main startup function"""
    print("🧪 Chemical Compatibility Chart - Starting Application...")
    print("="*60)
    
    # Check requirements
    if not check_requirements():
        sys.exit(1)
    
    # Setup directories
    setup_directories()
    
    # Check/create database
    if not check_database():
        sys.exit(1)
    
    # Display startup information
    display_startup_info()
    
    # Start frontend instructions
    start_frontend()
    
    # Start backend (this will block)
    print("\n⏳ Starting backend server...")
    start_backend()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n🛑 Application stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)