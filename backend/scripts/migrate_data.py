"""Explicit, offline SQL Server -> PostgreSQL transfer. Never invoked by application startup.

Exports contain personal data/password hashes: keep migration-data/ private and untracked.
Database credentials are read only from environment variables, never command arguments/logs.
"""
import argparse
import datetime
import decimal
import hashlib
import json
import os
import re
from pathlib import Path
import sys

# Parent-first order; column names match the JPA model and V1 migration exactly.
TABLES = {
    "users": "user_id username password_hash email full_name phone_number address role created_at is_active",
    "vendors": "vendor_id name",
    "product_types": "product_type_id name is_active",
    "tags": "tag_id name",
    "coupons": "coupon_id code discount_type discount_value min_order_value start_date end_date usage_limit used_count is_active",
    "products": "product_id title handle url available description price price_min price_max compare_at_price rating_average review_count vendor_id product_type_id is_active",
    "product_variants": "variant_id title sku available price compare_at_price option1 option2 option3 stock_quantity version product_id",
    "product_images": "product_id image_url image_position",
    "product_tags": "product_id tag_id",
    "carts": "cart_id user_id created_at",
    "cart_items": "cart_item_id variant_id quantity cart_id",
    "orders": "order_id user_id coupon_id order_date total_amount shipping_address contact_phone status payment_method is_paid discount_amount delivered_at",
    "order_details": "order_detail_id order_id variant_id quantity unit_price sub_total",
    "reviews": "review_id user_id product_id rating comment review_date",
    "password_reset_tokens": "token_id user_id token_hash expires_at used created_at",
    "return_requests": "return_id order_id user_id reason evidence_images status created_at processed_at admin_note",
    "return_request_items": "return_item_id return_id order_detail_id quantity",
    "user_tracking_events": "event_id user_id product_id event_type created_at",
}
FOREIGN_KEYS = {
    "products": {"vendor_id": "vendors", "product_type_id": "product_types"},
    "product_variants": {"product_id": "products"},
    "product_images": {"product_id": "products"}, "product_tags": {"product_id": "products", "tag_id": "tags"},
    "carts": {"user_id": "users"}, "cart_items": {"variant_id": "product_variants", "cart_id": "carts"},
    "orders": {"user_id": "users", "coupon_id": "coupons"},
    "order_details": {"order_id": "orders", "variant_id": "product_variants"},
    "reviews": {"user_id": "users", "product_id": "products"}, "password_reset_tokens": {"user_id": "users"},
    "return_requests": {"order_id": "orders", "user_id": "users"},
    "return_request_items": {"return_id": "return_requests", "order_detail_id": "order_details"},
    "user_tracking_events": {"user_id": "users", "product_id": "products"},
}


class MigrationValidationError(ValueError):
    """Only fixed, safe diagnostics are printed; driver/row values are never printed."""


def encode_value(value):
    if isinstance(value, decimal.Decimal):
        return str(value)  # No floating-point conversion of monetary values.
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    raise TypeError("Unsupported source data type")


def checksum(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def source_error(error, stage):
    """Classify ODBC diagnostics without exposing driver messages or credentials."""
    state = error.args[0] if error.args else None
    state = state if isinstance(state, str) and re.fullmatch(r"[A-Z0-9]{5}", state) else "unknown"
    diagnostic = " ".join(str(arg) for arg in error.args)
    hints = {
        3951: "The transaction did not start under SNAPSHOT isolation. Freeze all source writers before retrying with --source-isolation SERIALIZABLE.",
        3952: "SNAPSHOT isolation is unavailable. Freeze all source writers, then retry with --source-isolation SERIALIZABLE.",
        207: "A mapped source column does not exist. Compare TABLES with the actual SQL Server schema.",
        208: "A mapped dbo table does not exist. Check the source database and schema.",
        229: "The source login lacks SELECT permission on a required object.",
        18456: "SQL Server rejected the source login credentials.",
        4060: "The source database cannot be opened by this login. Check database name and permissions.",
    }
    for code, hint in hints.items():
        if re.search(r"\(" + str(code) + r"\)", diagnostic):
            return MigrationValidationError(f"Source stage: {stage}; SQLSTATE={state}; SQL Server code={code}. {hint}")
    return MigrationValidationError(f"Source stage: {stage}; SQLSTATE={state}. Check source schema, permissions and isolation settings; raw driver details are hidden.")


def export_source(directory, isolation):
    import pyodbc  # Optional migration-only dependency; absent from backend runtime.
    connection_string = os.environ["MIGRATION_SQLSERVER_CONNECTION_STRING"]
    directory.mkdir(parents=True, exist_ok=False)  # Never overwrite an earlier export.
    manifest = {"formatVersion": 1, "tables": []}
    connection = None
    stage = "connecting to SQL Server"
    try:
        connection = pyodbc.connect(connection_string, autocommit=False)
        cursor = connection.cursor()
        stage = "setting source isolation " + isolation
        cursor.execute("SET TRANSACTION ISOLATION LEVEL " + isolation)
        for table, column_text in TABLES.items():
            columns = column_text.split()
            column_sql = ", ".join("[" + column + "]" for column in columns)
            stage = "reading dbo." + table + " with " + isolation
            cursor.execute(f"SELECT {column_sql} FROM [dbo].[{table}]")
            count = 0
            path = directory / (table + ".jsonl")
            with path.open("x", encoding="utf-8", newline="\n") as target:
                while rows := cursor.fetchmany(500):
                    for row in rows:
                        target.write(json.dumps(list(row), default=encode_value, ensure_ascii=False) + "\n")
                        count += 1
            stage = "counting dbo." + table
            cursor.execute(f"SELECT COUNT_BIG(*) FROM [dbo].[{table}]")
            if count != cursor.fetchone()[0]:
                raise MigrationValidationError("Source row count changed: " + table)
            manifest["tables"].append({"name": table, "columns": columns, "count": count, "sha256": checksum(path)})
            print(f"Exported {table}: {count} rows")
        (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    except pyodbc.Error as error:
        raise source_error(error, stage) from None
    finally:
        if connection is not None:
            try:
                connection.rollback()  # Source connection never commits and executes no data writes.
            finally:
                connection.close()


def verify_export(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("formatVersion") != 1 or not isinstance(manifest.get("tables"), list):
        raise MigrationValidationError("Unsupported or incomplete export manifest")
    if [entry.get("name") for entry in manifest["tables"]] != list(TABLES):
        raise MigrationValidationError("Export tables/order do not match the migration schema")
    for entry in manifest["tables"]:
        table = entry["name"]
        columns = TABLES[table].split()
        path = directory / (table + ".jsonl")
        if entry.get("columns") != columns or checksum(path) != entry.get("sha256"):
            raise MigrationValidationError("Export columns or checksum mismatch: " + table)
        count = 0
        with path.open(encoding="utf-8") as source:
            for line in source:
                row = json.loads(line)
                if not isinstance(row, list) or len(row) != len(columns):
                    raise MigrationValidationError("Invalid export row: " + table)
                count += 1
        if count != entry.get("count"):
            raise MigrationValidationError("Export row count mismatch: " + table)
    return manifest


def qualified(table):
    if table not in TABLES:
        raise MigrationValidationError("Unexpected table")
    return '"store"."' + table + '"'


def check_foreign_keys(cursor):
    for child, keys in FOREIGN_KEYS.items():
        for column, parent in keys.items():
            parent_id = TABLES[parent].split()[0]
            cursor.execute(f'SELECT COUNT(*) FROM {qualified(child)} c LEFT JOIN {qualified(parent)} p '
                           f'ON c."{column}" = p."{parent_id}" WHERE c."{column}" IS NOT NULL AND p."{parent_id}" IS NULL')
            if cursor.fetchone()[0] != 0:
                raise MigrationValidationError("Foreign key verification failed: " + child)


def target_string_limits(cursor):
    # Inspect the actual target, not an assumed Flyway version. No row data is read.
    cursor.execute("SELECT table_name, column_name, character_maximum_length "
                   "FROM information_schema.columns WHERE table_schema = 'store' AND table_name = ANY(%s)",
                   (list(TABLES),))
    columns = {(table, column): limit for table, column, limit in cursor.fetchall()}
    for table, column_text in TABLES.items():
        for column in column_text.split():
            if (table, column) not in columns:
                raise MigrationValidationError("Target column missing or not visible: " + table + "." + column)
    return {key: limit for key, limit in columns.items() if limit is not None}


def validate_string_lengths(directory, manifest, limits):
    """Scan every row before INSERT; print coordinates/lengths only, never cell values or IDs."""
    violations = 0
    for entry in manifest["tables"]:
        table = entry["name"]
        with (directory / (table + ".jsonl")).open(encoding="utf-8") as source:
            for line_number, line in enumerate(source, 1):
                for column, value in zip(entry["columns"], json.loads(line)):
                    limit = limits.get((table, column))
                    # Python counts Unicode code points, as PostgreSQL character limits do.
                    if limit is not None and isinstance(value, str) and len(value) > limit:
                        violations += 1
                        print(f"Length violation: table=store.{table} column={column} "
                              f"file={table}.jsonl line={line_number} length={len(value)} limit={limit}",
                              file=sys.stderr)
    if violations:
        raise MigrationValidationError(f"String length preflight failed: {violations} oversized cells. No rows inserted; no values truncated.")
    print("String length preflight passed: all 18 tables checked against the actual target schema")


def check_target_lengths(directory):
    manifest = verify_export(directory)
    import psycopg
    with psycopg.connect(os.environ["MIGRATION_PG_DSN"], user=os.environ["DB_USERNAME"],
                         password=os.environ["DB_PASSWORD"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION READ ONLY")
            validate_string_lengths(directory, manifest, target_string_limits(cursor))


def import_target(directory, dry_run):
    manifest = verify_export(directory)  # Check everything before opening a writable connection.
    import psycopg
    dsn = os.environ["MIGRATION_PG_DSN"]  # libpq DSN, not a JDBC URL; never print it.
    with psycopg.connect(dsn, user=os.environ["DB_USERNAME"], password=os.environ["DB_PASSWORD"], autocommit=True) as connection:
        with connection.transaction(force_rollback=dry_run):
            with connection.cursor() as cursor:
                # Only target business tables are locked. Existing public vector data is untouched.
                cursor.execute("LOCK TABLE " + ", ".join(qualified(table) for table in TABLES) + " IN ACCESS EXCLUSIVE MODE")
                for table in TABLES:
                    cursor.execute("SELECT COUNT(*) FROM " + qualified(table))
                    if cursor.fetchone()[0] != 0:
                        raise MigrationValidationError("Target must be empty; refusing overwrite: " + table)
                # All tables are locked, so limits cannot change between preflight and INSERT.
                validate_string_lengths(directory, manifest, target_string_limits(cursor))
                for entry in manifest["tables"]:
                    table = entry["name"]
                    columns = TABLES[table].split()
                    column_sql = ", ".join('"' + column + '"' for column in columns)
                    placeholders = ", ".join(["%s"] * len(columns))
                    statement = f"INSERT INTO {qualified(table)} ({column_sql}) VALUES ({placeholders})"
                    with (directory / (table + ".jsonl")).open(encoding="utf-8") as source:
                        batch = []
                        for line in source:
                            batch.append(json.loads(line))
                            if len(batch) == 200:
                                cursor.executemany(statement, batch)
                                batch = []
                        if batch:
                            cursor.executemany(statement, batch)
                    cursor.execute("SELECT COUNT(*) FROM " + qualified(table))
                    if cursor.fetchone()[0] != entry["count"]:
                        raise MigrationValidationError("Target count mismatch: " + table)
                    # Preserve imported IDs and advance the identity transactionally (no setval side effects).
                    if table not in ("product_images", "product_tags"):
                        identity = columns[0]
                        cursor.execute(f'SELECT COALESCE(MAX("{identity}"), 0) + 1 FROM {qualified(table)}')
                        next_id = int(cursor.fetchone()[0])
                        cursor.execute(f'ALTER TABLE {qualified(table)} ALTER COLUMN "{identity}" RESTART WITH {next_id}')
                    print(f"Verified {table}: {entry['count']} rows")
                check_foreign_keys(cursor)
                verify_export(directory)  # Catch changes to export files during import before commit.
        print("Dry run complete: target transaction rolled back" if dry_run else "Import committed; all table counts and foreign keys verified")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export")
    export.add_argument("directory", type=Path)
    export.add_argument("--source-isolation", choices=("SNAPSHOT", "SERIALIZABLE"), default="SNAPSHOT")
    verify = commands.add_parser("verify")
    verify.add_argument("directory", type=Path)
    lengths = commands.add_parser("check-lengths", help="Read-only: compare all export strings with actual target column limits")
    lengths.add_argument("directory", type=Path)
    load = commands.add_parser("import")
    load.add_argument("directory", type=Path)
    mode = load.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "export":
            export_source(args.directory, args.source_isolation)
        elif args.command == "verify":
            verify_export(args.directory)
            print("Export checksums, column layout and row counts verified")
        elif args.command == "check-lengths":
            check_target_lengths(args.directory)
        else:
            import_target(args.directory, args.dry_run)
    except Exception as error:
        # Driver exception messages can include connection strings or personal data.
        print("Migration failed (" + type(error).__name__ + "). No source writes; uncommitted target work is rolled back.", file=sys.stderr)
        if isinstance(error, MigrationValidationError):
            print(str(error), file=sys.stderr)  # Only our own fixed diagnostics, never row values.
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
