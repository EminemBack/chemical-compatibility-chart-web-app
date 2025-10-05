-- Add to your database init script
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('hod', 'admin', 'user', 'viewer')),
    department VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -- Insert sample users
-- INSERT INTO users (email, name, role, department) VALUES

-- Deletion Requests Table
CREATE TABLE deletion_requests (
    id SERIAL PRIMARY KEY,
    container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    
    -- User request info
    requested_by VARCHAR(255) NOT NULL,
    requested_by_email VARCHAR(255) NOT NULL,
    request_reason TEXT NOT NULL,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Admin review info
    admin_reviewed BOOLEAN DEFAULT false,
    admin_reviewer VARCHAR(255),
    admin_reviewer_email VARCHAR(255),
    admin_review_comment TEXT,
    admin_review_date TIMESTAMP,
    
    -- HOD final decision
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'admin_reviewed', 'approved', 'rejected')),
    hod_reviewer VARCHAR(255),
    hod_reviewer_email VARCHAR(255),
    hod_review_comment TEXT,
    hod_review_date TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_container ON deletion_requests(container_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_admin_reviewed ON deletion_requests(admin_reviewed);