"""Extract the pen/ink catalog from a SQL seed file without executing SQL.

Usage: python scripts/import-catalog-sql.py path/to/stationery_shop_full.sql
Only public product metadata and the primary product_images URL are exported.
"""

import json
from pathlib import Path
import re
import sys


def values_tuple(block):
    """Read the product VALUES tuple, respecting strings and nested SELECTs."""
    start = re.search(r"\bVALUES\s*\(", block).end()
    fields, start_field, depth, quoted, index = [], start, 0, False, start
    while index < len(block):
        char = block[index]
        if char == "'":
            if quoted and index + 1 < len(block) and block[index + 1] == "'":
                index += 2
                continue
            quoted = not quoted
        elif not quoted:
            if char == "(":
                depth += 1
            elif char == ")":
                if depth == 0:
                    fields.append(block[start_field:index].strip())
                    return fields
                depth -= 1
            elif char == "," and depth == 0:
                fields.append(block[start_field:index].strip())
                start_field = index + 1
        index += 1
    raise ValueError("Unterminated product VALUES tuple")


def sql_string(value):
    match = re.fullmatch(r"N?'((?:''|[^'])*)'", value)
    if not match:
        raise ValueError("Expected a SQL string literal")
    return match.group(1).replace("''", "'")


TYPE_CATEGORIES = {
    "Bút Bi": "gel",
    "Bút gel": "gel",
    "Bút máy cao cấp": "fountain",
    "Mực - Ngòi bút máy": "fountain",
    "Bút dạ quang": "highlighter",
    "Bút lông màu": "color",
    "Bút sáp màu": "color",
    "Bút chì": "pencil",
    "Bút cao cấp": "premium",
    "Bút bi cao cấp": "premium",
    "Bút lông bi cao cấp": "premium",
    "Bút lông bảng - lông dầu": "brush",
    "Bút lông dầu": "brush",
    "Bút lông kim": "brush",
    "Bút xóa": "correction",
}


def extract_catalog(sql):
    products = []
    for block in re.split(r"INSERT INTO dbo\.products\(", sql)[1:]:
        fields = values_tuple(block)
        if len(fields) != 14:
            raise ValueError("Unexpected products schema")
        product_type = re.search(r"WHERE name=(N?'(?:''|[^'])*')", fields[12])
        if not product_type:
            continue
        category = TYPE_CATEGORIES.get(sql_string(product_type.group(1)))
        if not category or fields[13] != "1":
            continue
        # Each block sets @pid from its handle before inserting its images.
        handle = sql_string(fields[1])
        image = re.search(
            r"INSERT INTO dbo\.product_images\(product_id,image_position,image_url\)"
            r"\s*VALUES\s*\(@pid,0,('(?:''|[^'])*')\)", block,
        )
        if not image:
            raise ValueError(f"No primary product_images URL for {handle}")
        image_url = sql_string(image.group(1))
        if not image_url.startswith("https://"):
            raise ValueError(f"Expected HTTPS product image for {handle}")
        vendor = re.search(r"WHERE name=(N?'(?:''|[^'])*')", fields[11])
        products.append({
            "id": handle,
            "title": sql_string(fields[0]),
            "brand": sql_string(vendor.group(1)) if vendor else "",
            "category": category,
            "image": image_url,
            "price": float(fields[5]),
            "oldPrice": float(fields[8]) if fields[8] != "NULL" else 0,
            "rating": float(fields[9]),
            "reviewCount": int(fields[10]),
            "inStock": fields[3] == "1",
        })
    if not products or len({p["id"] for p in products}) != len(products):
        raise ValueError("Catalog must contain unique products")
    return products


if __name__ == "__main__":
    source = Path(sys.argv[1])
    products = extract_catalog(source.read_text(encoding="utf-8-sig"))
    output = Path(__file__).resolve().parents[1] / "src/pages/productCatalog/catalogProducts.json"
    output.write_text(json.dumps(products, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(products)} products with database image URLs to {output.name}")
