-- Migration: Add rework functionality for containers
-- Allows Admin/HOD to send submissions back for editing

-- Add new columns to containers table
ALTER TABLE containers 
ADD COLUMN IF NOT EXISTS rework_reason TEXT,
ADD COLUMN IF NOT EXISTS rework_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reworked_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS reworked_at TIMESTAMP;

-- Update status check constraint to include 'rework_requested'
ALTER TABLE containers 
DROP CONSTRAINT IF EXISTS containers_status_check;

ALTER TABLE containers 
ADD CONSTRAINT containers_status_check 
CHECK (status IN ('pending', 'approved', 'rejected', 'rework_requested'));

-- Create index for rework status queries
CREATE INDEX IF NOT EXISTS idx_containers_status_rework ON containers(status, submitted_by);