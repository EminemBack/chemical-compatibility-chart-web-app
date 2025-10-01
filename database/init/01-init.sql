-- database/init/01-init.sql
-- PostgreSQL initialization script for Kinross Chemical Safety System

-- Create database if it doesn't exist (this is automatically handled by the postgres image)

-- Create the schema
\c kinross_chemical;

-- Create hazard_categories table
CREATE TABLE IF NOT EXISTS hazard_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hazard_class VARCHAR(50) NOT NULL,
    subclass VARCHAR(50),
    description TEXT,
    logo_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create containers table
CREATE TABLE IF NOT EXISTS containers (
    id SERIAL PRIMARY KEY,
    department VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    submitted_by VARCHAR(255) NOT NULL,
    container VARCHAR(255) NOT NULL,
    container_type VARCHAR(50) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approval_comment TEXT,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP
);

-- Create container_hazards table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS container_hazards (
    id SERIAL PRIMARY KEY,
    container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    hazard_category_id INTEGER NOT NULL REFERENCES hazard_categories(id) ON DELETE CASCADE,
    UNIQUE(container_id, hazard_category_id)
);

-- Create hazard_pairs table
CREATE TABLE IF NOT EXISTS hazard_pairs (
    id SERIAL PRIMARY KEY,
    container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    hazard_category_a_id INTEGER NOT NULL REFERENCES hazard_categories(id) ON DELETE CASCADE,
    hazard_category_b_id INTEGER NOT NULL REFERENCES hazard_categories(id) ON DELETE CASCADE,
    distance REAL NOT NULL,
    is_isolated BOOLEAN NOT NULL DEFAULT FALSE,
    min_required_distance REAL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_hazard_categories_class ON hazard_categories(hazard_class);
CREATE INDEX IF NOT EXISTS idx_hazard_categories_subclass ON hazard_categories(subclass);
CREATE INDEX IF NOT EXISTS idx_containers_dept_location ON containers(department, location);
CREATE INDEX IF NOT EXISTS idx_containers_submitted_at ON containers(submitted_at);
CREATE INDEX IF NOT EXISTS idx_container_hazards_container ON container_hazards(container_id);
CREATE INDEX IF NOT EXISTS idx_container_hazards_hazard ON container_hazards(hazard_category_id);
CREATE INDEX IF NOT EXISTS idx_hazard_pairs_container ON hazard_pairs(container_id);
CREATE INDEX IF NOT EXISTS idx_hazard_pairs_status ON hazard_pairs(status);
CREATE INDEX IF NOT EXISTS idx_hazard_pairs_created_at ON hazard_pairs(created_at);

-- Insert initial hazard categories data
INSERT INTO hazard_categories (name, hazard_class, subclass, description, logo_path) VALUES
('Flammable Gas', '2', '2.1', 'Gases which are flammable in air', '/uploads/hazard/class2_flammable_gas.png'),
('Non-Flammable Non-Toxic Gas', '2', '2.2', 'Gases which are not flammable and not toxic', '/uploads/hazard/class2_nonflammable_gas.png'),
('Toxic Gas', '2', '2.3', 'Gases which are known to be toxic or corrosive to humans', '/uploads/hazard/class2_toxic_gas.png'),
('Flammable Liquid', '3', '3', 'Liquids having a flash point not more than 60°C', '/uploads/hazard/class3_flammable_liquid.png'),
('Flammable Solid', '4', '4.1', 'Solid materials which can be readily ignited', '/uploads/hazard/class4_flammable_solid.png'),
('Spontaneously Combustible', '4', '4.2', 'Substances liable to spontaneous combustion', '/uploads/hazard/class4_spontaneously_combustible.png'),
('Dangerous When Wet', '4', '4.3', 'Substances which become spontaneously flammable when wet', '/uploads/hazard/class4_dangerous_when_wet.png'),
('Oxidizing Agent', '5', '5.1', 'Substances which yield oxygen readily to support combustion', '/uploads/hazard/class5_1_oxidizing_agent.png'),
('Organic Peroxide', '5', '5.2', 'Organic substances containing bivalent oxygen structure', '/uploads/hazard/class5_2_organic_peroxide.png'),
('Toxic', '6', '6', 'Substances which are liable to cause death or serious injury if swallowed, inhaled, or absorbed through skin', '/uploads/hazard/class6_toxic.png'),
('Corrosive', '8', '8', 'Substances which cause destruction to human skin, metals, or other materials', '/uploads/hazard/class8_corrosive.png')
ON CONFLICT DO NOTHING;

-- Create a view for container summary information
CREATE OR REPLACE VIEW container_summary AS
SELECT 
    c.id,
    c.department,
    c.location,
    c.submitted_by,
    c.container,
    c.container_type,
    c.submitted_at,
    COUNT(DISTINCT ch.hazard_category_id) as hazard_count,
    COUNT(DISTINCT hp.id) as pair_count,
    CASE 
        WHEN COUNT(DISTINCT hp.id) = 0 THEN 'Single Hazard'
        WHEN COUNT(CASE WHEN hp.status = 'danger' THEN 1 END) > 0 THEN 'High Risk'
        WHEN COUNT(CASE WHEN hp.status = 'caution' THEN 1 END) > 0 THEN 'Moderate Risk'
        ELSE 'Low Risk'
    END as risk_level
FROM containers c
LEFT JOIN container_hazards ch ON c.id = ch.container_id
LEFT JOIN hazard_pairs hp ON c.id = hp.container_id
GROUP BY c.id, c.department, c.location, c.submitted_by, c.container, c.container_type, c.submitted_at;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kinross_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kinross_user;

-- Log successful initialization
INSERT INTO hazard_categories (name, hazard_class, subclass, description, logo_path) 
SELECT 'Database Initialized', 'SYSTEM', 'INIT', 'Database successfully initialized on ' || CURRENT_TIMESTAMP, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM hazard_categories WHERE hazard_class = 'SYSTEM' AND subclass = 'INIT'
);