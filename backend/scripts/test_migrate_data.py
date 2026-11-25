import contextlib
import decimal
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from migrate_data import (TABLES, FOREIGN_KEYS, checksum, encode_value, verify_export,
                          source_error, export_source, validate_string_lengths, target_string_limits)


class ExportVerificationTest(unittest.TestCase):
    def test_length_preflight_reports_all_columns_and_rows_without_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            manifest = self.fixture(directory)
            rows = [[None] * len(TABLES["products"].split()) for _ in range(2)]
            rows[0][1:4] = ["SECRET_TITLE", "PRIVATE_HANDLE" * 10, "PRIVATE_URL" * 20]
            rows[1][2] = "🖊" * 101
            (directory / "products.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            (directory / "users.jsonl").write_text(json.dumps([None, "SECRET_USERNAME", None, "PRIVATE_EMAIL", None, None, None, None, None, None]) + "\n", encoding="utf-8")
            limits = {("products", "handle"): 100, ("products", "url"): 100,
                      ("users", "email"): 3}
            errors = io.StringIO()
            with contextlib.redirect_stderr(errors), self.assertRaisesRegex(ValueError, "4 oversized cells"):
                validate_string_lengths(directory, manifest, limits)
            output = errors.getvalue()
            self.assertIn("column=handle file=products.jsonl line=2 length=101 limit=100", output)
            self.assertIn("table=store.users column=email", output)
            self.assertIn("column=url", output)
            for secret in ("PRIVATE_HANDLE", "PRIVATE_URL", "PRIVATE_EMAIL", "SECRET_USERNAME", "SECRET_TITLE", "🖊"):
                self.assertNotIn(secret, output)

    def test_length_preflight_accepts_null_unicode_boundary_and_unbounded_text(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            manifest = self.fixture(directory)
            rows = [[None] * len(TABLES["products"].split()) for _ in range(2)]
            rows[0][2] = "🖊" * 255  # 255 Unicode code points, not UTF-8 bytes or UTF-16 units.
            rows[0][3] = "u" * 10000
            (directory / "products.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                validate_string_lengths(directory, manifest, {("products", "handle"): 255})
            self.assertEqual(json.loads((directory / "products.jsonl").read_text().splitlines()[0])[3], "u" * 10000)

    def test_target_metadata_uses_actual_limits_and_refuses_missing_columns(self):
        cursor = MagicMock()
        metadata = [(table, column, 100 if (table, column) == ("products", "handle") else None)
                    for table, columns in TABLES.items() for column in columns.split()]
        cursor.fetchall.return_value = metadata
        self.assertEqual(target_string_limits(cursor), {("products", "handle"): 100})
        cursor.fetchall.return_value = metadata[:-1]
        with self.assertRaisesRegex(ValueError, "Target column missing or not visible"):
            target_string_limits(cursor)

    def test_source_errors_classify_without_leaking_driver_message(self):
        for code, hint in ((3951, "SERIALIZABLE"), (3952, "SERIALIZABLE"), (207, "column"), (208, "table"), (229, "permission")):
            error = Exception("42000", f"SECRET_PASSWORD PRIVATE_ROW ({code})")
            message = str(source_error(error, "reading dbo.users with SNAPSHOT"))
            self.assertIn(hint, message)
            self.assertIn("SQLSTATE=42000", message)
            self.assertNotIn("SECRET_PASSWORD", message)
            self.assertNotIn("PRIVATE_ROW", message)

    def test_unknown_source_error_does_not_print_arbitrary_arguments(self):
        message = str(source_error(Exception("secret", "private host and password"), "connecting to SQL Server"))
        self.assertIn("SQLSTATE=unknown", message)
        self.assertNotIn("private host", message)
        self.assertNotIn("secret", message)

    def test_export_failure_rolls_back_and_closes_source_without_manifest(self):
        driver = MagicMock()
        driver.Error = type("FakeOdbcError", (Exception,), {})
        connection = driver.connect.return_value
        connection.cursor.return_value.execute.side_effect = [None, driver.Error("42000", "PRIVATE (3951)")]
        with tempfile.TemporaryDirectory() as temporary, patch.dict("sys.modules", {"pyodbc": driver}), patch.dict("os.environ", {"MIGRATION_SQLSERVER_CONNECTION_STRING": "private"}):
            directory = Path(temporary) / "export"
            with self.assertRaisesRegex(ValueError, "dbo.users.*3951.*SERIALIZABLE"):
                export_source(directory, "SNAPSHOT")
            connection.rollback.assert_called_once()
            connection.close.assert_called_once()
            connection.commit.assert_not_called()
            self.assertFalse((directory / "manifest.json").exists())

    def fixture(self, directory):
        manifest = {"formatVersion": 1, "tables": []}
        for table, columns in TABLES.items():
            path = directory / (table + ".jsonl")
            path.write_text("", encoding="utf-8")
            manifest["tables"].append({"name": table, "columns": columns.split(), "count": 0, "sha256": checksum(path)})
        (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        return manifest

    def test_exact_decimal_precision_and_parent_first_foreign_key_order(self):
        self.assertEqual(encode_value(decimal.Decimal("9999999999.99")), "9999999999.99")
        order = list(TABLES)
        for child, relationships in FOREIGN_KEYS.items():
            for parent in relationships.values():
                self.assertLess(order.index(parent), order.index(child))

    def test_valid_export_and_tampered_checksum(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.fixture(directory)
            self.assertEqual(len(verify_export(directory)["tables"]), 18)
            (directory / "users.jsonl").write_text("[]\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "checksum"):
                verify_export(directory)

    def test_matching_checksum_still_requires_valid_columns_and_counts(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            manifest = self.fixture(directory)
            manifest["tables"][0]["count"] = 1
            (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "row count"):
                verify_export(directory)
            manifest["tables"][0]["columns"] = ["arbitrary_column"]
            (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "columns"):
                verify_export(directory)


if __name__ == "__main__":
    unittest.main()
