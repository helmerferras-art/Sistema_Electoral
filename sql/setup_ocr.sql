-- Add OCR fields to the supporters table for auto-filling and verification
ALTER TABLE supporters 
ADD COLUMN IF NOT EXISTS clave_elector VARCHAR(18),
ADD COLUMN IF NOT EXISTS domicilio TEXT,
ADD COLUMN IF NOT EXISTS seccion VARCHAR(10),
ADD COLUMN IF NOT EXISTS vigencia VARCHAR(10),
ADD COLUMN IF NOT EXISTS birth_date DATE;
