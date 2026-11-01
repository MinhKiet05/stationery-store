-- Read-only comparison for Task 14 / UC035-UC037.
-- Use the same date range as Postman. Run against the stationery_shop database.
SET NOCOUNT ON;
DECLARE @startDate date = '2026-11-01';
DECLARE @endDate date = '2026-11-30';
DECLARE @endExclusive datetime2 = DATEADD(day, 1, CAST(@endDate AS datetime2));
DECLARE @productTypeID bigint = NULL;

-- UC035: aggregate orders before joining any details to avoid multiplying totals.
SELECT COUNT_BIG(*) AS successfulOrders,
       COALESCE(SUM(total_amount), 0) AS totalRevenue,
       COALESCE(SUM(discount_amount), 0) AS totalDiscount
FROM orders
WHERE order_date >= @startDate AND order_date < @endExclusive
  AND (status = 'DELIVERED' OR (status = 'RETURN_PENDING' AND delivered_at IS NOT NULL));

SELECT CAST(order_date AS date) AS periodStart, COUNT_BIG(*) AS orderCount,
       COALESCE(SUM(total_amount), 0) AS totalRevenue,
       COALESCE(SUM(discount_amount), 0) AS totalDiscount
FROM orders
WHERE order_date >= @startDate AND order_date < @endExclusive
  AND (status = 'DELIVERED' OR (status = 'RETURN_PENDING' AND delivered_at IS NOT NULL))
GROUP BY CAST(order_date AS date)
ORDER BY periodStart;

-- UC036: paid amount uses the actual is_paid flag; discounts are already in total_amount.
SELECT TOP (10) u.user_id AS userID, u.username, u.full_name AS fullName,
       COUNT_BIG(*) AS orderCount,
       COALESCE(SUM(CASE WHEN o.is_paid = 1 THEN o.total_amount ELSE 0 END), 0) AS totalPaid
FROM users u JOIN orders o ON o.user_id = u.user_id
WHERE u.role = 'CUSTOMER'
  AND o.order_date >= @startDate AND o.order_date < @endExclusive
  AND (o.status = 'DELIVERED' OR (o.status = 'RETURN_PENDING' AND o.delivered_at IS NOT NULL))
GROUP BY u.user_id, u.username, u.full_name
ORDER BY totalPaid DESC, u.user_id ASC;
-- To compare sortBy=ORDERS, change ORDER BY to orderCount DESC, u.user_id ASC.

-- UC037: sum stored line amounts, combining every variant of the same product.
SELECT TOP (10) p.product_id AS productID, p.title,
       SUM(CAST(d.quantity AS bigint)) AS quantitySold, SUM(d.sub_total) AS revenue
FROM order_details d
JOIN orders o ON o.order_id = d.order_id
JOIN product_variants v ON v.variant_id = d.variant_id
JOIN products p ON p.product_id = v.product_id
WHERE o.order_date >= @startDate AND o.order_date < @endExclusive
  AND (o.status = 'DELIVERED' OR (o.status = 'RETURN_PENDING' AND o.delivered_at IS NOT NULL))
  AND (@productTypeID IS NULL OR p.product_type_id = @productTypeID)
GROUP BY p.product_id, p.title
ORDER BY quantitySold DESC, p.product_id ASC;
-- To compare sortBy=REVENUE, change ORDER BY to revenue DESC, p.product_id ASC.

SELECT status, COUNT_BIG(*) AS orderCount
FROM orders WHERE order_date >= @startDate AND order_date < @endExclusive
GROUP BY status;

SELECT status, COUNT_BIG(*) AS requestCount
FROM return_requests WHERE created_at >= @startDate AND created_at < @endExclusive
GROUP BY status;

-- Return status APPROVED/COMPLETED is not treated as proof of a refund.
-- The current schema has no confirmed refund amount; these totals precede refunds.
