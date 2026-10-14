ALTER TABLE payment_attempts ADD COLUMN confirms_booking boolean NOT NULL DEFAULT false;
WITH winners AS (
  SELECT DISTINCT ON (p.booking_id) p.id
  FROM payment_attempts p
  WHERE p.state='SUCCEEDED' AND EXISTS(SELECT 1 FROM tickets t WHERE t.booking_id=p.booking_id)
  ORDER BY p.booking_id,p.updated_at,p.id
)
UPDATE payment_attempts p SET confirms_booking=true FROM winners w WHERE p.id=w.id;
CREATE UNIQUE INDEX one_confirming_payment ON payment_attempts(booking_id) WHERE confirms_booking;
