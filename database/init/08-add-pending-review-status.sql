-- Add pending_review status to containers table
ALTER TABLE containers 
DROP CONSTRAINT IF EXISTS containers_status_check;

ALTER TABLE containers 
ADD CONSTRAINT containers_status_check 
CHECK (status IN ('pending_review', 'pending', 'approved', 'rejected', 'rework_requested', 'admin_reviewed'));