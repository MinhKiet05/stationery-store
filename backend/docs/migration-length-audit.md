# Local export string length audit

`backend/migration-data/export-2026-11-18-v6`: manifest, checksums and layout verified; 18 tables, 2,772 rows.

All strings were compared with V1 varchar limits. Only products.handle and products.url exceed them.
65 oversized cells: 8 handles (maximum 148, limit 100), 57 URLs (maximum 178, limit 100).
No other bounded string column exceeds V1. No cell values, IDs, emails, tokens or password hashes are included.

The coordinates below identify every offending cell: JSONL file, 1-based line and column.
A JSONL line number is not a database ID. Inspect values locally only; do not paste them into logs/chat.

```text
Length violation: table=store.products column=url file=products.jsonl line=2 length=106 limit=100
Length violation: table=store.products column=url file=products.jsonl line=4 length=105 limit=100
Length violation: table=store.products column=url file=products.jsonl line=5 length=103 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=7 length=111 limit=100
Length violation: table=store.products column=url file=products.jsonl line=7 length=141 limit=100
Length violation: table=store.products column=url file=products.jsonl line=8 length=120 limit=100
Length violation: table=store.products column=url file=products.jsonl line=17 length=114 limit=100
Length violation: table=store.products column=url file=products.jsonl line=19 length=130 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=20 length=104 limit=100
Length violation: table=store.products column=url file=products.jsonl line=20 length=134 limit=100
Length violation: table=store.products column=url file=products.jsonl line=26 length=122 limit=100
Length violation: table=store.products column=url file=products.jsonl line=27 length=104 limit=100
Length violation: table=store.products column=url file=products.jsonl line=28 length=112 limit=100
Length violation: table=store.products column=url file=products.jsonl line=29 length=118 limit=100
Length violation: table=store.products column=url file=products.jsonl line=33 length=103 limit=100
Length violation: table=store.products column=url file=products.jsonl line=34 length=115 limit=100
Length violation: table=store.products column=url file=products.jsonl line=35 length=113 limit=100
Length violation: table=store.products column=url file=products.jsonl line=36 length=117 limit=100
Length violation: table=store.products column=url file=products.jsonl line=37 length=107 limit=100
Length violation: table=store.products column=url file=products.jsonl line=38 length=123 limit=100
Length violation: table=store.products column=url file=products.jsonl line=39 length=121 limit=100
Length violation: table=store.products column=url file=products.jsonl line=40 length=122 limit=100
Length violation: table=store.products column=url file=products.jsonl line=43 length=120 limit=100
Length violation: table=store.products column=url file=products.jsonl line=45 length=108 limit=100
Length violation: table=store.products column=url file=products.jsonl line=48 length=110 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=55 length=105 limit=100
Length violation: table=store.products column=url file=products.jsonl line=55 length=135 limit=100
Length violation: table=store.products column=url file=products.jsonl line=57 length=112 limit=100
Length violation: table=store.products column=url file=products.jsonl line=59 length=109 limit=100
Length violation: table=store.products column=url file=products.jsonl line=60 length=125 limit=100
Length violation: table=store.products column=url file=products.jsonl line=62 length=107 limit=100
Length violation: table=store.products column=url file=products.jsonl line=63 length=107 limit=100
Length violation: table=store.products column=url file=products.jsonl line=64 length=105 limit=100
Length violation: table=store.products column=url file=products.jsonl line=65 length=101 limit=100
Length violation: table=store.products column=url file=products.jsonl line=82 length=117 limit=100
Length violation: table=store.products column=url file=products.jsonl line=87 length=116 limit=100
Length violation: table=store.products column=url file=products.jsonl line=88 length=104 limit=100
Length violation: table=store.products column=url file=products.jsonl line=89 length=117 limit=100
Length violation: table=store.products column=url file=products.jsonl line=92 length=105 limit=100
Length violation: table=store.products column=url file=products.jsonl line=93 length=117 limit=100
Length violation: table=store.products column=url file=products.jsonl line=94 length=106 limit=100
Length violation: table=store.products column=url file=products.jsonl line=95 length=107 limit=100
Length violation: table=store.products column=url file=products.jsonl line=97 length=107 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=99 length=130 limit=100
Length violation: table=store.products column=url file=products.jsonl line=99 length=160 limit=100
Length violation: table=store.products column=url file=products.jsonl line=103 length=108 limit=100
Length violation: table=store.products column=url file=products.jsonl line=104 length=110 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=109 length=106 limit=100
Length violation: table=store.products column=url file=products.jsonl line=109 length=136 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=111 length=111 limit=100
Length violation: table=store.products column=url file=products.jsonl line=111 length=141 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=112 length=111 limit=100
Length violation: table=store.products column=url file=products.jsonl line=112 length=141 limit=100
Length violation: table=store.products column=handle file=products.jsonl line=116 length=148 limit=100
Length violation: table=store.products column=url file=products.jsonl line=116 length=178 limit=100
Length violation: table=store.products column=url file=products.jsonl line=121 length=110 limit=100
Length violation: table=store.products column=url file=products.jsonl line=122 length=118 limit=100
Length violation: table=store.products column=url file=products.jsonl line=124 length=104 limit=100
Length violation: table=store.products column=url file=products.jsonl line=131 length=102 limit=100
Length violation: table=store.products column=url file=products.jsonl line=132 length=130 limit=100
Length violation: table=store.products column=url file=products.jsonl line=133 length=118 limit=100
Length violation: table=store.products column=url file=products.jsonl line=134 length=109 limit=100
Length violation: table=store.products column=url file=products.jsonl line=147 length=107 limit=100
Length violation: table=store.products column=url file=products.jsonl line=149 length=112 limit=100
Length violation: table=store.products column=url file=products.jsonl line=150 length=114 limit=100
```

V2 widens handle to varchar(255), retaining UNIQUE, and url to text. V1 is unchanged.
Offline rescan using these two V2 changes: no remaining oversized strings in any of the 18 tables.
This does not confirm that V2 has run on Supabase. Use check-lengths to inspect actual target limits.

## Changes and validation

- `backend/scripts/migrate_data.py`: read actual information_schema limits, scan all 18 tables before INSERT, add read-only check-lengths; retain transaction/rollback and checksum checks.
- `backend/src/main/resources/db/migration/V2__widen_product_handle_and_url.sql`: widen only the two offending columns; preserve existing rows and the UNIQUE handle constraint. V1 is not edited.
- `backend/src/main/java/com/example/backend/model/Product.java`: match V2 with handle length 255 and URL text.
- `backend/src/main/java/com/example/backend/services/impl/ProductServiceImpl.java`: allow handles up to 255 Unicode code points so imported handles can be edited through the API.
- `backend/scripts/test_migrate_data.py`: test multiple offending rows/columns, privacy of diagnostics, Unicode boundaries, unbounded text and missing target metadata.
- `backend/scripts/test_import_postgres.py`: use synthetic local fixtures to test V1 length failure before any INSERT, read-only checks, V2 success without truncation, and atomic rollback.
- `backend/src/test/java/com/example/backend/deployment/PostgresMigrationTest.java`: test applied-V1 upgrade, row preservation, handle uniqueness and no repeated migrations.
- `backend/src/test/java/com/example/backend/deployment/ProductionReadinessTest.java`: validate current Flyway version 2, long-string JPA round trip, service edits and rejection above 255.
- `backend/docs/data-migration.md`: manual Flyway V2 and dry-run steps, with AI disabled and no automatic apply.
- `backend/docs/migration-length-audit.md`: this safe local audit report.

Validation: 75 Java tests passed (0 failures/errors/skips, including disposable PostgreSQL),
9 Python unit tests and 1 disposable PostgreSQL integration test passed.
All database test writes used synthetic fixtures on localhost. No CLI --apply, real-data import,
Supabase schema mutation, deployment, commit or push was performed by the agent.

## Manifest counts

| Table | Rows |
| --- | --- |
| users | 3 |
| vendors | 11 |
| product_types | 40 |
| tags | 119 |
| coupons | 0 |
| products | 150 |
| product_variants | 407 |
| product_images | 1261 |
| product_tags | 747 |
| carts | 0 |
| cart_items | 0 |
| orders | 5 |
| order_details | 9 |
| reviews | 0 |
| password_reset_tokens | 4 |
| return_requests | 0 |
| return_request_items | 0 |
| user_tracking_events | 16 |
