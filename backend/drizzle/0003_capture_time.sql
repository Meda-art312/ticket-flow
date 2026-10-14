ALTER TABLE payment_attempts ADD COLUMN captured_at timestamptz;
UPDATE payment_attempts SET captured_at=updated_at WHERE state='SUCCEEDED';
ALTER TABLE payment_attempts ADD CONSTRAINT captured_payment_time CHECK((state='SUCCEEDED')=(captured_at IS NOT NULL));
