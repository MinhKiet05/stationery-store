-- Additive only: historical evidence and settled records are never rewritten.
ALTER TABLE return_requests ADD COLUMN evidence_public_ids text;
ALTER TABLE return_request_items ADD COLUMN gross_amount numeric(12,2);
ALTER TABLE return_request_items ADD COLUMN discount_amount numeric(12,2);
ALTER TABLE return_request_items ADD COLUMN net_amount numeric(12,2);
ALTER TABLE return_request_items ADD CONSTRAINT return_estimate_amounts CHECK (
    (gross_amount IS NULL AND discount_amount IS NULL AND net_amount IS NULL)
    OR (gross_amount IS NOT NULL AND discount_amount IS NOT NULL AND net_amount IS NOT NULL
        AND gross_amount >= 0 AND discount_amount >= 0 AND net_amount >= 0
        AND gross_amount = discount_amount + net_amount));
