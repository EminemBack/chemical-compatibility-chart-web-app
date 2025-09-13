# Chemical Compatibility Chart - 10 Hour Setup Guide

## Prerequisites
- Python 3.8+
- Node.js 16+
- Git

## Backend Setup (Hours 1-2)

### 1. Create project directory
```bash
mkdir chemical-compatibility
cd chemical-compatibility
mkdir backend frontend
```

### 2. Backend setup
```bash
cd backend
python -m venv chemic_comp
chemic_comp\Scripts\activate  # Windows
# source chemic_comp/bin/activate  # Mac/Linux

pip install fastapi uvicorn sqlalchemy python-multipart
```

### 3. Save the FastAPI code
- Save the `main.py` code from the artifact
- Create `uploads` folder in backend directory

### 4. Run backend
```bash
python main.py
```
Backend will run on http://localhost:8000

## Frontend Setup (Hours 3-4)

### 1. Create React app
```bash
cd ../frontend
npx create-react-app . --template typescript
```

### 2. Replace App.tsx and App.css
- Replace `src/App.tsx` with the React code from artifacts
- Replace `src/App.css` with the CSS code from artifacts

### 3. Run frontend
```bash
npm start
```
Frontend will run on http://localhost:3000

## Initial Data Setup (Hour 5)

### Add sample products via API:
```bash
# POST to http://localhost:8000/products/
# Body: {"name": "Hydrochloric Acid"}
# Body: {"name": "Sodium Hydroxide"}
# Body: {"name": "Acetone"}
# Body: {"name": "Benzene"}
```

Use tools like Postman, curl, or the browser's fetch API in console:
```javascript
fetch('http://localhost:8000/products/', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({name: 'Hydrochloric Acid'})
});
```

## Development Timeline

### Hours 1-2: Backend Foundation ✅
- [x] FastAPI setup with SQLAlchemy
- [x] Product, CompatibilityMatrix, Request models
- [x] Basic CRUD endpoints
- [x] File upload for logos

### Hours 3-4: Core API Development ✅
- [x] REST endpoints for all operations
- [x] Pair generation logic
- [x] Color coding logic (red/yellow/green)
- [x] CORS setup for React integration

### Hours 5-6: React Frontend Base ✅
- [x] TypeScript React setup
- [x] Product selection interface
- [x] Multi-select with visual feedback
- [x] API integration setup

### Hours 7-8: Core Logic Implementation ✅
- [x] Dynamic pair generation
- [x] Distance input forms
- [x] Form submission logic
- [x] Data persistence

### Hours 9-10: Matrix & Polish ✅
- [x] Compatibility matrix display
- [x] Color-coded visualization
- [x] Responsive design
- [x] Tab navigation
- [x] Loading states and error handling

## Quick Deployment Options

### Option 1: Local Development
- Backend: `python main.py` (Port 8000)
- Frontend: `npm start` (Port 3000)

### Option 2: Windows Production
```bash
# Backend as Windows Service
pip install pywin32
# Use nssm or create Windows service

# Frontend build
npm run build
# Serve with IIS or nginx
```

### Option 3: Docker (Recommended)
Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./uploads:/app/uploads
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

## Advanced Features (If Time Permits)

### Database Upgrade
Replace SQLite with PostgreSQL:
```bash
pip install psycopg2-binary
# Update DATABASE_URL in main.py
```

### Additional Features
- [ ] Product search/filter
- [ ] Export matrix to Excel
- [ ] User authentication
- [ ] Audit logs
- [ ] Bulk product import
- [ ] Email notifications

## Testing Your Application

### 1. Add Products
- Go to Submit Request tab
- You'll see placeholder products or add via API

### 2. Test Pair Generation
- Select 3+ products
- Verify all unique pairs are generated
- Set distances for each pair

### 3. Submit Data
- Enter your name
- Set distances (try values like 3, 8, 20 to see different colors)
- Submit and verify success

### 4. View Matrix
- Switch to View Matrix tab
- Verify color coding:
  - Red: 0-5 (unsafe)
  - Yellow: 6-15 (moderate)  
  - Green: 16+ (safe)

## Production Checklist

### Security
- [ ] Add input validation
- [ ] Implement rate limiting
- [ ] Add HTTPS
- [ ] Sanitize file uploads
- [ ] Add authentication if needed

### Performance
- [ ] Add database indexing
- [ ] Implement caching
- [ ] Optimize queries
- [ ] Add pagination for large datasets

### Monitoring
- [ ] Add logging
- [ ] Health check endpoints
- [ ] Error tracking
- [ ] Performance monitoring

## File Structure
```
chemical-compatibility/
├── backend/
│   ├── main.py
│   ├── uploads/
│   └── chemical_compatibility.db
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── App.css
│   └── public/
└── README.md
```

## Troubleshooting

### Common Issues
1. **CORS Error**: Ensure backend CORS is configured for `http://localhost:3000`
2. **Database Lock**: Restart FastAPI if SQLite locks
3. **File Upload**: Check `uploads` directory exists and has write permissions
4. **Port Conflicts**: Change ports in FastAPI or React if needed

### API Testing
Test endpoints manually:
```bash
# Get products
curl http://localhost:8000/products/

# Add product
curl -X POST http://localhost:8000/products/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Chemical"}'

# Get matrix
curl http://localhost:8000/compatibility/matrix
```

This setup gives you a fully functional Chemical Compatibility Chart application in exactly 10 hours! 🚀