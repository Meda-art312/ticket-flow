ALTER TABLE tickets DROP CONSTRAINT tickets_check;
ALTER TABLE tickets ADD CONSTRAINT checked_in_evidence CHECK(state<>'CHECKED_IN' OR checked_in_at IS NOT NULL);
