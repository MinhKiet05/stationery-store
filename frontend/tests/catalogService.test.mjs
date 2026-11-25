import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

let server;
let getCatalog;
let queryClient;
let catalogOptions, homeOptions, discoveryProducts;
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
  process.env.VITE_API_BASE_URL = "";
  globalThis.localStorage = { getItem: () => null };
  server = await createServer({ server: { middlewareMode: true } });
  ({ queryClient } = await server.ssrLoadModule('/src/services/queryCache.ts'));
  ({ getCatalog } = await server.ssrLoadModule(
    "/src/services/catalogService.ts",
  ));
  ({ catalogOptions } = await server.ssrLoadModule('/src/services/catalogService.ts'));
  ({ homeOptions } = await server.ssrLoadModule('/src/services/storeQueries.ts'));
  ({ discoveryProducts } = await server.ssrLoadModule('/src/pages/homePage/homeProducts.ts'));
});
afterEach(() => {
  queryClient?.clear();
  globalThis.fetch = originalFetch;
});
after(async () => {
  globalThis.localStorage = originalStorage;
  await server?.close();
});

test("loads exactly the requested page and metadata without traversing the entire catalog", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    options.signal.throwIfAborted();
    calls.push(path);
    const url = new URL(path, "http://localhost");
    if (url.pathname === "/api/product-types") return Response.json(types);
    assert.equal(url.pathname, "/api/products/search");
    assert.equal(url.searchParams.get("size"), "12");
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
    ["all", "77", "42"],
  );
  assert.equal(result.categories[1].label, types[0].name);
  assert.deepEqual(
    result.products.map((item) => item.id),
    ["1", "2", "5"],
  );
  assert.deepEqual(result.products.map((item) => item.category), ["77", "88", "77"]);
  assert.equal(
    result.products[0].image,
    "https://images.example.test/product-1.jpg",
  );
  assert.equal(result.products[0].detailHref, "/products/product-1");
  assert.equal(result.totalPages, 2);
  assert.equal(result.totalElements, 5);
  assert.equal(calls.length, 2);

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

test("a failed requested page rejects without presenting another page as its result", async () => {
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
  await assert.rejects(getCatalog(undefined, { page: 1 }));
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

test('Cloudinary thumbnails resize only unsigned image uploads and preserve signed or transformed URLs', async () => {
  const {thumbnail}=await server.ssrLoadModule('/src/utils/thumbnail.ts');
  assert.equal(thumbnail('https://res.cloudinary.com/store/image/upload/v123/pen.jpg'), 'https://res.cloudinary.com/store/image/upload/f_auto,q_auto,c_limit,w_384/v123/pen.jpg');
  for(const url of ['https://other.test/a.jpg','https://res.cloudinary.com/store/image/upload/s--signed--/pen.jpg','https://res.cloudinary.com/store/image/upload/w_200/pen.jpg','https://res.cloudinary.com/store/image/upload/v1/pen.jpg?signature=private']) assert.equal(thumbnail(url),url);
});

test('home infinite query fetches ten per page and stops after three pages despite a larger catalog', async () => {
  const pages = [];
  globalThis.fetch = async path => {
    const url = new URL(path, 'http://localhost');
    assert.equal(url.pathname, '/api/products');
    assert.equal(url.searchParams.get('size'), '10');
    assert.equal(url.searchParams.get('sort'), 'productID,asc');
    const page = Number(url.searchParams.get('page')); pages.push(page);
    return Response.json({ content: Array.from({ length: 10 }, (_, i) => product(page * 10 + i + 1, 77)), totalPages: 100, totalElements: 1000 });
  };
  const options = homeOptions();
  const result = await queryClient.fetchInfiniteQuery({ ...options, pages: 5 });
  assert.deepEqual(pages, [0, 1, 2]);
  assert.equal(new Set(result.pages.flatMap(p => p.content).map(p => p.productID)).size, 30);
  await queryClient.fetchInfiniteQuery(options); assert.equal(pages.length, 3, 'fresh home pages are reused');
});

test('category prefetch and SearchPage defaults share the complete canonical query key', async () => {
  let reads = 0;
  globalThis.fetch = async path => {
    if (path === '/api/product-types') return Response.json(types);
    const url = new URL(path, 'http://localhost'); reads++;
    assert.equal(url.searchParams.get('productTypeID'), '77');
    assert.equal(url.searchParams.get('size'), '24');
    return Response.json({ content: [product(1, 77)], totalPages: 1, totalElements: 1 });
  };
  await queryClient.prefetchQuery(catalogOptions({ productTypeID: '77' }));
  const result = await queryClient.fetchQuery(catalogOptions({ productTypeID: '77', page: 0, size: 24,
    keyword: '', brands: [], minPrice: '', maxPrice: '', rating: 0, inStock: false, onSale: false, sort: 'productID,asc' }));
  assert.equal(reads, 1); assert.equal(result.products[0].category, '77');
  assert.notDeepEqual(catalogOptions({ productTypeID: '77' }).queryKey, catalogOptions({ productTypeID: '42' }).queryKey);
});

test('discovery chooses unseen categories and brands, deduplicates and safely reuses small catalogs', () => {
  const source = [product(1, 77, { vendorID: 1 }), product(2, 77, { vendorID: 1 }), product(3, 42, { vendorID: 2 })];
  const result = discoveryProducts([...source, source[1]], [source[0]], 3);
  assert.equal(result[0].productID, 2); assert.equal(result[1].productID, 3);
  assert.deepEqual(result.map(p => p.productID), [2, 3, 1]);
  assert.deepEqual(discoveryProducts([], []), []);
});
