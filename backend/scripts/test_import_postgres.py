"""Opt-in import test against a fresh disposable local PostgreSQL database only."""
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from migrate_data import TABLES, checksum, import_target, check_target_lengths, MigrationValidationError


@unittest.skipUnless(os.getenv("TEST_MIGRATION_DSN"), "No disposable PostgreSQL DSN supplied")
class PostgresImportTest(unittest.TestCase):
    def test_dry_run_fk_failure_atomic_rollback_apply_and_refuse_overwrite(self):
        import psycopg
        os.environ.setdefault("DB_PASSWORD", "")  # Disposable localhost test server uses trust authentication.
        os.environ["MIGRATION_PG_DSN"] = os.environ["TEST_MIGRATION_DSN"]
        with psycopg.connect(os.environ["TEST_MIGRATION_DSN"], user=os.environ["DB_USERNAME"], password=os.environ["DB_PASSWORD"]) as connection:
            # Fails safely if the database already has a store schema. Never drop/reset a schema.
            connection.execute("CREATE SCHEMA store")
            connection.execute("SET search_path TO store")
            ddl = Path(__file__).resolve().parents[1] / "src/main/resources/db/migration/V1__business_schema.sql"
            connection.execute(ddl.read_text(encoding="utf-8"))
        rows = {
            "users": [100, "migration-test", "test-hash", "migration@example.test", "Tiếng Việt", None, None, "CUSTOMER", None, True],
            "vendors": [101, "Vendor"], "product_types": [102, "Bút", True], "tags": [103, "Test"],
            "coupons": [104, "TEST", "FIXED_AMOUNT", "1.00", None, None, None, None, 0, True],
            "products": [105, "Bút 🖊", "migration-pen", None, True, "Mô tả", "10.00", "10.00", "10.00", None, "0.00", 0, 101, 102, True],
            "product_variants": [106, "Xanh", None, True, "10.00", None, None, None, None, 10, 0, 105],
            "product_images": [105, "https://example.test/image.png", 0], "product_tags": [105, 103],
            "carts": [107, 100, None], "cart_items": [108, 106, 1, 107],
            "orders": [109, 100, 104, "2026-11-18T10:00:00", "10.00", None, None, "DELIVERED", None, True, "1.00", "2026-11-18T10:00:00"],
            "order_details": [110, 109, 106, 1, "10.00", "10.00"], "reviews": [111, 100, 105, 5, "Tốt", None],
            "password_reset_tokens": [112, 100, "0" * 64, "2026-11-18T10:30:00", False, "2026-11-18T10:00:00"],
            "return_requests": [113, 109, 100, "Test", None, "PENDING", "2026-11-18T10:00:00", None, None],
            "return_request_items": [114, 113, 110, 1], "user_tracking_events": [115, 100, 105, "VIEW_PRODUCT", "2026-11-18T10:00:00"],
        }
        with tempfile.TemporaryDirectory() as temporary, contextlib.redirect_stdout(io.StringIO()):
            directory = Path(temporary)

            def fixture():
                manifest = {"formatVersion": 1, "tables": []}
                for table, columns in TABLES.items():
                    path = directory / (table + ".jsonl")
                    path.write_text(json.dumps(rows[table], ensure_ascii=False) + "\n", encoding="utf-8")
                    manifest["tables"].append({"name": table, "columns": columns.split(), "count": 1, "sha256": checksum(path)})
                (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            def counts():
                with psycopg.connect(os.environ["TEST_MIGRATION_DSN"], user=os.environ["DB_USERNAME"], password=os.environ["DB_PASSWORD"]) as connection:
                    return [connection.execute('SELECT COUNT(*) FROM store."' + table + '"').fetchone()[0] for table in TABLES]

            fixture()
            # Fail against real V1 limits before any table is inserted; preserve every fixture value.
            rows["products"][2] = "h" * 148
            rows["products"][3] = "u" * 178
            fixture()
            errors, progress = io.StringIO(), io.StringIO()
            with contextlib.redirect_stderr(errors), contextlib.redirect_stdout(progress), self.assertRaisesRegex(MigrationValidationError, "2 oversized cells"):
                import_target(directory, dry_run=True)
            self.assertIn("column=handle", errors.getvalue())
            self.assertIn("column=url", errors.getvalue())
            self.assertNotIn("Verified users", progress.getvalue())
            self.assertEqual(counts(), [0] * 18)
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaisesRegex(MigrationValidationError, "2 oversized cells"):
                check_target_lengths(directory)
            with psycopg.connect(os.environ["TEST_MIGRATION_DSN"], user=os.environ["DB_USERNAME"], password=os.environ["DB_PASSWORD"]) as connection:
                v2 = Path(__file__).resolve().parents[1] / "src/main/resources/db/migration/V2__widen_product_handle_and_url.sql"
                connection.execute(v2.read_text(encoding="utf-8"))
            check_target_lengths(directory)
            import_target(directory, dry_run=True)
            self.assertEqual(counts(), [0] * 18)
            rows["product_variants"][-1] = 999999
            fixture()
            with self.assertRaises(psycopg.errors.ForeignKeyViolation):
                import_target(directory, dry_run=False)
            self.assertEqual(counts(), [0] * 18)
            rows["product_variants"][-1] = 105
            fixture()
            import_target(directory, dry_run=False)
            self.assertEqual(counts(), [1] * 18)
            with self.assertRaises(MigrationValidationError):
                import_target(directory, dry_run=False)
            self.assertEqual(counts(), [1] * 18)
            with psycopg.connect(os.environ["TEST_MIGRATION_DSN"], user=os.environ["DB_USERNAME"], password=os.environ["DB_PASSWORD"]) as connection:
                self.assertEqual(connection.execute("SELECT title FROM store.products WHERE product_id=105").fetchone()[0], "Bút 🖊")
                self.assertEqual(connection.execute("SELECT handle, url FROM store.products WHERE product_id=105").fetchone(), ("h" * 148, "u" * 178))
                new_id = connection.execute("INSERT INTO store.products(title) VALUES ('next identity') RETURNING product_id").fetchone()[0]
                self.assertEqual(new_id, 106)
                connection.rollback()


if __name__ == "__main__":
    unittest.main()
