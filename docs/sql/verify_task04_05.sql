-- Vendor records and referenced-product counts
SELECT
    v.vendor_id,
    v.name,
    COUNT(p.product_id) AS product_count
FROM vendors AS v
LEFT JOIN products AS p ON p.vendor_id = v.vendor_id
GROUP BY v.vendor_id, v.name
ORDER BY v.vendor_id;

-- Tag records
SELECT tag_id, name
FROM tags
ORDER BY tag_id;

-- Product-tag links
SELECT product_id, tag_id
FROM product_tags
ORDER BY product_id, tag_id;

-- Tag link counts, useful after deleting a tag
SELECT t.tag_id, t.name, COUNT(pt.product_id) AS product_count
FROM tags AS t
LEFT JOIN product_tags AS pt ON pt.tag_id = t.tag_id
GROUP BY t.tag_id, t.name
ORDER BY t.tag_id;