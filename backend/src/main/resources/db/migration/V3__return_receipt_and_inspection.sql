-- Additive only: existing requests are NOT marked received or inspected.
-- Return approval/refund status and original orders remain unchanged.
CREATE TABLE store.return_receipts (
    return_id bigint PRIMARY KEY REFERENCES store.return_requests(return_id),
    received_at timestamp(6) NOT NULL,
    received_by bigint NOT NULL REFERENCES store.users(user_id),
    inspected_at timestamp(6),
    inspected_by bigint REFERENCES store.users(user_id),
    inspection_note varchar(1000),
    CONSTRAINT ck_return_inspector CHECK (
        (inspected_at IS NULL AND inspected_by IS NULL) OR
        (inspected_at IS NOT NULL AND inspected_by IS NOT NULL)
    )
);
CREATE TABLE store.return_receipt_items (
    -- One receipt/immutable inspection result per original return item.
    return_item_id bigint PRIMARY KEY REFERENCES store.return_request_items(return_item_id),
    return_id bigint NOT NULL REFERENCES store.return_receipts(return_id),
    variant_id bigint NOT NULL REFERENCES store.product_variants(variant_id),
    received_quantity integer NOT NULL CHECK (received_quantity >= 0),
    good_quantity integer,
    damaged_quantity integer,
    stock_before integer,
    stock_after integer,
    CONSTRAINT ck_return_inspection_quantities CHECK (
        (good_quantity IS NULL AND damaged_quantity IS NULL AND stock_before IS NULL AND stock_after IS NULL) OR
        (good_quantity IS NOT NULL AND damaged_quantity IS NOT NULL AND stock_before IS NOT NULL AND stock_after IS NOT NULL
         AND good_quantity >= 0 AND damaged_quantity >= 0
         AND CAST(good_quantity AS bigint) + CAST(damaged_quantity AS bigint) = received_quantity
         AND stock_before >= 0 AND stock_after >= 0
         AND CAST(stock_before AS bigint) + CAST(good_quantity AS bigint) = stock_after)
    )
);
CREATE INDEX ix_return_receipt_items_request ON store.return_receipt_items(return_id);
