-- Migration: Add attachment support for containers
-- Photos: front, inside, side

CREATE TABLE IF NOT EXISTS container_attachments (
    id SERIAL PRIMARY KEY,
    container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    photo_type VARCHAR(20) NOT NULL CHECK (photo_type IN ('front', 'inside', 'side')),
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(container_id, photo_type)
);

CREATE INDEX idx_container_attachments_container_id ON container_attachments(container_id);