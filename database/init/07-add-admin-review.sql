-- Migration: Add admin review stage to approval workflow
-- Three-stage approval: pending → admin_reviewed → approved/rejected

-- Add new columns for admin review
ALTER TABLE containers 
ADD COLUMN IF NOT EXISTS admin_reviewer VARCHAR(255),
ADD COLUMN IF NOT EXISTS admin_review_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS admin_review_comment TEXT;

-- Update status constraint to include admin_reviewed
ALTER TABLE containers 
DROP CONSTRAINT IF EXISTS containers_status_check;

ALTER TABLE containers 
ADD CONSTRAINT containers_status_check 
CHECK (status IN ('pending', 'admin_reviewed', 'approved', 'rejected', 'rework_requested'));

-- Create index for admin review queries
CREATE INDEX IF NOT EXISTS idx_containers_admin_review ON containers(status, admin_reviewer);