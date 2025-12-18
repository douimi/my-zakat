-- Migration 16: Populate Programs table with sample data
-- This creates sample programs linked to their respective categories

-- First, ensure we have category IDs (they should exist from migration 11)
-- We'll use slugs to find category IDs since they're unique

-- Insert programs for Emergency Relief category
INSERT INTO programs (category_id, title, slug, description, short_description, image_url, impact_text, display_order, is_active, created_at, updated_at)
SELECT 
    id,
    'Rapid Response Team',
    'rapid-response-team',
    'Our Rapid Response Team deploys within 24-48 hours of a crisis to deliver immediate aid. We provide emergency food packages, clean water, medical supplies, temporary shelter, and essential hygiene items. Our trained volunteers work with local partners to ensure aid reaches those most in need quickly and efficiently.',
    'Deploying within 24-48 hours to deliver immediate emergency aid and supplies to crisis-affected communities.',
    'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=600&fit=crop',
    'Responded to 45+ emergencies this year',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'emergency-relief'

UNION ALL

SELECT 
    id,
    'Disaster Relief Fund',
    'disaster-relief-fund',
    'The Disaster Relief Fund provides flexible funding for immediate response to natural disasters, conflicts, and humanitarian crises. Funds are used for emergency shelter, food distribution, medical care, and rebuilding efforts. We work with trusted local organizations to ensure aid reaches affected communities quickly.',
    'Flexible funding for immediate disaster response and recovery efforts worldwide.',
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=800&h=600&fit=crop',
    'Supported 12,000+ families in crisis',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'emergency-relief'

UNION ALL

-- Insert programs for Water category
SELECT 
    id,
    'Well Construction Project',
    'well-construction-project',
    'We build deep, sustainable wells in communities without access to clean water. Each well serves an average of 500 people and provides water for 20+ years. Our team conducts geological surveys, works with local engineers, and trains community members to maintain the wells long-term.',
    'Building sustainable deep wells that provide clean water for 500+ people for 20+ years.',
    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
    'Built 85+ wells serving 42,500+ people',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'water'

UNION ALL

SELECT 
    id,
    'Water Filtration Systems',
    'water-filtration-systems',
    'We install and maintain water filtration systems in schools, mosques, and community centers. These systems purify contaminated water sources, making them safe for drinking and cooking. We provide training on system maintenance and water hygiene practices.',
    'Installing filtration systems to purify water sources in schools and community centers.',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop',
    'Installed 200+ filtration systems',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'water'

UNION ALL

SELECT 
    id,
    'Water Storage Solutions',
    'water-storage-solutions',
    'We provide water storage tanks and containers to communities, enabling them to store clean water safely. This is especially important in areas with intermittent water supply or during dry seasons. We also train communities on water conservation and storage best practices.',
    'Providing water storage solutions to ensure communities have access to clean water year-round.',
    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
    'Provided storage to 150+ communities',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'water'

UNION ALL

-- Insert programs for Orphan Care category
SELECT 
    id,
    'Orphan Sponsorship Program',
    'orphan-sponsorship-program',
    'Our sponsorship program connects donors with orphaned children, providing monthly support for education, healthcare, food, clothing, and other essential needs. Sponsors receive regular updates about their sponsored child''s progress. We ensure children receive quality education and emotional support.',
    'Monthly sponsorship program providing education, healthcare, and essential support for orphaned children.',
    'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=600&fit=crop',
    'Supporting 650+ orphaned children',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'orphan-care'

UNION ALL

SELECT 
    id,
    'Orphanage Support',
    'orphanage-support',
    'We partner with orphanages to improve living conditions, provide educational resources, and ensure children receive proper nutrition and healthcare. Our support includes infrastructure improvements, educational materials, medical check-ups, and training for caregivers.',
    'Comprehensive support for orphanages including infrastructure, education, and healthcare improvements.',
    'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&h=600&fit=crop',
    'Supporting 15+ orphanages',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'orphan-care'

UNION ALL

SELECT 
    id,
    'Educational Scholarships for Orphans',
    'educational-scholarships-orphans',
    'We provide full scholarships for orphaned children to attend quality schools, covering tuition, books, uniforms, and school supplies. Scholarships are available from primary school through university. We also provide tutoring and mentorship to help children succeed academically.',
    'Full educational scholarships from primary school through university for orphaned children.',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
    'Awarded 180+ scholarships',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'orphan-care'

UNION ALL

-- Insert programs for Food Security category
SELECT 
    id,
    'Monthly Food Distribution',
    'monthly-food-distribution',
    'We operate food distribution centers that provide monthly food packages to families in need. Each package includes rice, grains, cooking oil, lentils, and other nutritious staples. We serve thousands of families monthly, ensuring they have access to essential nutrition.',
    'Monthly food packages providing essential nutrition to families in need.',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop',
    'Distributing 1.8M+ meals monthly',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

SELECT 
    id,
    'Community Gardens Initiative',
    'community-gardens-initiative',
    'We help communities establish and maintain community gardens, providing seeds, tools, training, and ongoing support. These gardens provide fresh produce for families and create sustainable food sources. We teach sustainable farming techniques and water conservation methods.',
    'Establishing community gardens to create sustainable food sources and teach farming skills.',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=600&fit=crop',
    'Established 50+ community gardens',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

SELECT 
    id,
    'Ramadan Food Packages',
    'ramadan-food-packages',
    'During Ramadan, we distribute special food packages to help families break their fasts with nutritious meals. Packages include dates, rice, meat, vegetables, and other traditional foods. We also organize community iftar meals, bringing families together during this blessed month.',
    'Special Ramadan food packages and community iftar meals for families in need.',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop',
    'Distributed 25,000+ Ramadan packages',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

SELECT 
    id,
    'Nutrition for Children',
    'nutrition-for-children',
    'Our child nutrition program provides fortified foods and nutritional supplements to children under 5 and pregnant women. We conduct nutrition education workshops for mothers and provide regular health check-ups. This program addresses malnutrition and ensures healthy development.',
    'Fortified foods and nutritional support for children and pregnant women.',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=600&fit=crop',
    'Supporting 3,500+ children',
    4,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'food-security'

UNION ALL

-- Insert programs for Education category
SELECT 
    id,
    'School Construction',
    'school-construction',
    'We build and renovate schools in underserved areas, providing safe learning environments for children. Our schools include classrooms, libraries, computer labs, and playgrounds. We work with local communities to ensure schools are maintained and properly staffed.',
    'Building and renovating schools to provide quality learning environments for children.',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
    'Built 18 schools serving 8,000+ students',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Student Scholarship Program',
    'student-scholarship-program',
    'We provide scholarships to deserving students who cannot afford school fees. Scholarships cover tuition, books, uniforms, and other educational expenses. We support students from primary school through university, helping them achieve their educational goals.',
    'Comprehensive scholarships covering tuition and educational expenses for deserving students.',
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop',
    'Awarded 2,400+ scholarships',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Educational Resources & Supplies',
    'educational-resources-supplies',
    'We provide schools and students with essential educational resources including textbooks, notebooks, stationery, computers, and learning materials. We also establish libraries and computer labs to enhance learning opportunities for students.',
    'Providing textbooks, computers, and learning materials to schools and students.',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop',
    'Supplied 50+ schools with resources',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Adult Literacy Program',
    'adult-literacy-program',
    'We offer free literacy classes for adults who missed out on education. Classes are held in community centers and mosques, making them accessible to everyone. We teach reading, writing, basic math, and practical life skills. Graduates receive certificates and ongoing support.',
    'Free literacy classes teaching reading, writing, and life skills to adults.',
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop',
    'Taught 1,200+ adults to read and write',
    4,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

SELECT 
    id,
    'Vocational Training',
    'vocational-training',
    'We provide vocational training programs teaching practical skills such as carpentry, tailoring, computer skills, and small business management. These programs help individuals gain employment or start their own businesses, improving their economic situation.',
    'Practical skills training for employment and entrepreneurship opportunities.',
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop',
    'Trained 800+ individuals',
    5,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'education'

UNION ALL

-- Insert programs for Helping Families category
SELECT 
    id,
    'Housing Assistance Program',
    'housing-assistance-program',
    'We provide housing assistance to families in need, including rent support, home repairs, and construction of new homes for those without adequate shelter. We work with families to improve their living conditions and ensure they have safe, secure housing.',
    'Supporting families with rent assistance, home repairs, and new home construction.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Assisted 450+ families with housing',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Family Healthcare Initiative',
    'family-healthcare-initiative',
    'We provide free medical check-ups, vaccinations, and essential medicines to families who cannot afford healthcare. We organize health camps in underserved areas and partner with local clinics to provide ongoing care. We also conduct health education workshops.',
    'Free medical check-ups, vaccinations, and essential medicines for families in need.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Provided healthcare to 5,000+ families',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Livelihood & Skills Training',
    'livelihood-skills-training',
    'We provide skills training and micro-loans to help families start small businesses and become self-sufficient. Training includes business management, financial literacy, and practical skills. We support entrepreneurs with mentorship and access to markets.',
    'Skills training and micro-loans to help families start businesses and become self-sufficient.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Supported 600+ small businesses',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Emergency Family Support',
    'emergency-family-support',
    'We provide emergency financial assistance to families facing unexpected crises such as medical emergencies, job loss, or natural disasters. Support includes cash assistance, essential supplies, and counseling services. We help families get back on their feet during difficult times.',
    'Emergency financial assistance and support for families facing unexpected crises.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Assisted 1,200+ families in emergencies',
    4,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

UNION ALL

SELECT 
    id,
    'Family Counseling Services',
    'family-counseling-services',
    'We provide free family counseling services to help resolve conflicts, strengthen family bonds, and support mental health. Our trained counselors work with families to address issues such as domestic violence, substance abuse, and family disputes. Services are confidential and culturally sensitive.',
    'Free counseling services to strengthen family bonds and resolve conflicts.',
    'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&h=600&fit=crop',
    'Counseled 800+ families',
    5,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM program_categories WHERE slug = 'helping-families'

ON CONFLICT (slug) DO NOTHING;

-- Update timestamps for any existing programs
UPDATE programs 
SET updated_at = CURRENT_TIMESTAMP 
WHERE updated_at IS NULL OR updated_at < created_at;

-- Verify the data
SELECT 
    pc.name as category_name,
    COUNT(p.id) as program_count,
    STRING_AGG(p.title, ', ' ORDER BY p.display_order) as programs
FROM program_categories pc
LEFT JOIN programs p ON p.category_id = pc.id
GROUP BY pc.id, pc.name, pc.display_order
ORDER BY pc.display_order;

SELECT 'Migration 16 completed successfully! Programs populated and linked to categories.' as message;

