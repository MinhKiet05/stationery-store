// Test-only data. This module is never imported by the application.
const day = 86400000;
export const returnFixture = {
  order: {
    orderID: 9842, userID: 24, orderDate: new Date(Date.now() - 4 * day).toISOString(),
    status: 'RETURN_PENDING', shippingAddress: '123 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    contactPhone: '0987 654 321', paymentMethod: 'COD', isPaid: true, couponCode: 'SAVE10',
    subTotal: 170000, discountAmount: 10000, totalAmount: 160000,
    deliveredAt: new Date(Date.now() - 2 * day).toISOString(),
    items: [
      { orderDetailID: 11, variantID: 101, variantTitle: 'Mực Xanh Royal / Ngòi 0.5mm', quantity: 2, unitPrice: 48000, subTotal: 96000 },
      { orderDetailID: 12, variantID: 102, variantTitle: 'Set 6 Màu Macaron Vintage', quantity: 1, unitPrice: 38000, subTotal: 38000 },
      { orderDetailID: 13, variantID: 103, variantTitle: 'Bìa Pastel Caro / 120 trang', quantity: 1, unitPrice: 36000, subTotal: 36000 },
    ],
  },
  existing: {
    returnID: 501, orderID: 9842, userID: 24, reason: 'Sổ tay bị hỏng khi nhận hàng.',
    evidenceUrls: ['https://example.com/evidence.jpg'], status: 'APPROVED',
    createdAt: new Date(Date.now() - day).toISOString(), processedAt: new Date().toISOString(),
    adminNote: 'Cửa hàng sẽ liên hệ xác nhận phương thức thu hồi.',
    items: [{ returnItemID: 601, orderDetailID: 13, variantID: 103, quantity: 1 }],
  },
  products: [
    { productID: 201, title: 'Hộp 12 Bút Gel Deli 0.5mm Khô Nhanh Nét Mịn (Mực Xanh)', images: ['/src/assets/butcaocap.webp'] },
    { productID: 202, title: 'Bộ 6 Bút Dạ Quang Highlight Deli Pastel Dịu Mắt', images: ['/src/assets/butlongmau.webp'] },
    { productID: 203, title: 'Sổ tay Klong A5 Caro 120 trang chống lem 100gsm', images: ['/src/assets/taphocsinh.webp'] },
  ],
};

export function installReturnMocks(fixture) {
  const mode = localStorage.getItem('returnTestScenario') || 'normal';
  if (mode === 'guest') localStorage.removeItem('accessToken');
  else localStorage.setItem('accessToken', 'test-only-return-token');
  const order = structuredClone(fixture.order);
  const existing = structuredClone(fixture.existing);
  if (mode === 'expired') order.deliveredAt = new Date(Date.now() - 8 * 86400000).toISOString();
  if (mode === 'undelivered') order.status = 'SHIPPED';
  if (mode === 'missingDate') order.deliveredAt = null;
  if (mode === 'rejected') existing.status = 'REJECTED';
  if (mode === 'completed') existing.status = 'COMPLETED';
  if (mode === 'pending') existing.status = 'PENDING';
  if (mode === 'allReserved') existing.items = order.items.map(item => ({ ...item, returnItemID: item.orderDetailID, quantity: item.quantity }));
  const state = window.__returnsTest = { order, returns: [existing], calls: [], payload: null, postCount: 0, mode, delay: 0 };
  state.createdUrls = []; state.revokedUrls = [];
  const createUrl = URL.createObjectURL.bind(URL), revokeUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = file => { const url = createUrl(file); state.createdUrls.push(url); return url; };
  URL.revokeObjectURL = url => { state.revokedUrls.push(url); revokeUrl(url); };
  const realFetch = window.fetch.bind(window);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, options);
    const method = options.method || 'GET';
    state.calls.push({ path: url.pathname, method, authorization: new Headers(options.headers).get('Authorization') });
    if (url.pathname === '/api/auth/login') return json({ accessToken: 'test-only-return-token', user: { userID: 24, username: 'test-customer', role: 'CUSTOMER' } });
    if (url.pathname === '/api/cart') return json({ items: [], subtotal: 0 });
    if (url.pathname === '/api/product-types') return json([]);
    if (url.pathname === '/api/products') return json({ content: [], totalElements: 0, totalPages: 0 });
    if (url.pathname.startsWith('/api/recommendations/')) return json({ products: [], source: 'POPULAR' });
    if (url.pathname === '/api/auth/me') return json({ userID: 24, username: 'test-customer', fullName: 'Trần Huỳnh Minh Kiệt', role: 'CUSTOMER' });
    if (state.mode === 'unauthorized') return json({ detail: 'Unauthorized' }, 401);
    if (url.pathname === '/api/orders/my-orders') return state.mode === 'loadError' ? json({}, 503) : json(state.mode === 'noOrders' ? [] : [order]);
    if (url.pathname.startsWith('/api/orders/')) return state.mode === 'notFound' ? json({}, 404) : json(order);
    if (url.pathname === '/api/returns/my-requests') return state.mode === 'historyError' ? json({}, 503) : json(state.mode === 'noOrders' ? [] : state.returns);
    const price = items => {
      const net = { 11: 90353, 12: 35765, 13: 33882 };
      const lines = items.map(item => {
        const purchased = order.items.find(d => d.orderDetailID === item.orderDetailID);
        const grossAmount = purchased.unitPrice * item.quantity;
        const netAmount = Math.floor(net[item.orderDetailID] * item.quantity / purchased.quantity);
        return { ...item, unitPrice: purchased.unitPrice, grossAmount, discountAmount: grossAmount - netAmount, netAmount };
      });
      return { items: lines, grossAmount: lines.reduce((n,i)=>n+i.grossAmount,0), discountAmount: lines.reduce((n,i)=>n+i.discountAmount,0), netAmount: lines.reduce((n,i)=>n+i.netAmount,0), paymentConfirmed:true, shippingRefund:null, collectionFee:null, finalRefund:null };
    };
    if (url.pathname === '/api/returns/preview') return json(price(JSON.parse(options.body).items));
    if (url.pathname === '/api/returns' && method === 'POST') {
      state.postCount++; state.payload = JSON.parse(await options.body.get('returnRequest').text());
      state.uploads = options.body.getAll('images').map(file => ({ name: file.name, size: file.size, type: file.type }));
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.mode === 'conflict') return json({ detail: 'So luong tra vuot qua so luong con lai' }, 409);
      if (state.mode === 'badRequest') return json({}, 400);
      if (state.mode === 'submitError') return json({}, 503);
      if (state.mode === 'emptyGateway') return new Response(null, { status: 502 });
      if (state.mode === 'networkError') throw new TypeError('Failed to fetch');
      if (state.mode === 'timeout') throw new DOMException('Timed out', 'TimeoutError');
      if (state.mode === 'uploadError') return json({ message: 'Không thể tải ảnh. Vui lòng thử lại.' }, 502);
      const created = { returnID: 502, orderID: order.orderID, userID: 24, reason: state.payload.reason,
        evidenceUrls: [location.origin + '/src/assets/butcaocap.webp'], pricing: price(state.payload.items), status: 'PENDING', createdAt: new Date().toISOString(),
        processedAt: null, adminNote: null, items: state.payload.items.map((item, index) => ({
          ...item, returnItemID: 602 + index, variantID: order.items.find(product => product.orderDetailID === item.orderDetailID).variantID,
        })) };
      state.returns = [created, ...state.returns]; order.status = 'RETURN_PENDING';
      if (state.mode === 'lostResponse') return new Response(null, { status: 502 });
      return json(created, 201);
    }
    if (url.pathname.startsWith('/api/product-variants/')) {
      const index = Number(url.pathname.split('/').at(-1)) - 101;
      const product = fixture.products[index];
      return state.mode === 'catalogError' ? json({}, 503) : json({ productID: product.productID, productTitle: product.title });
    }
    if (url.pathname.startsWith('/api/products/')) return json(fixture.products.find(product => product.productID === Number(url.pathname.split('/').at(-1))));
    throw new Error(`Unmocked API request: ${method} ${url.pathname}`);
  };
}
