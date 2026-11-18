-- Preserve all imported catalog values. V1 may already be applied: never edit it.
-- Keep the handle unique constraint; URL has no business length cap or index.
ALTER TABLE store.products ALTER COLUMN handle SET DATA TYPE varchar(255);
ALTER TABLE store.products ALTER COLUMN url SET DATA TYPE text;
