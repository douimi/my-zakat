-- Migration 19: Rename "Cheque" to "Check" in existing donation rows

UPDATE donations
SET payment_method = 'Check'
WHERE payment_method = 'Cheque';

SELECT 'Migration 19 completed successfully!' as message;
