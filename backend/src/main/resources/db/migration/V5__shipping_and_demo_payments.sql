ALTER TABLE orders ADD COLUMN shipping_method varchar(20) NOT NULL DEFAULT 'STANDARD';
ALTER TABLE orders ADD COLUMN shipping_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0);
ALTER TABLE orders ADD COLUMN payment_mode varchar(20) NOT NULL DEFAULT 'LIVE' CHECK (payment_mode IN ('LIVE','DEMO'));
ALTER TABLE orders ADD COLUMN paid_at timestamp(6);
ALTER TABLE orders ADD COLUMN payment_reference varchar(100);
ALTER TABLE orders ADD COLUMN payment_confirmed_by varchar(100);
CREATE UNIQUE INDEX orders_payment_reference_unique ON orders(payment_reference);
