-- Read-only preflight. Run in the Supabase SQL editor with the same database role as Render.
-- Does not install extensions, create tables, alter schemas or touch data.
SELECT current_user, current_database(), current_setting('search_path') AS search_path;
SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_store_schema;
SELECT e.extname, n.nspname AS extension_schema
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname IN ('vector', 'hstore', 'uuid-ossp');
SELECT nspname,
       has_schema_privilege(current_user, oid, 'USAGE') AS can_use_schema,
       has_schema_privilege(current_user, oid, 'CREATE') AS can_create_tables
FROM pg_namespace WHERE nspname IN ('store', 'public', 'extensions');
SELECT n.nspname, c.relname, format_type(a.atttypid, a.atttypmod) AS embedding_type
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='stationery_vectors_gemini' AND a.attname='embedding';
SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='stationery_vectors_gemini';
SELECT n.nspname, c.relname,
       has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
       has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='stationery_vectors_gemini' AND c.relkind='r';
