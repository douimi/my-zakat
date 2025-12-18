-- Migration 14: REMOVED - This migration was adding slideshow content that affected the home page
-- The home page slideshow should remain independent
-- Category-specific slideshows will be managed separately through category pages

-- This migration is now empty and should not be run
-- Category pages will have their own content management system
INSERT INTO slideshow_slides (title, description, image_url, cta_text, cta_url, display_order, is_active, created_at, updated_at)
VALUES
    -- Emergency Relief slides
    ('Emergency Relief - Rapid Response', 
     'Our emergency response teams deliver essential supplies within 24-48 hours of a crisis. Help us be ready when disaster strikes.',
     'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1200&h=600&fit=crop',
     'Support Emergency Relief',
     '/donate?category=emergency-relief',
     1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Emergency Relief - Essential Supplies', 
     'We provide food, clean water, medical aid, and temporary shelter to families affected by emergencies.',
     'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&h=600&fit=crop',
     'Learn More',
     '/donate?category=emergency-relief',
     2, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Water slides
    ('Clean Water Initiative', 
     'Every well we build serves 500+ people for 20+ years. Help us bring clean water to communities in need.',
     'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&h=600&fit=crop',
     'Support Water Projects',
     '/donate?category=water',
     3, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Sustainable Water Solutions', 
     'We build wells, install filtration systems, and provide water storage solutions to ensure long-term access to clean water.',
     'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=600&fit=crop',
     'Donate Now',
     '/donate?category=water',
     4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Orphan Care slides
    ('Orphan Care - Building Bright Futures', 
     'We provide education, healthcare, and emotional support to orphaned children. Help us give them the future they deserve.',
     'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1200&h=600&fit=crop',
     'Support Orphan Care',
     '/donate?category=orphan-care',
     5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Comprehensive Child Support', 
     'Our program includes education, healthcare, nutritious meals, safe housing, and mentorship for orphaned children.',
     'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1200&h=600&fit=crop',
     'Learn More',
     '/donate?category=orphan-care',
     6, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Food Security slides
    ('Food Security - Fighting Hunger', 
     'We distribute nutritious food packages and run community gardens to ensure families have access to healthy meals.',
     'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&h=600&fit=crop',
     'Support Food Programs',
     '/donate?category=food-security',
     7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Nutrition for All', 
     'Our food security programs reach thousands of families monthly, providing essential nutrition and teaching sustainable farming.',
     'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&h=600&fit=crop',
     'Donate Now',
     '/donate?category=food-security',
     8, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Education slides
    ('Education for All', 
     'We build schools, provide scholarships, and supply educational materials to ensure every child has access to quality education.',
     'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&h=600&fit=crop',
     'Support Education',
     '/donate?category=education',
     9, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Building Tomorrow''s Leaders', 
     'Through schools, scholarships, and educational resources, we''re empowering the next generation to break the cycle of poverty.',
     'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=600&fit=crop',
     'Learn More',
     '/donate?category=education',
     10, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Helping Families slides
    ('Helping Families Thrive', 
     'We provide housing assistance, healthcare, livelihood programs, and emergency support to help families overcome challenges.',
     'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&h=600&fit=crop',
     'Support Families',
     '/donate?category=helping-families',
     11, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    
    ('Comprehensive Family Support', 
     'From housing to healthcare, from skills training to emergency aid - we''re here to support families every step of the way.',
     'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&h=600&fit=crop',
     'Donate Now',
     '/donate?category=helping-families',
     12, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

ON CONFLICT DO NOTHING;

-- Update display order to ensure proper sequencing
UPDATE slideshow_slides SET display_order = id WHERE display_order = 0 OR display_order IS NULL;

SELECT 'Migration 14 completed successfully! Slideshow content added for all program categories.' as message;

