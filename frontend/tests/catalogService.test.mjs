import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let server;
let getCatalog;
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const types = [
  { productTypeID: 77, name: "Bút mới từ API", isActive: true },
  { productTypeID: 88, name: "Bút ngừng kinh doanh", isActive: false },
  { productTypeID: 42, name: "Sổ lò xo", isActive: true },
];
const product = (id, productTypeID, overrides = {}) => ({
  productID: id,
  productTypeID,
  title: `Product ${id}`,
  handle: `product-${id}`,
  vendorName: "API vendor",
  price: 12000,
  priceMin: 12000,
  compareAtPrice: 15000,
  ratingAverage: 4.5,
  reviewCount: 2,
  available: true,
  isActive: true,
  images: [`https://images.example.test/product-${id}.jpg`],
  ...overrides,
});

before(async () => {
  globalThis.localStorage = { getItem: () => null };
  server = await createServer({ server: { middlewareMode: true } });
  ({ getCatalog } = await server.ssrLoadModule(
    "/src/services/catalogService.ts",
  ));
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
after(async () => {
  globalThis.localStorage = originalStorage;
  await server?.close();
});

test("loads all product pages and uses active product-type IDs and image URLs from API", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    options.signal.throwIfAborted();
    calls.push(path);
    const url = new URL(path, "http://localhost");
    if (url.pathname === "/api/product-types") return Response.json(types);
    assert.equal(url.pathname, "/api/products");
    assert.equal(url.searchParams.get("size"), "100");
    return Response.json({
      content:
        url.searchParams.get("page") === "0"
          ? [
              product(1, 77),
              product(2, 88),
              product(5, 77, { isActive: false }),
            ]
          : [
              product(3, 42),
              product(4, 77, {
                images: [],
                price: null,
                priceMin: 8000,
                compareAtPrice: null,
                ratingAverage: null,
                reviewCount: null,
              }),
            ],
      totalPages: 2,
      totalElements: 5,
    });
  };
  const result = await getCatalog();
  assert.deepEqual(
    result.categories.map((type) => type.id),
    ["all", "77"],
  );
  assert.equal(result.categories[1].label, types[0].name);
  assert.deepEqual(
    result.products.map((item) => item.id),
    ["1", "4"],
  );
  assert.ok(result.products.every((item) => item.category === "77"));
  assert.equal(
    result.products[0].image,
    "https://images.example.test/product-1.jpg",
  );
  assert.equal(result.products[0].detailHref, "/products/product-1");
  assert.equal(result.products[1].image, "");
  assert.equal(result.products[1].price, 8000);
  assert.equal(result.products[1].rating, 0);
  assert.equal(result.products[1].reviewCount, 0);
  assert.equal(calls.length, 3);
});

test("empty API catalog remains empty without static product fallback", async () => {
  globalThis.fetch = async (path) =>
    Response.json(
      path === "/api/product-types"
        ? types
        : { content: [], totalPages: 0, totalElements: 0 },
    );
  const result = await getCatalog();
  assert.equal(result.products.length, 0);
  assert.equal(result.categories[1].id, "77");
});

test("product-type API failure is surfaced rather than using hardcoded types", async () => {
  globalThis.fetch = async (path) =>
    path === "/api/product-types"
      ? new Response(null, { status: 503 })
      : Response.json({ content: [], totalPages: 0, totalElements: 0 });
  await assert.rejects(getCatalog(), /Không thể kết nối cửa hàng/);
});

test("a failed later page rejects the load instead of showing an incomplete catalog", async () => {
  globalThis.fetch = async (path) => {
    if (path === "/api/product-types") return Response.json(types);
    if (new URL(path, "http://localhost").searchParams.get("page") === "1") {
      return new Response(null, { status: 500 });
    }
    return Response.json({
      content: [product(1, 77)],
      totalPages: 2,
      totalElements: 2,
    });
  };
  await assert.rejects(getCatalog());
});

test("aborted loads cannot return stale catalog data", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (path, options) => {
    if (path === "/api/product-types") return Response.json(types);
    controller.abort();
    options.signal.throwIfAborted();
  };
  await assert.rejects(getCatalog(controller.signal), { name: "AbortError" });
});
