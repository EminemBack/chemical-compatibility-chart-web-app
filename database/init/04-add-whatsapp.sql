-- Rename phone_number column to whatsapp_number
ALTER TABLE containers 
RENAME COLUMN phone_number TO whatsapp_number;

-- Update comment
COMMENT ON COLUMN containers.whatsapp_number IS 'WhatsApp contact number of the responsible person';