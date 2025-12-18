-- Migration 11: Create program_categories table
-- This replaces the static program_title_1, program_description_1, etc. settings

CREATE TABLE IF NOT EXISTS program_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    short_description TEXT,
    image_url VARCHAR(500),
    video_filename VARCHAR(255),
    impact_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_program_categories_name ON program_categories(name);
CREATE INDEX IF NOT EXISTS idx_program_categories_slug ON program_categories(slug);
CREATE INDEX IF NOT EXISTS idx_program_categories_order ON program_categories(display_order, is_active);

-- Insert default categories with detailed fictitious data
INSERT INTO program_categories (name, slug, title, description, short_description, image_url, impact_text, display_order, is_active, created_at, updated_at)
VALUES
    ('Emergency Relief', 'emergency-relief', 'Emergency Relief', 
     'Our Emergency Relief program provides immediate assistance to families facing crisis situations. We deliver essential supplies including food, clean water, medical aid, and temporary shelter to those affected by natural disasters, conflicts, and emergencies. Our rapid response teams work around the clock to ensure that help reaches those in need within 24-48 hours of a crisis. We have established partnerships with local communities and international organizations to maximize our impact and ensure efficient distribution of aid.',
     'Rapid response assistance for families in crisis situations, delivering essential supplies and support when it matters most.',
     'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=600&fit=crop',
     'Helped 15,000+ families in crisis this year', 1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Water', 'water', 'Clean Water Initiative', 
     'Access to clean, safe drinking water is a fundamental human right. Our Water program focuses on building sustainable water infrastructure in underserved communities. We construct deep wells, install water filtration systems, and provide water storage solutions. Our team also conducts hygiene education workshops to ensure communities understand the importance of clean water practices. Each well we build serves an average of 500 people and provides water for 20+ years. We maintain ongoing relationships with communities to ensure the long-term sustainability of our water projects.',
     'Building sustainable water infrastructure and providing clean, safe drinking water to communities in need.',
     'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
     'Built 120+ wells serving 60,000+ people', 2, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Orphan Care', 'orphan-care', 'Orphan Care & Support', 
     'Our Orphan Care program provides comprehensive support to orphaned and vulnerable children. We ensure access to quality education, healthcare, nutritious meals, and safe housing. Our dedicated team of caregivers and counselors provides emotional support and mentorship to help children heal and thrive. We also support foster families and work to create loving, stable environments for children. Our program includes scholarship opportunities, vocational training for older children, and ongoing support until they reach independence. We believe every child deserves a chance at a bright future.',
     'Comprehensive support for orphaned children including education, healthcare, emotional support, and safe housing.',
     'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=600&fit=crop',
     'Supporting 850+ orphaned children with education and care', 3, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Food Security', 'food-security', 'Food Security & Nutrition', 
     'Our Food Security program addresses hunger and malnutrition through multiple initiatives. We operate food distribution centers that provide monthly food packages to families in need, including rice, grains, cooking oil, and nutritious staples. We also run community gardens and agricultural training programs to help families grow their own food sustainably. Our nutrition programs specifically target children and pregnant women, providing fortified foods and nutritional supplements. During Ramadan and other special occasions, we organize large-scale food distribution events, ensuring that everyone can celebrate with dignity.',
     'Ensuring families have access to nutritious food through distribution programs, community gardens, and nutrition initiatives.',
     'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop',
     'Distributed 2.5M+ meals and supported 8,000+ families', 4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Education', 'education', 'Education for All', 
     'Education is the foundation for breaking the cycle of poverty. Our Education program builds and supports schools in underserved areas, provides scholarships to deserving students, and supplies educational materials including books, computers, and learning resources. We train teachers and support educational infrastructure development. Our program includes adult literacy classes, vocational training programs, and university scholarships. We also provide after-school tutoring and mentorship programs to help students succeed. Our goal is to ensure that every child, regardless of their circumstances, has access to quality education.',
     'Supporting educational opportunities for children and adults through schools, scholarships, and educational resources.',
     'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
     'Built 25 schools and provided 3,200+ scholarships', 5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Helping Families', 'helping-families', 'Family Support & Development', 
     'Our Helping Families program provides comprehensive support to families facing various challenges. We offer housing assistance for families in need of safe, affordable shelter. Our healthcare initiatives provide medical check-ups, vaccinations, and access to essential medicines. We run livelihood programs that teach skills and provide micro-loans to help families start small businesses. Our family counseling services help resolve conflicts and strengthen family bonds. We also provide emergency financial assistance for families facing unexpected crises. Through our network of community centers, we offer a safe space where families can access resources, support, and guidance.',
     'Comprehensive family support including housing assistance, healthcare, livelihood programs, and emergency aid.',
     'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
     'Supported 12,000+ families with housing, healthcare, and livelihood programs', 6, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    short_description = EXCLUDED.short_description,
    image_url = EXCLUDED.image_url,
    impact_text = EXCLUDED.impact_text,
    updated_at = CURRENT_TIMESTAMP;

-- Update any existing records that might have NULL datetime values
UPDATE program_categories 
SET created_at = CURRENT_TIMESTAMP 
WHERE created_at IS NULL;

UPDATE program_categories 
SET updated_at = CURRENT_TIMESTAMP 
WHERE updated_at IS NULL;

SELECT 'Migration 11 completed successfully! Program categories table created with default categories.' as message;

