# 🧪 Chemical Container Safety Assessment System - Project Prompt

## 📋 **Project Overview**

**Company**: Kinross Gold Corporation  
**Project Type**: Chemical Safety Management System  
**Technology Stack**: React + TypeScript + FastAPI + SQLite  
**Target Platform**: Windows Environment  
**Development Timeline**: 10 hours  

## 🎯 **Project Goals**

Build a comprehensive Chemical Container Safety Assessment System that enables Kinross employees to evaluate chemical hazard compatibility in storage containers according to GHS (Globally Harmonized System) standards, ensuring workplace safety and regulatory compliance.

## 🔧 **Core Requirements**

### **1. Container Information Management**
- **Department Field**: Mining Operations, Processing, Maintenance, etc.
- **Location Field**: Warehouse A, Building 3, Storage Room 101, etc.
- **Container ID**: Unique identifier (e.g., CONT-001, CHM-2024-A15)
- **Container Type**: Dropdown selection (20 feet / 40 feet)
- **Submitted By**: Employee name for audit trail

### **2. GHS Hazard Category Selection**
- **9 Standard GHS Categories**: 
  - GHS01: Explosive
  - GHS02: Flammable
  - GHS03: Oxidizing
  - GHS04: Compressed Gas
  - GHS05: Corrosive
  - GHS06: Acute Toxicity
  - GHS07: Serious Health Hazard
  - GHS08: Health Hazard
  - GHS09: Environmental Hazard
- **Visual Interface**: Grid layout with GHS pictograms/logos
- **Multi-selection**: Allow selection of multiple hazard categories
- **Single Hazard Support**: Enable submission with just one hazard category

### **3. Automated Pair Generation & Assessment**
- **Unique Combinations**: Automatically generate all unique pairs from selected hazards
- **Distance Input**: User enters actual storage distances for each pair
- **Real-time Calculation**: Live status updates as user types distances
- **Isolation Logic**: Determine if hazards must be completely isolated vs. coexist with proper separation

### **4. Risk Assessment Engine**
- **Status Categories**:
  - **SAFE** (Green): Proper separation maintained
  - **CAUTION** (Yellow): Moderate risk, review needed
  - **DANGER** (Red): Unsafe conditions, immediate action required
- **Isolation Categories**:
  - **MUST BE ISOLATED**: Never store together (e.g., Explosive + Flammable)
  - **INCOMPATIBLE**: Require large separation distances (20m+)
  - **SAME TYPE**: Same hazard category (3m minimum)
  - **COMPATIBLE**: Can be stored together safely (5m standard)

### **5. Professional Interface Design**
- **Kinross Corporate Branding**:
  - Primary Color: Gold (#D4A553)
  - Secondary Color: Navy (#1E3A5F)
  - Professional typography and spacing
  - Corporate footer and header styling
- **Responsive Design**: Desktop and mobile compatibility
- **User Experience**: Intuitive form flow with clear validation
- **Accessibility**: WCAG compliant with proper contrast and semantic markup

### **6. Assessment History & Reporting**
- **Assessment Display**: Color-coded results with full details
- **Audit Trail**: Complete history of all submissions
- **Container Details**: Department, location, hazards, and risk assessments
- **Export Capability**: Ready for regulatory reporting needs

## 🔥 **Key Features**

### **Real-time Preview System**
- **Live Status Calculation**: Backend API calls for consistent risk assessment
- **Color-coded Backgrounds**: Visual feedback as user enters distances
- **Minimum Distance Display**: Show required vs. actual distances
- **Instant Feedback**: No page reloads, immediate status updates

### **Flexible Submission Logic**
- **Single Hazard Containers**: Submit with one hazard (no pairs needed)
- **Multi-Hazard Containers**: Generate pairs and assess compatibility
- **Form Validation**: Comprehensive error checking and user guidance
- **Reset Functionality**: Clear form and start over

### **Professional Data Management**
- **SQLite Database**: Self-contained, Windows-friendly storage
- **Automatic Migration**: Database schema updates without data loss
- **GHS Standards Compliance**: Based on official chemical safety guidelines
- **Data Integrity**: Foreign key constraints and validation

## 🛠️ **Technical Specifications**

### **Frontend Requirements**
- **Framework**: React with TypeScript
- **Build Tool**: Vite (modern, fast alternative to create-react-app)
- **Styling**: Custom CSS with Kinross corporate theme
- **State Management**: React hooks for form and data management
- **API Integration**: RESTful API calls with error handling

### **Backend Requirements**
- **Framework**: FastAPI (Python 3.13 compatible)
- **Database**: SQLite with automatic initialization
- **File Serving**: Static file server for GHS pictograms
- **CORS Support**: Cross-origin requests from frontend
- **Error Handling**: Comprehensive logging and user-friendly error messages

### **Database Schema**
- **ghs_categories**: 9 standard GHS hazard types with descriptions
- **containers**: Container information (dept, location, type, etc.)
- **container_hazards**: Many-to-many relationship for hazards per container
- **hazard_pairs**: Risk assessments with distances and status calculations

### **Performance Requirements**
- **Response Time**: < 100ms for typical API operations
- **Database**: Handle 100,000+ assessment records efficiently
- **File Size**: < 50MB total application size
- **Concurrent Users**: Support 10-50 simultaneous users

## 🎨 **User Interface Design**

### **Form Layout**
```
┌─────────────── Header ───────────────┐
│ Chemical Container Safety Assessment │
│ Kinross Gold Corporation             │
└─────────────────────────────────────┘

┌────── Container Information ────────┐
│ Department    Location    Submitted │
│ Container     Type                  │
└────────────────────────────────────┘

┌──── GHS Hazard Selection Grid ─────┐
│ [🔥] [💥] [☠️] [🧪] [⚗️]          │
│ [🚨] [⚠️] [🫧] [🌿]               │
└────────────────────────────────────┘

┌─── Pair Assessment (if 2+ hazards) ──┐
│ Explosive ↔ Flammable               │
│ Distance: [____] Required: 25m      │
│ Status: [MUST BE ISOLATED] [DANGER] │
└────────────────────────────────────┘

┌──────── Submit Section ──────────┐
│ [Reset Form] [Submit Assessment] │
└─────────────────────────────────┘
```

### **Color Coding System**
- **🟢 SAFE**: Green background, dark green text
- **🟡 CAUTION**: Yellow background, orange text  
- **🔴 DANGER**: Red background, dark red text
- **🔷 Kinross Gold**: Accent color for buttons and highlights
- **🔷 Kinross Navy**: Primary text and headers

## 📊 **Business Rules**

### **Chemical Compatibility Matrix**
- **Explosive + Flammable**: MUST BE ISOLATED (never together)
- **Explosive + Oxidizing**: MUST BE ISOLATED (never together)
- **Flammable + Oxidizing**: INCOMPATIBLE (20m+ separation)
- **Same Hazard Types**: SAME TYPE (3m minimum)
- **Compatible Combinations**: COMPATIBLE (5m standard)

### **Distance Thresholds**
- **100% of Required**: SAFE status
- **60-99% of Required**: CAUTION status  
- **< 60% of Required**: DANGER status
- **Non-isolatable Incompatibles**: Always DANGER

### **Validation Rules**
- All container information fields required
- At least one hazard category must be selected
- Distance values must be non-negative numbers
- Pairs automatically generated for 2+ hazards
- Single hazards bypass pair assessment

## 🚀 **Deployment Strategy**

### **Development Environment**
- **Frontend**: `npm run dev` on port 5173
- **Backend**: `python main.py` on port 8000
- **Database**: Auto-created SQLite file
- **Hot Reload**: Live updates during development

### **Production Deployment**
- **Build Process**: `npm run build` for optimized frontend
- **Server**: Uvicorn ASGI server for FastAPI
- **Database**: SQLite with automated backups
- **Web Server**: Nginx reverse proxy (optional)
- **Monitoring**: Health check endpoints and logging

## 📋 **Success Criteria**

### **Functional Requirements**
✅ Form accepts all required container information  
✅ GHS hazard selection with visual pictograms  
✅ Automatic pair generation for multiple hazards  
✅ Real-time risk assessment with color coding  
✅ Single and multi-hazard submission support  
✅ Assessment history with full audit trail  

### **Technical Requirements**
✅ Professional Kinross corporate branding  
✅ Responsive design for desktop and mobile  
✅ Error handling and form validation  
✅ SQLite database with automatic migration  
✅ RESTful API with comprehensive endpoints  
✅ < 100ms response times for typical operations  

### **User Experience Requirements**
✅ Intuitive form flow with clear guidance  
✅ Immediate visual feedback on risk levels  
✅ Professional appearance suitable for corporate use  
✅ Accessibility compliance for all users  
✅ One-click form reset and submission  
✅ Clear status indicators and explanations  

## 🎯 **Project Deliverables**

1. **Complete Source Code**
   - React TypeScript frontend with Kinross theming
   - FastAPI Python backend with SQLite integration
   - Database migration and initialization scripts

2. **Documentation**
   - Setup and installation guide
   - User manual with screenshots
   - API documentation with endpoints
   - Database schema and relationships

3. **Deployment Package**
   - Production-ready build configuration
   - Docker compose for containerized deployment
   - Windows service setup scripts
   - Backup and maintenance utilities

4. **Testing & Validation**
   - Form validation testing
   - Risk calculation verification
   - Cross-browser compatibility
   - Performance benchmarking

This system will provide Kinross Gold Corporation with a professional, compliant, and user-friendly solution for managing chemical container safety assessments according to international GHS standards.