-- Review only; NOT a Flyway migration. This file was NOT run on Supabase.
-- Inspect existing definitions (IF NOT EXISTS checks names, not equivalent definitions).
SELECT tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'store'
AND tablename IN ('products','product_variants','reviews','orders','return_requests','coupons','users')
ORDER BY tablename, indexname;

-- Use a sanitized staging copy with representative volumes. EXPLAIN below does not execute the query.
EXPLAIN (COSTS, VERBOSE)
SELECT order_id, order_date FROM store.orders
WHERE order_date >= TIMESTAMP '2026-10-01' AND order_date < TIMESTAMP '2026-11-01'
ORDER BY order_date DESC, order_id DESC LIMIT 10;
EXPLAIN (COSTS, VERBOSE)
SELECT review_id, review_date FROM store.reviews
ORDER BY review_date DESC, review_id DESC LIMIT 10;
EXPLAIN (COSTS, VERBOSE)
SELECT return_id, created_at FROM store.return_requests
ORDER BY created_at DESC, return_id DESC LIMIT 10;

-- Candidates only after measuring staging EXPLAIN (ANALYZE, BUFFERS), comparing existing indexes
-- and confirming sort/filter workload. No index is required to deploy this change.
-- Global order statistics/list dates cannot use the leading user_id of ix_orders_user_date well.
-- CREATE INDEX CONCURRENTLY ix_orders_date_id ON store.orders(order_date DESC, order_id DESC);
-- CREATE INDEX CONCURRENTLY ix_reviews_date_id ON store.reviews(review_date DESC, review_id DESC);
-- CREATE INDEX CONCURRENTLY ix_returns_date_id ON store.return_requests(created_at DESC, return_id DESC);
-- Run each chosen CONCURRENTLY statement separately outside a transaction block.
-- Existing unique product handle/SKU/coupon code/username/email indexes already cover lookups.
-- Existing product/vendor/category, variant/product, reviews/product/user and order/user/date
-- indexes remain unchanged. A plain B-tree does not fix leading-% contains search; do not add
-- indexes to every text/filter column. Assess pg_trgm on the EXACT normalized SQL expression
-- only if staging plans demonstrate that contains search, rather than connection/network, dominates.
