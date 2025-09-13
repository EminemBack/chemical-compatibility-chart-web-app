# 🧪 Chemical Container Safety Assessment System - Complete Documentation

## 📁 **Project Structure**

```
chemical-compatibility/
├── 📁 backend/                              # FastAPI Backend
│   ├── main.py                              # Main FastAPI application
│   ├── requirements.txt                     # Python dependencies
│   ├── chemical_compatibility.db            # SQLite database (auto-created)
│   ├── 📁 uploads/
│   │   └── 📁 ghs/                          # GHS pictogram storage
│   │       ├── ghs01_explosive.png          # Explosive hazard icon
│   │       ├── ghs02_flammable.png          # Flammable hazard icon
│   │       ├── ghs03_oxidizing.png          # Oxidizing hazard icon
│   │       ├── ghs04_gas.png                # Compressed gas icon
│   │       ├── ghs05_corrosive.png          # Corrosive hazard icon
│   │       ├── ghs06_toxic.png              # Acute toxicity icon
│   │       ├── ghs07_harmful.png            # Health hazard icon
│   │       ├── ghs08_health.png             # Serious health hazard icon
│   │       └── ghs09_environment.png        # Environmental hazard icon
│   └── 📁 logs/                             # Application logs (optional)
│
├── 📁 frontend/                             # React Frontend
│   ├── 📁 public/
│   │   ├── index.html                       # HTML template
│   │   └── favicon.ico                      # Kinross favicon
│   ├── 📁 src/
│   │   ├── App.tsx                          # Main React component
│   │   ├── App.css                          # Kinross-themed styles
│   │   ├── main.tsx                         # React entry point
│   │   └── vite-env.d.ts                    # TypeScript definitions
│   ├── package.json                         # Node.js dependencies
│   ├── vite.config.ts                       # Vite configuration
│   ├── tsconfig.json                        # TypeScript configuration
│   └── 📁 dist/                             # Built production files
│
├── 📁 docs/                                 # Documentation
│   ├── README.md                            # Project documentation
│   ├── setup_guide.md                       # Installation instructions
│   ├── user_manual.md                       # End-user guide
│   └── api_documentation.md                 # API reference
│
├── 📁 scripts/                              # Utility scripts
│   ├── setup_database.py                    # Database initialization
│   ├── backup_database.py                   # Data backup utility
│   └── start_application.py                 # One-click startup
│
└── 📁 deployment/                           # Deployment files
    ├── docker-compose.yml                   # Docker deployment
    ├── nginx.conf                           # Web server config
    └── windows_service.py                   # Windows service setup
```

## 🗄️ **Database Schema**

### **Table Structure**

```sql
-- GHS Categories (9 standard hazard types)
CREATE TABLE ghs_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                      -- "Explosive", "Flammable", etc.
    symbol_code TEXT NOT NULL UNIQUE,        -- "GHS01", "GHS02", etc.
    description TEXT,                        -- Detailed hazard description
    logo_path TEXT,                          -- Path to pictogram image
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Container Information
CREATE TABLE containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department TEXT NOT NULL,                -- "Mining Operations"
    location TEXT NOT NULL,                  -- "Warehouse A"
    submitted_by TEXT NOT NULL,              -- Employee name
    container TEXT NOT NULL,                 -- "CONT-001"
    container_type TEXT NOT NULL,            -- "20ft" or "40ft"
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-Many: Containers ↔ Hazards
CREATE TABLE container_hazards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id INTEGER NOT NULL,
    ghs_category_id INTEGER NOT NULL,
    FOREIGN KEY (container_id) REFERENCES containers (id),
    FOREIGN KEY (ghs_category_id) REFERENCES ghs_categories (id)
);

-- Risk Assessment Results
CREATE TABLE hazard_pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id INTEGER NOT NULL,
    ghs_category_a_id INTEGER NOT NULL,
    ghs_category_b_id INTEGER NOT NULL,
    distance REAL NOT NULL,                  -- Actual storage distance
    is_isolated BOOLEAN NOT NULL,            -- Must be completely separated
    min_required_distance REAL,             -- Minimum safe distance
    status TEXT NOT NULL,                    -- "safe", "caution", "danger"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_id) REFERENCES containers (id),
    FOREIGN KEY (ghs_category_a_id) REFERENCES ghs_categories (id),
    FOREIGN KEY (ghs_category_b_id) REFERENCES ghs_categories (id)
);
```

### **Sample Data**

```sql
-- GHS Categories
INSERT INTO ghs_categories (name, symbol_code, description) VALUES
('Explosive', 'GHS01', 'Substances and mixtures which have explosive properties'),
('Flammable', 'GHS02', 'Flammable gases, aerosols, liquids, and solids'),
('Oxidizing', 'GHS03', 'Oxidizing gases, liquids and solids'),
('Compressed Gas', 'GHS04', 'Gases under pressure'),
('Corrosive', 'GHS05', 'Corrosive to metals and causes severe skin burns'),
('Acute Toxicity', 'GHS06', 'Substances that are fatal or toxic'),
('Serious Health Hazard', 'GHS07', 'Harmful if swallowed, causes skin or eye irritation'),
('Health Hazard', 'GHS08', 'Carcinogenic, mutagenic, toxic to reproduction'),
('Environmental Hazard', 'GHS09', 'Hazardous to the aquatic environment');

-- Sample Container
INSERT INTO containers (department, location, submitted_by, container, container_type) VALUES
('Mining Operations', 'Warehouse A', 'John Smith', 'CONT-001', '20ft');
```

## 🏗️ **System Architecture**

### **4-Layer Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                        🖥️ CLIENT LAYER                          │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   React SPA     │ │ Kinross Theme   │ │ Assessment Forms │   │
│  │ TypeScript+Vite │ │ Gold/Navy Colors│ │ Real-time Valid │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                  │
                               HTTP/REST
                                  │
┌─────────────────────────────────────────────────────────────────┐
│                         🌐 API LAYER                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   FastAPI       │ │ CORS Middleware │ │ Static File     │   │
│  │ Python Backend  │ │ Cross-Origin    │ │ GHS Logo Server │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                  │
                              SQL Queries
                                  │
┌─────────────────────────────────────────────────────────────────┐
│                      🧮 BUSINESS LOGIC                          │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Risk Calculator │ │ Pair Generator  │ │ Status Engine   │   │
│  │ GHS Rules       │ │ Unique Combos   │ │ Safe/Caution/   │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                  │
                              Data Access
                                  │
┌─────────────────────────────────────────────────────────────────┐
│                        🗄️ DATA LAYER                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ SQLite Database │ │ File System     │ │ Backup System   │   │
│  │ 4 Tables        │ │ uploads/ghs/    │ │ Auto Backups    │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 **User Journey Flow**

### **Complete Assessment Process**

```
1. 👤 User Opens Application
   ↓
2. 📋 Load GHS Categories (GET /ghs-categories/)
   ↓
3. 📝 Fill Container Form
   ├── 🏢 Department
   ├── 📍 Location  
   ├── 📦 Container ID
   ├── 📏 Container Type (20ft/40ft)
   └── 👨‍💼 Submitted By
   ↓
4. 🧪 Select GHS Hazards (Visual Grid)
   ↓
5. ❓ Decision: Single or Multiple Hazards?
   ├── Single Hazard → Submit Immediately ✅
   └── Multiple Hazards → Continue to Pairs
   ↓
6. 🔄 Auto-Generate Unique Pairs
   ↓
7. 👁️ Real-time Status Preview (POST /preview-status/)
   ↓
8. 📐 Enter Actual Distances
   ├── Live status updates
   ├── Color-coded backgrounds
   └── Min distance requirements
   ↓
9. 📊 Status Classification
   ├── 🟢 SAFE (Green)
   ├── 🟡 CAUTION (Yellow)
   └── 🔴 DANGER (Red)
   ↓
10. 📤 Submit Assessment (POST /containers/)
    ↓
11. 💾 Save to Database (4 tables updated)
    ↓
12. ✅ Success Confirmation
    ↓
13. 👀 View Assessment History (GET /containers/)
    ↓
14. 📊 Display Color-coded Results
```

## 🔧 **Core Components**

### **Frontend Components (React)**

```typescript
// Main Application Component
App.tsx
├── Container Form Section
│   ├── Department/Location/Container inputs
│   ├── Container Type dropdown
│   └── Submitted By field
├── GHS Hazard Selection Grid
│   ├── Visual pictogram cards
│   ├── Multi-select functionality
│   └── Hover effects and styling
├── Hazard Pairs Assessment
│   ├── Auto-generated unique pairs
│   ├── Distance input fields
│   ├── Real-time status preview
│   └── Color-coded backgrounds
├── Submit Section
│   ├── Form validation
│   ├── Reset functionality
│   └── Loading states
└── Assessment History
    ├── Container cards
    ├── Hazard tags
    └── Risk assessment results
```

### **Backend Components (FastAPI)**

```python
# Main API Application
main.py
├── Database Models
│   ├── GHSCategory
│   ├── Container
│   ├── ContainerHazard
│   └── HazardPair
├── API Endpoints
│   ├── GET /ghs-categories/
│   ├── POST /containers/
│   ├── GET /containers/
│   ├── POST /preview-status/
│   └── GET /health
├── Business Logic
│   ├── calculate_hazard_status()
│   ├── Risk assessment rules
│   └── Isolation logic
└── Database Functions
    ├── init_database()
    ├── Migration system
    └── Connection management
```

## ⚙️ **API Reference**

### **Endpoints**

#### **GET /ghs-categories/**
```json
// Response: List of GHS categories
[
  {
    "id": 1,
    "name": "Explosive",
    "symbol_code": "GHS01",
    "description": "Substances with explosive properties",
    "logo_path": "/uploads/ghs/ghs01_explosive.png"
  }
]
```

#### **POST /containers/**
```json
// Request: Submit container assessment
{
  "department": "Mining Operations",
  "location": "Warehouse A",
  "submitted_by": "John Smith",
  "container": "CONT-001",
  "container_type": "20ft",
  "selected_hazards": [1, 2],
  "hazard_pairs": [
    {
      "ghs_category_a_id": 1,
      "ghs_category_b_id": 2,
      "distance": 25.0
    }
  ]
}

// Response: Success confirmation
{
  "message": "Container safety assessment submitted successfully",
  "container_id": 1,
  "department": "Mining Operations",
  "location": "Warehouse A",
  "container": "CONT-001",
  "container_type": "20ft",
  "pairs_processed": 1
}
```

#### **POST /preview-status/**
```json
// Request: Get real-time status preview
GET /preview-status/?ghs_a_id=1&ghs_b_id=2&distance=10.0

// Response: Risk assessment
{
  "status": "danger",
  "is_isolated": true,
  "min_required_distance": null
}
```

#### **GET /containers/**
```json
// Response: All container assessments
[
  {
    "id": 1,
    "department": "Mining Operations",
    "location": "Warehouse A",
    "submitted_by": "John Smith",
    "container": "CONT-001",
    "container_type": "20ft",
    "submitted_at": "2025-01-15T10:30:00",
    "hazards": [
      {"name": "Explosive", "symbol_code": "GHS01"}
    ],
    "pairs": [
      {
        "id": 1,
        "ghs_a_name": "Explosive",
        "ghs_b_name": "Flammable",
        "distance": 25.0,
        "is_isolated": true,
        "min_required_distance": null,
        "status": "danger"
      }
    ]
  }
]
```

## 🔒 **Business Rules & Logic**

### **Chemical Compatibility Matrix**

| Hazard A | Hazard B | Min Distance | Isolation Required | Status Logic |
|----------|----------|--------------|-------------------|--------------|
| Explosive | Flammable | ∞ | **Yes** | Always DANGER |
| Explosive | Oxidizing | ∞ | **Yes** | Always DANGER |
| Flammable | Oxidizing | 20m | No | 20m=SAFE, 12m=CAUTION, <12m=DANGER |
| Explosive | Corrosive | 25m | No | 25m=SAFE, 15m=CAUTION, <15m=DANGER |
| Same Type | Same Type | 3m | No | 3m=SAFE, 1.8m=CAUTION, <1.8m=DANGER |
| Compatible | Compatible | 5m | No | 5m=SAFE, 3m=CAUTION, <3m=DANGER |

### **Status Calculation Algorithm**

```python
def calculate_hazard_status(ghs_a_code, ghs_b_code, distance):
    # 1. Check if must be isolated (never together)
    if (ghs_a_code, ghs_b_code) in isolated_pairs:
        return "danger", True, float('inf')
    
    # 2. Same hazard type
    if ghs_a_code == ghs_b_code:
        min_distance = 3.0
        return calculate_status_by_distance(distance, min_distance, False)
    
    # 3. Incompatible pairs with specific distances
    if pair in incompatible_pairs:
        min_distance = incompatible_pairs[pair]
        return calculate_status_by_distance(distance, min_distance, False)
    
    # 4. Compatible pairs
    min_distance = 5.0
    return calculate_status_by_distance(distance, min_distance, False)

def calculate_status_by_distance(actual, required, is_isolated):
    if actual >= required:
        return "safe", is_isolated, required
    elif actual >= required * 0.6:
        return "caution", is_isolated, required
    else:
        return "danger", is_isolated, required
```

### **Isolation Categories**

- **MUST BE ISOLATED** (Red): Never store together, infinite separation required
- **INCOMPATIBLE** (Red): High-risk pairs requiring large distances (15m-30m)
- **SAME TYPE** (Yellow): Same hazard category, 3m minimum separation
- **COMPATIBLE** (Green): Can be stored together safely with 5m standard distance

## 🎨 **Design System**

### **Kinross Corporate Colors**

```css
:root {
  --kinross-gold: #D4A553;        /* Primary brand color */
  --kinross-dark-gold: #B8933A;   /* Hover states */
  --kinross-navy: #1E3A5F;        /* Secondary brand color */
  --kinross-dark-navy: #162B47;   /* Headers and emphasis */
  --kinross-light-gray: #F5F5F5;  /* Backgrounds */
  --kinross-medium-gray: #CCCCCC; /* Borders */
  --kinross-dark-gray: #666666;   /* Body text */
  --kinross-white: #FFFFFF;       /* Cards and inputs */
  
  /* Status Colors */
  --kinross-safety-red: #C62828;    /* Danger */
  --kinross-safety-yellow: #FF8F00; /* Caution */
  --kinross-safety-green: #2E7D32;  /* Safe */
}
```

### **Typography Scale**

```css
/* Headers */
h1 { font-size: 2.5rem; font-weight: 700; color: var(--kinross-navy); }
h2 { font-size: 2rem; font-weight: 600; color: var(--kinross-navy); }
h3 { font-size: 1.5rem; font-weight: 600; color: var(--kinross-navy); }

/* Body Text */
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
p { font-size: 1rem; line-height: 1.6; color: var(--kinross-dark-gray); }

/* Interactive Elements */
button { font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
input { font-size: 1rem; padding: 1rem; }
```

### **Component Spacing**

```css
/* Consistent spacing scale */
.spacing-xs { margin: 0.5rem; }    /* 8px */
.spacing-sm { margin: 1rem; }      /* 16px */
.spacing-md { margin: 1.5rem; }    /* 24px */
.spacing-lg { margin: 2rem; }      /* 32px */
.spacing-xl { margin: 2.5rem; }    /* 40px */
```

## 🚀 **Deployment Guide**

### **Development Setup**

```bash
# Backend Setup
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py

# Frontend Setup (new terminal)
cd frontend
npm create vite@latest . --template react-ts
npm install
npm run dev
```

### **Production Deployment**

#### **Option 1: Docker Compose**
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes: