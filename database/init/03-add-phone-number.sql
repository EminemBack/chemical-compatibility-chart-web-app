-- Add phone_number column to containers table
ALTER TABLE containers ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);

-- Add comment
COMMENT ON COLUMN containers.phone_number IS 'Contact phone number of the responsible person';