import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Isolated browser checks: every /api request is mocked before React loads.
// No real login, order, email, or backend write is performed.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send;
const pending = new Map();
const exceptions = [];
const artifacts = fileURLToPath(new URL("../../.cache/", import.meta.url));
let passed = 0;
async function until(check, description) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(80); }
  throw new Error(`Timed out: ${description}`);
}

function installMockApi() {
  const originalFetch = window.fetch.bind(window);
  const product = { productID: 1, title: "Sổ tay kiểm thử", handle: "so-tay", description: "Sổ tay", price: 20000, priceMin: 20000, priceMax: 20000, compareAtPrice: 25000, available: true, isActive: true, ratingAverage: 4, reviewCount: 0, vendorID: 1, vendorName: "Thương hiệu", productTypeID: 1, productTypeName: "Sổ", images: [] };
  const user = { userID: 1, username: "testuser", fullName: "Người kiểm thử", email: "test@example.test", phoneNumber: "0900000000", address: "Địa chỉ kiểm thử", role: "USER", isActive: true, createdAt: "2026-01-01T00:00:00Z" };
  const order = id => ({ orderID: id, userID: 1, orderDate: "2026-01-01T00:00:00Z", status: id === 2 ? "DELIVERED" : "PENDING", shippingAddress: user.address, contactPhone: user.phoneNumber, paymentMethod: "COD", isPaid: false, couponCode: null, subTotal: 20000, discountAmount: 0, totalAmount: 20000, deliveredAt: null, items: [] });
  const cart = { items: [{ cartItemID: 1, productTitle: product.title, variantTitle: "Tiêu chuẩn", quantity: 1, lineTotal: 20000 }], subtotal: 20000 };
  window.__requests = [];
  window.__failure = null;
  window.__unexpected = [];
  window.alert = () => { throw new Error("Unexpected browser alert"); };
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input), location.href);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, options);
    const route = url.pathname;
    const method = options.method || "GET";
    window.__requests.push({ route, method, body: options.body });
    options.signal?.throwIfAborted();
    const failure = window.__failure;
    if (failure && route === failure.route && (!failure.method || method === failure.method))
      return Response.json(failure.body ?? { detail: "SQL error: password=private-test-value" }, { status: failure.status || 500 });
    if (route === "/api/auth/login") return Response.json({ accessToken: "local-browser-test", user, tokenType: "Bearer", expiresInSeconds: 3600 });
    if (route === "/api/auth/register") return Response.json(user);
    if (route === "/api/auth/me") return Response.json(user);
    if (route === "/api/auth/forgot-password") return Response.json({ message: "Nếu email tồn tại, chúng tôi sẽ gửi liên kết đặt lại mật khẩu." });
    if (route === "/api/auth/reset-password") return Response.json({ message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại." });
    if (route === "/api/users/me/password") return new Response(null, { status: 204 });
    if (route === "/api/users/me") return Response.json(method === "PUT" ? { ...user, ...JSON.parse(options.body) } : user);
    if (route === "/api/orders/my-orders") {
      const all=[order(1),order(2)];
      if(!url.search) return Response.json(all);
      const state=url.searchParams.get('status'), content=state?all.filter(o=>o.status===state):all;
      return Response.json({content:url.searchParams.has('summary')?[]:content,totalElements:content.length,totalPages:1,statusCounts:{PENDING:1,DELIVERED:1}});
    }
    if (route.endsWith("/cancel")) return Response.json({ ...order(1), status: "CANCELLED" });
    if (route === "/api/orders/2") return Response.json(order(2));
    if (route === "/api/returns/my-requests") return Response.json([]);
    if (route === "/api/orders") return Response.json({ orderID: 3 });
    if (route === "/api/checkout/options") return Response.json({ shipping: [{ code: "STANDARD", label: "Giao hàng tiêu chuẩn", description: "3–5 ngày", fee: 25000 }], payments: [{ code: "COD", label: "Thanh toán khi nhận hàng", description: "", enabled: true, demo: false }], freeShippingThreshold: 200000 });
    if (route === "/api/checkout/preview") return Response.json({ subTotal: 20000, discountAmount: 0, shippingFee: 25000, totalAmount: 45000, shippingMethod: "STANDARD", couponCode: null });
    if (route === "/api/cart" || route === "/api/cart/items" || route === "/api/cart/merge") return Response.json(cart);
    if (route === "/api/products" || route === "/api/products/search") return Response.json({ content: [product], totalPages: 1, totalElements: 1 });
    if (/^\/api\/products\/\d+\/reviews$/.test(route)) return Response.json([]);
    if (route.startsWith("/api/products/")) return Response.json(product);
    if (route.startsWith("/api/product-variants/")) return Response.json([{ variantID: 1, title: "Tiêu chuẩn", sku: "TEST", price: 20000, compareAtPrice: 25000, stockQuantity: 2, available: true, option1: null, option2: null, option3: null }]);
    if (route === "/api/product-types") return Response.json([{ productTypeID: 1, name: "Sổ", isActive: true }]);
    if (route.startsWith("/api/reviews/")) return Response.json([]);
    if (route.startsWith("/api/recommendations/")) return Response.json({ products: [], source: "POPULAR" });
    if (route.startsWith("/api/tracking/")) return Response.json({});
    if (route === "/api/ai/chat") return Response.json({ reply: "Đã tìm thấy sản phẩm.", products: [], source: "AI_RAG" });
    window.__unexpected.push(route);
    return Response.json({});
  };
}

try {
  vite = await createServer({ server: { host: "127.0.0.1", port: 0, open: false } });
  await vite.listen();
  const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(candidate => candidate && existsSync(candidate));
  assert.ok(executable, "Set CHROME_PATH to a Chromium browser executable");
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "stationery-toast-test-"));
  browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  await until(() => existsSync(path.join(profile, "DevToolsActivePort")), "Chrome startup");
  const port = (await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
  const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then(response => response.json());
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installMockApi.toString()})()` });
  const navigate = async (route, selector) => {
    await send("Page.navigate", { url: baseUrl + route });
    await until(() => evaluate(`location.pathname === ${JSON.stringify(route.split("?")[0])} && !!document.querySelector(${JSON.stringify(selector)})`), route);
    await delay(150);
  };
  const clickText = async (text, scope = "document") => {
    assert.equal(await evaluate(`(() => { const button = [...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`), true, `Button: ${text}`);
    await delay(80);
  };
  const type = async (selector, value) => {
    await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus(); element.select(); })()`);
    await send("Input.insertText", { text: value });
  };
  const count = () => evaluate("document.querySelectorAll('.Toastify__toast').length");
  const clear = async () => {
    await evaluate("import('/src/utils/notifications.ts').then(() => document.querySelectorAll('.store-notice-close').forEach(b => b.click()))");
    await until(async () => await count() === 0, "toast dismissal");
  };
  const notice = async (text, kind) => {
    await until(() => evaluate(`!![...document.querySelectorAll('.Toastify__toast--${kind}')].find(e => e.textContent.includes(${JSON.stringify(text)}))`), `notice ${text}`);
    assert.equal(await count(), 1, "Exactly one toast per action");
    assert.equal(await evaluate("document.querySelectorAll('.Toastify__toast-container').length"), 1);
  };
  const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
  const screenshot = async name => {
    await delay(800); // Capture after the enter animation, not its off-screen first frame.
    assert.equal(await evaluate(`(() => {
      const toast=document.querySelector('.Toastify__toast'); const r=toast.getBoundingClientRect();
      return toast.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
    })()`), true, "Toast is painted above the page/dialog and can receive pointer events");
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await fs.mkdir(artifacts, { recursive: true });
    await fs.writeFile(path.join(artifacts, name), Buffer.from(data, "base64"));
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1365, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("/login", "input[autocomplete=username]");
  await test("StrictMode: safe backend messages, sensitive diagnostics and duplicate suppression", async () => {
    assert.equal(await count(), 0);
    assert.equal(await evaluate(`import('/src/utils/notifications.ts').then(({userMessage}) => userMessage({detail:'Email này đã được sử dụng bởi tài khoản khác.'}, 'Dự phòng'))`), "Email này đã được sử dụng bởi tài khoản khác.");
    assert.equal(await evaluate(`import('/src/utils/notifications.ts').then(({userMessage}) => userMessage({detail:'Mat khau cu khong dung'}, 'Dự phòng'))`), "Mật khẩu hiện tại không chính xác.");
    for (const value of ["SQL error: password=private-test-value", "Lỗi mật khẩu: private-test-value", "Tên đăng nhập hoặc mật khẩu không đúng. secret", "<script>alert(1)</script>"]) {
      assert.equal(await evaluate(`import('/src/utils/notifications.ts').then(({userMessage}) => userMessage({message:${JSON.stringify(value)}}, 'Thông báo an toàn.'))`), "Thông báo an toàn.");
    }
    await evaluate(`import('/src/utils/notifications.ts').then(({notify}) => { notify.warning('Cảnh báo kiểm thử.'); notify.warning('Cảnh báo kiểm thử.'); })`);
    await notice("Cảnh báo kiểm thử.", "warning"); await clear();
  });
  await test("Registration keeps inline password validation and reports success after registration", async () => {
    await clickText("Đăng ký");
    await type("input[autocomplete=username]", "testuser"); await type("input[type=email]", "test@example.test");
    await type("input[placeholder='8 - 72 ký tự']", "test-password");
    await type("input[placeholder='Nhập lại mật khẩu']", "other-password");
    await clickText("Tạo tài khoản ngay");
    assert.equal(await count(), 0);
    assert.equal(await evaluate("document.querySelector('main [role=alert]').textContent"), "Mật khẩu xác nhận không khớp!");
    assert.equal(await evaluate("window.__requests.some(r=>r.route==='/api/auth/register')"), false);
    await type("input[placeholder='Nhập lại mật khẩu']", "test-password");
    await clickText("Tạo tài khoản ngay"); await notice("Đăng ký thành công", "success"); await clear();
    assert.equal(await evaluate("!!document.querySelector('input[autocomplete=\"current-password\"]')"), true);
  });
  await test("Login failure preserves request payload and never exposes backend diagnostics", async () => {
    await type("input[autocomplete=username]", "testuser"); await type("input[autocomplete='current-password']", "test-password");
    await evaluate("window.__failure = {route:'/api/auth/login',status:500}");
    await clickText("Đăng nhập ngay"); await notice("Máy chủ gặp lỗi xử lý", "error");
    assert.equal(await evaluate("document.body.textContent.includes('private-test-value')"), false);
    assert.deepEqual(await evaluate("JSON.parse(window.__requests.find(r=>r.route==='/api/auth/login').body)"), { username: "testuser", password: "test-password" });
    await clear(); await evaluate("window.__failure=null");
  });
  await test("Login success survives React Router navigation; ordinary loads stay quiet", async () => {
    await clickText("Đăng nhập ngay");
    await until(() => evaluate("location.pathname==='/'"), "login navigation");
    await notice("Đăng nhập thành công", "success"); await delay(250); assert.equal(await count(), 1); await clear();
  });
  await test("Header logout displays one success without altering its existing navigation", async () => {
    await until(() => evaluate("!!document.querySelector('header button[class*=profileBtn]')"), "header account");
    await evaluate("document.querySelector('header button[class*=profileBtn]').click()");
    await clickText("Đăng xuất"); await notice("Đăng xuất thành công", "success");
    assert.equal(await evaluate("location.pathname"), "/");
    assert.equal(await evaluate("localStorage.getItem('accessToken')"), null); await clear();
  });
  await test("Guest cart success, storage failure and stock warning", async () => {
    await evaluate("localStorage.clear()");
    await navigate("/products/so-tay", "[aria-label='Chi tiết sản phẩm']"); assert.equal(await count(), 0);
    await clickText("Thêm vào giỏ hàng"); await notice("Đã thêm 1 sản phẩm", "success"); await clear();
    assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('stationery_guest_cart'))"), [{ variantID: 1, quantity: 1 }]);
    await evaluate("localStorage.setItem('stationery_guest_cart',JSON.stringify([{variantID:1,quantity:2}]))");
    await clickText("Thêm vào giỏ hàng"); await notice("vượt quá tồn kho", "warning"); await clear();
    await evaluate("localStorage.removeItem('stationery_guest_cart'); window.__originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new Error('storage blocked')}");
    await clickText("Thêm vào giỏ hàng"); await notice("Không thêm được sản phẩm", "error"); await clear();
    await evaluate("Storage.prototype.setItem=window.__originalSetItem");
    await evaluate("localStorage.setItem('accessToken','local-browser-test'); window.dispatchEvent(new Event('auth-changed')); window.__failure={route:'/api/cart/items',status:409,body:{detail:'Khong du ton kho cho bien the 1'}}");
    await clickText("Thêm vào giỏ hàng"); await notice("vượt quá tồn kho", "warning"); await clear();
    await evaluate("localStorage.removeItem('accessToken'); window.dispatchEvent(new Event('auth-changed')); window.__failure=null");
    await until(() => evaluate("!!document.querySelector('header a[href=\"/login\"]') && !!document.querySelector('[aria-label=\"Thêm vào yêu thích\"]')"), "guest session settled");
  });
  await test("Favorite add/remove: one owner, no toast from synchronization effects", async () => {
    await evaluate("document.querySelector('[aria-label=\"Thêm vào yêu thích\"]').click()"); await notice("Đã thêm sản phẩm vào danh sách yêu thích", "success"); await clear();
    await evaluate("document.querySelector('[aria-label=\"Bỏ yêu thích\"]').click()"); await notice("Đã bỏ sản phẩm khỏi danh sách yêu thích", "success"); await clear();
  });
  await test("Sharing: success follows completion; cancelling native sharing stays silent", async () => {
    await evaluate("navigator.share=async()=>{window.__shareCompleted=true}");
    await clickText("Chia sẻ"); await notice("Đã chia sẻ liên kết sản phẩm", "success");
    assert.equal(await evaluate("window.__shareCompleted"), true); await clear();
    await evaluate("navigator.share=async()=>{throw new DOMException('Cancelled','AbortError')}");
    await clickText("Chia sẻ"); assert.equal(await count(), 0);
  });
  await test("Checkout notices survive navigation and preserve the current order contract", async () => {
    await evaluate("localStorage.setItem('accessToken','local-browser-test');window.dispatchEvent(new Event('auth-changed'))"); await delay(50);
    await clickText("Mua ngay"); await until(() => evaluate("location.pathname==='/checkout' && !!document.querySelector('#checkout-form')"), "checkout");
    await notice("Đã thêm 1 sản phẩm", "success");
    assert.equal(await evaluate("!!document.querySelector('.Toastify__toast-container')"), true);
    await screenshot("toast-checkout-desktop.png"); await clear();
    await type("#checkout-form input[autocomplete='street-address']", "Địa chỉ kiểm thử");
    await type("#checkout-form input[autocomplete='tel']", "0900000000");
    await type("#checkout-form input[autocomplete='address-level1']", "HCM");
    await type("#checkout-form input[autocomplete='address-level3']", "Phường kiểm thử");
    await evaluate("window.__failure={route:'/api/orders',status:400}; document.querySelector('#checkout-form').requestSubmit()");
    await until(() => evaluate("!!document.querySelector('#checkout-form [role=alert]') && window.__requests.some(r=>r.route==='/api/orders')"), 'checkout inline error');
    assert.equal(await evaluate("document.querySelector('#checkout-form [role=alert]').textContent.includes('private-test-value')"), false);
    await notice('Thông tin hoặc điều kiện thực hiện chưa hợp lệ', 'error'); await clear();
    await evaluate("window.__failure=null; document.querySelector('#checkout-form').requestSubmit()");
    await until(() => evaluate("document.querySelector('main').textContent.includes('Đặt hàng thành công!')"), 'checkout confirmation');
    await notice('Đặt hàng thành công', 'success');
    const payload = await evaluate("JSON.parse(window.__requests.find(r=>r.route==='/api/orders').body)");
    assert.ok(payload.shippingAddress.includes("Địa chỉ kiểm thử, Phường kiểm thử"));
    assert.deepEqual({ ...payload, shippingAddress: undefined }, { shippingAddress: undefined, contactPhone: "0900000000", paymentMethod: "COD", shippingMethod: "STANDARD", expectedTotalAmount: 45000 });
    await clear();
  });
  await test("Notices remain visible inside a native dialog and after closing it", async () => {
    await evaluate("(() => { const dialog=document.createElement('dialog'); dialog.id='toast-test-dialog'; document.body.append(dialog); dialog.showModal(); })()");
    await evaluate("import('/src/utils/notifications.ts').then(({notify})=>notify.success('Thông báo kiểm thử trong hộp thoại'))");
    await notice("Thông báo kiểm thử trong hộp thoại", "success");
    assert.equal(await evaluate("!!document.querySelector('dialog[open] .Toastify__toast-container')"), true);
    await evaluate("document.querySelector('#toast-test-dialog').close()");
    await until(() => evaluate("!document.querySelector('dialog[open]') && !!document.querySelector('body > div .Toastify__toast-container')"), "close dialog");
    await notice("Thông báo kiểm thử trong hộp thoại", "success"); await clear();
    await evaluate("document.querySelector('#toast-test-dialog').remove()");
  });
  await test("Account update and password change retain validation and show success only after the API", async () => {
    await navigate("/my-profile", "input[autocomplete='street-address']"); assert.equal(await count(), 0);
    await clickText("Lưu thay đổi"); await notice("Đã lưu thông tin tài khoản", "success"); await clear();
    await navigate("/my-profile/security", "input[autocomplete='current-password']");
    await type("input[autocomplete='current-password']", "old-password");
    await type("input[autocomplete='new-password']", "new-password");
    await type("input[placeholder='Nhập lại mật khẩu mới...']", "new-password");
    await clickText("Cập nhật mật khẩu"); await notice("Đổi mật khẩu thành công", "success"); await clear();
  });
  await test("Clearing favorites reports successful storage changes once", async () => {
    await evaluate("localStorage.setItem('favorite-product-1','true')");
    await navigate("/my-profile/wishlist", "main");
    await until(() => evaluate("document.body.textContent.includes('Xóa tất cả')"), "wishlist load");
    await clickText("Xóa tất cả"); await notice("Đã xóa danh sách yêu thích", "success");
    assert.equal(await evaluate("localStorage.getItem('favorite-product-1')"), null); await clear();
  });
  await test("Order cancellation notifies once and return action opens the selected order", async () => {
    await navigate("/my-profile/orders", "[aria-label='Tìm đơn hàng']");
    await until(() => evaluate("document.body.textContent.includes('Hủy đơn hàng')"), "orders load");
    await clickText("Hủy đơn hàng"); await notice("Đã hủy đơn hàng #ST-1", "success"); await clear();
    await clickText("Yêu cầu trả hàng");
    await until(() => evaluate("location.pathname==='/returns/new' && new URLSearchParams(location.search).get('orderId')==='2' && document.querySelector('#return-order')?.value==='2'"), "selected return order");
    await notice("chưa có thời gian giao hàng", "warning"); await clear();
  });
  await test("Sidebar logout survives navigation", async () => {
    await navigate("/my-profile", "input[autocomplete='street-address']");
    await clickText("Đăng xuất tài khoản"); await until(() => evaluate("location.pathname==='/login'"), "logout navigation");
    await notice("Đăng xuất thành công", "success"); assert.equal(await evaluate("localStorage.getItem('accessToken')"), null); await clear();
  });
  await test("Concurrent expired-session requests emit one warning, not another action error", async () => {
    await evaluate(`import('/src/services/api.ts').then(async ({api}) => {
      localStorage.setItem('accessToken','expired-test'); window.__failure={route:'/api/users/me',status:401};
      const {notify}=await import('/src/utils/notifications.ts');
      await Promise.all([api('/api/users/me'),api('/api/users/me')].map(p=>p.catch(e=>notify.error(e,'Không thể lưu.'))));
      window.__failure=null;
    })`);
    await notice("Phiên đăng nhập đã hết hạn", "warning"); await clear();
  });
  await test("Chat failure has one safe toast and retains the conversation message", async () => {
    await evaluate("window.__failure={route:'/api/ai/chat',status:503}; document.querySelector('[aria-label=\"Mở trợ lý mua sắm\"]').click()");
    await type("#chat-message", "Tìm sổ tay");
    await evaluate("document.querySelector('#shopping-chat form').requestSubmit()");
    await notice("Dịch vụ tạm thời gián đoạn", "error");
    assert.equal(await evaluate("document.querySelector('[role=log]').textContent.includes('Dịch vụ tạm thời gián đoạn')"), true);
    await clear(); await evaluate("window.__failure=null;document.querySelector('[aria-label=\"Đóng trò chuyện\"]').click()");
  });
  await test("Forgot/reset password: neutral email notice and one success after following the email link", async () => {
    await navigate("/forgot-password", "input[type=email]");
    await type("input[type=email]", "test@example.test"); await clickText("Gửi liên kết đặt lại mật khẩu");
    await notice("Nếu email tồn tại", "info"); await clear();
    await navigate("/reset-password?token=test-reset-code", "input[autocomplete='new-password']");
    await type("label:first-of-type input[autocomplete='new-password']", "new-password");
    await type("label:last-of-type input[autocomplete='new-password']", "new-password");
    await clickText("Xác nhận đặt lại mật khẩu");
    await until(() => evaluate("window.__requests.some(r=>r.route==='/api/auth/reset-password')"), "reset request");
    await until(() => evaluate("location.pathname==='/login'"), "reset redirect");
    await notice("Đặt lại mật khẩu thành công", "success");
    assert.equal(await evaluate("sessionStorage.getItem('stationery:password-reset-notice')"), null); await clear();
  });
  await test("Mobile: long messages fit the viewport, close button accessible, auto-close works", async () => {
    await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
    await evaluate("import('/src/utils/notifications.ts').then(({notify})=>notify.info('Thông báo kiểm thử trên điện thoại với nội dung dài để kiểm tra việc xuống dòng và vị trí hiển thị.'))");
    await notice("Thông báo kiểm thử trên điện thoại", "info");
    const box = await evaluate("(() => {const r=document.querySelector('.Toastify__toast-container').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()");
    assert.ok(box.left >= 0 && box.right <= box.width);
    assert.equal(await evaluate("document.querySelector('.store-notice-close').getAttribute('aria-label')"), "Đóng thông báo");
    await screenshot("toast-mobile.png");
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await until(async () => await count() === 0, "automatic close");
  });
  assert.deepEqual(await evaluate("window.__unexpected"), [], "All backend calls must remain mocked");
  assert.deepEqual(exceptions, [], "No browser runtime exceptions");
  console.log(`${passed} notification browser checks passed (mock API, desktop/mobile, StrictMode).`);
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally {
  if (send) await send("Browser.close").catch(() => {});
  socket?.close(); browser?.kill();
  if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith("stationery-toast-test-")) {
    await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {});
  }
}
