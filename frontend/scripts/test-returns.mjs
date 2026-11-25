import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTestBrowser, until, delay } from './browser-test.mjs';
import { returnFixture, installReturnMocks } from './fixtures/returns.mjs';

// All API responses are mocked in this isolated browser context. No real return
// request is created and no database, customer account, or payment is changed.
const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const workspace = fileURLToPath(new URL('../../', import.meta.url));
assert.equal((await fetch(`${baseUrl}/returns/new`)).status, 200, 'Start Vite first');
const browser = await openTestBrowser();
const { send, evaluate, click, type } = browser;
const results = [];
const first = 'main input[aria-label^="Trả Hộp"]';
const second = 'main input[aria-label^="Trả Bộ"]';
const third = 'main input[aria-label^="Trả Sổ"]';
const submit = 'main button[type="submit"]';

async function test(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}

async function navigate(mode = 'normal', route = '/returns/new?orderId=9842') {
  await evaluate(`if (location.origin === ${JSON.stringify(baseUrl)}) { localStorage.setItem('returnTestScenario', ${JSON.stringify(mode)}); window.__returnsTest = null; }`);
  await send('Page.navigate', { url: `${baseUrl}${route}` });
  await until(async () => {
    try { return await evaluate('Boolean(window.__returnsTest && document.querySelector("main") && document.readyState === "complete" && !document.querySelector("main [class*=loading]"))'); }
    catch { return false; }
  }, `page ${mode}`);
  await delay(90);
}

async function chooseReason(value = 'Sản phẩm bị lỗi / Hư hỏng do vận chuyển hoặc sản xuất') {
  await evaluate(`(() => { const select = document.querySelector('#return-reason'); select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await delay(30);
}

async function fillForm() {
  if (!await evaluate(`document.querySelector(${JSON.stringify(first)}).checked`)) await click(first);
  if (!await evaluate(`document.querySelector(${JSON.stringify(second)}).checked`)) await click(second);
  await chooseReason();
  await type('#return-description', 'Hộp bút bị móp, có 1 cây bút chảy mực & không viết được.\nMong cửa hàng hỗ trợ.');
  await type('#evidence-0', 'https://example.com/evidence.jpg?item=pen&color=blue');
  if (!await evaluate('document.querySelector("#return-confirmed").checked')) await click('#return-confirmed');
}

async function expectNoPost() {
  assert.equal(await evaluate('window.__returnsTest.postCount'), 0);
}

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1296, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installReturnMocks.toString()})(${JSON.stringify(returnFixture)});` });
  // Establish this origin before selecting test scenarios in localStorage.
  await send('Page.navigate', { url: `${baseUrl}/returns/new` });
  await until(() => evaluate('Boolean(window.__returnsTest && document.querySelector("main"))'), 'initial page');

  await test('Guest must sign in; no order API is called', async () => {
    await navigate('guest');
    assert.ok((await evaluate('document.querySelector("main").textContent')).includes('Đăng nhập để gửi yêu cầu'));
    const redirect = await evaluate(`document.querySelector('main a[href^="/login"]').getAttribute('href')`);
    assert.equal(new URL(redirect, baseUrl).searchParams.get('redirect'), '/returns/new?orderId=9842');
    assert.equal(await evaluate('window.__returnsTest.calls.some(call => call.path.startsWith("/api/orders"))'), false);
  });
  await test('Loads selected order and return history with Bearer auth', async () => {
    await navigate();
    assert.equal(await evaluate('document.querySelector("#return-order").value'), '9842');
    assert.ok((await evaluate('document.title')).includes('Trả hàng'));
    const calls = await evaluate('window.__returnsTest.calls.filter(call => call.path.startsWith("/api/orders") || call.path === "/api/returns/my-requests")');
    assert.equal(new Set(calls.map(call => call.path)).size, 3);
    assert.ok(calls.every(call => call.authorization === 'Bearer test-only-return-token'));
  });
  await test('Approved request reserves previously returned quantity', async () => {
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(third)}).disabled`), true);
    assert.equal(await evaluate(`document.querySelectorAll('main input[aria-label^="Trả "]').length`), 3);
  });
  await test('No product is selected automatically', async () => {
    assert.equal(await evaluate(`document.querySelectorAll('main input[aria-label^="Trả "]:checked').length`), 0);
    assert.ok((await evaluate('document.querySelector("[data-testid=return-total]").textContent')).startsWith('0'));
  });
  await test('Item selection recalculates 48,000 + 38,000 VND', async () => {
    await click(first); await click(second);
    assert.ok((await evaluate('document.querySelector("[data-testid=return-total]").textContent')).includes('86.000'));
  });
  await test('Quantity controls enforce purchased quantity and minimum one', async () => {
    await click('button[aria-label^="Tăng số lượng Mực"]');
    assert.ok((await evaluate('document.querySelector("[data-testid=return-total]").textContent')).includes('134.000'));
    assert.equal(await evaluate(`document.querySelector('button[aria-label^="Tăng số lượng Mực"]').disabled`), true);
    await click('button[aria-label^="Giảm số lượng Mực"]');
    assert.equal(await evaluate(`document.querySelector('button[aria-label^="Giảm số lượng Mực"]').disabled`), true);
  });
  await test('Select all excludes reserved products and toggles off', async () => {
    await click('[class*=selectAll] input');
    assert.equal(await evaluate(`document.querySelectorAll('main input[aria-label^="Trả "]:checked').length`), 0);
    await click('[class*=selectAll] input');
    assert.equal(await evaluate(`document.querySelectorAll('main input[aria-label^="Trả "]:checked').length`), 2);
  });
  await test('Submitting without products is blocked', async () => {
    await click('[class*=selectAll] input'); await click(submit);
    assert.ok((await evaluate('document.querySelector("main").textContent')).includes('chọn ít nhất một sản phẩm'));
    await expectNoPost();
  });
  await test('Reason is required', async () => {
    await fillForm(); await chooseReason(''); await click(submit);
    assert.equal(await evaluate('document.querySelector("#return-reason").getAttribute("aria-invalid")'), 'true');
    await expectNoPost();
  });
  await test('Whitespace-only description is blocked', async () => {
    await chooseReason(); await type('#return-description', '                    '); await click(submit);
    assert.ok((await evaluate('document.querySelector("#return-description-help").textContent')).includes('ít nhất 10'));
    await expectNoPost();
  });
  await test('Description is capped at 500 characters', async () => {
    await type('#return-description', 'a'.repeat(550));
    assert.equal(await evaluate('document.querySelector("#return-description").value.length'), 500);
  });
  await test('FTP and missing-host evidence URLs are rejected', async () => {
    await type('#evidence-0', 'ftp://example.com/file.jpg'); await click(submit); await expectNoPost();
    assert.equal(await evaluate('document.querySelector("#evidence-0").getAttribute("aria-invalid")'), 'true');
    await type('#evidence-0', 'https://'); await click(submit); await expectNoPost();
  });
  await test('Evidence is capped at five entries; entries can be removed', async () => {
    for (let index = 0; index < 4; index++) await click('button[class*=addEvidence]');
    assert.equal(await evaluate('document.querySelectorAll("input[id^=evidence-]").length'), 5);
    assert.equal(await evaluate('document.querySelector("button[class*=addEvidence]").disabled'), true);
    for (let index = 5; index >= 2; index--) await click(`button[aria-label="Xóa minh chứng ${index}"]`);
    assert.equal(await evaluate('document.querySelectorAll("input[id^=evidence-]").length'), 1);
  });
  await test('An added but empty evidence row blocks submission', async () => {
    await fillForm(); await click('button[class*=addEvidence]'); await click(submit);
    await expectNoPost();
    await click('button[aria-label="Xóa minh chứng 2"]');
  });
  await test('Confirmation checkbox is required', async () => {
    await click('#return-confirmed'); await click(submit); await expectNoPost();
    assert.equal(await evaluate('document.querySelector("#return-confirmed").getAttribute("aria-invalid")'), 'true');
    await click('#return-confirmed');
  });
  await test('Condition chips toggle and retain their selection', async () => {
    await click('button[class*=activeCondition], [class*=conditions] button');
    assert.equal(await evaluate('document.querySelector("[class*=conditions] button").getAttribute("aria-pressed")'), 'true');
  });
  await test('Desktop view loads real UI assets and is captured', async () => {
    await evaluate('document.querySelectorAll("main img").forEach(image => image.loading = "eager")');
    await until(() => evaluate('Array.from(document.querySelectorAll("main img")).every(img => img.complete && img.naturalWidth > 0)'), 'product images');
    await evaluate('scrollTo(0,0)');
    await fs.mkdir(path.join(workspace, '.cache'), { recursive: true });
    for (const [name, full] of [['returns-preview.png', false], ['returns-desktop.png', true]]) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
      await fs.writeFile(path.join(workspace, '.cache', name), Buffer.from(screenshot.data, 'base64'));
    }
  });
  await test('Successful request uses exact API fields and Unicode payload', async () => {
    await click(submit);
    await until(() => evaluate('Boolean(document.querySelector("main [class*=success]"))'), 'created request');
    const payload = await evaluate('window.__returnsTest.payload');
    assert.deepEqual(Object.keys(payload).sort(), ['evidenceUrls', 'items', 'orderID', 'reason']);
    assert.equal(payload.orderID, 9842);
    assert.deepEqual(payload.items, [{ orderDetailID: 11, quantity: 1 }, { orderDetailID: 12, quantity: 1 }]);
    assert.ok(payload.reason.includes('chảy mực & không viết được.\nMong cửa hàng'));
    assert.ok(payload.reason.includes('Tình trạng:'));
    assert.ok(payload.reason.length <= 1000);
    assert.deepEqual(payload.evidenceUrls, ['https://example.com/evidence.jpg?item=pen&color=blue']);
    assert.ok((await evaluate('document.querySelector("main [class*=success]").textContent')).includes('Chờ xét duyệt'));
    assert.ok((await evaluate('document.querySelector("main [class*=success]").textContent')).includes('chưa thực hiện hoàn tiền'));
  });
  await test('New request appears in history with pending status', async () => {
    assert.ok((await evaluate('document.querySelector("[class*=history]").textContent')).includes('Yêu cầu #502'));
    assert.ok((await evaluate('document.querySelector("[class*=history]").textContent')).includes('Chờ xét duyệt'));
  });
  await test('Returning to order recomputes remaining quantities', async () => {
    await click('main [class*=success] button');
    await until(() => evaluate('Boolean(document.querySelector("#return-order")) && !document.querySelector("main [class*=loading]")'), 'order refresh');
    assert.equal(await evaluate(`document.querySelector('main input[aria-label^="Trả Bộ"]').disabled`), true);
    await click(first);
    assert.equal(await evaluate(`document.querySelector('button[aria-label^="Tăng số lượng Mực"]').disabled`), true);
  });
  await test('Concurrent submit clicks create only one request', async () => {
    await navigate(); await fillForm();
    await evaluate('window.__returnsTest.delay = 250; document.querySelector("main button[type=submit]").click(); document.querySelector("main button[type=submit]").click()');
    await until(() => evaluate('Boolean(document.querySelector("main [class*=success]"))'), 'delayed success');
    assert.equal(await evaluate('window.__returnsTest.postCount'), 1);
  });
  await test('Refreshing history updates the confirmation status after approval', async () => {
    await evaluate('window.__returnsTest.returns[0].status = "APPROVED"; window.__returnsTest.returns[0].adminNote = "Đã duyệt yêu cầu, CSKH sẽ liên hệ."');
    await click('[class*=historyHeading] button');
    await until(() => evaluate('Boolean(document.querySelector("main [class*=success]")) && !document.querySelector("main [class*=loading]")'), 'updated request');
    assert.ok((await evaluate('document.querySelector("main [class*=success]").textContent')).includes('Đã chấp thuận'));
    assert.ok((await evaluate('document.querySelector("ol li[aria-current=step]").textContent')).includes('Thu hồi hàng'));
  });
  for (const [mode, expected] of [['conflict', 'Số lượng có thể trả đã thay đổi'], ['badRequest', 'Thông tin chưa hợp lệ'], ['submitError', 'Không thể kết nối']]) {
    await test(`${mode}: error is shown and entered data is preserved`, async () => {
      await navigate(mode); await fillForm(); await click(submit);
      await until(() => evaluate('Boolean(document.querySelector("[class*=submitError]"))'), 'submit error');
      assert.ok((await evaluate('document.querySelector("[class*=submitError]").textContent')).includes(expected));
      assert.ok((await evaluate('document.querySelector("#return-description").value')).includes('chảy mực'));
      assert.equal(await evaluate('Boolean(document.querySelector("main [class*=success]"))'), false);
      assert.equal(await evaluate('document.querySelector("main button[type=submit]").disabled'), false);
    });
  }
  for (const [mode, text] of [['expired', 'quá thời hạn'], ['undelivered', 'chưa được giao'], ['missingDate', 'chưa có thời gian'], ['allReserved', 'Tất cả số lượng']]) {
    await test(`${mode}: ineligible order cannot be submitted`, async () => {
      await navigate(mode);
      assert.ok((await evaluate('document.querySelector("main").textContent')).includes(text));
      assert.equal(await evaluate('document.querySelector("main button[type=submit]").disabled'), true);
      await expectNoPost();
    });
  }
  for (const [mode, disabled] of [['rejected', false], ['completed', true], ['pending', true]]) {
    await test(`${mode}: reservation matches backend policy`, async () => {
      await navigate(mode);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(third)}).disabled`), disabled);
    });
  }
  await test('401 clears expired token and requests login again', async () => {
    await navigate('unauthorized');
    assert.equal(await evaluate('localStorage.getItem("accessToken")'), null);
    assert.ok((await evaluate('document.querySelector("main").textContent')).includes('Đăng nhập để gửi'));
  });
  await test('Unknown/foreign order shows safe not-found error', async () => {
    await navigate('notFound');
    assert.ok((await evaluate('document.querySelector("main").textContent')).includes('Không tìm thấy đơn hàng'));
    assert.equal(await evaluate('Boolean(document.querySelector("main form"))'), false);
  });
  for (const mode of ['loadError', 'historyError']) {
    await test(`${mode}: failed eligibility data blocks form`, async () => {
      await navigate(mode);
      assert.ok((await evaluate('document.querySelector("main").textContent')).includes('Chưa tải được thông tin'));
      assert.equal(await evaluate('Boolean(document.querySelector("main form"))'), false);
    });
  }
  await test('Catalog failure retains functional order items', async () => {
    await navigate('catalogError');
    assert.equal(await evaluate(`document.querySelectorAll('main input[aria-label^="Trả "]').length`), 3);
    assert.equal(await evaluate('document.querySelector("main button[type=submit]").disabled'), false);
  });
  await test('Order picker supports entry without an order ID', async () => {
    await navigate('normal', '/returns/new');
    assert.equal(await evaluate('document.querySelector("#return-order").value'), '');
    assert.equal(await evaluate('Boolean(document.querySelector("main form"))'), false);
    await evaluate('const picker = document.querySelector("#return-order"); picker.value = "9842"; picker.dispatchEvent(new Event("change", {bubbles:true}))');
    await until(() => evaluate('Boolean(document.querySelector("main form"))'), 'selected order');
    assert.equal(await evaluate('new URLSearchParams(location.search).get("orderId")'), '9842');
  });
  await test('Direct order return route selects the same order', async () => {
    await navigate('normal', '/orders/9842/return');
    assert.equal(await evaluate('document.querySelector("#return-order").value'), '9842');
  });
  await test('Empty order history has a useful empty state', async () => {
    await navigate('noOrders', '/returns/new');
    assert.ok((await evaluate('document.querySelector("main").textContent')).includes('Chưa có đơn hàng'));
  });
  await test('Seven-day boundary and Vietnam date parsing match policy', async () => {
    await navigate();
    const policy = await evaluate(`(async () => {
      const service = await import('/src/services/returnService.ts');
      const order = {...window.__returnsTest.order, deliveredAt:'2026-11-01T10:00:00', status:'DELIVERED'};
      const boundary = Date.parse('2026-11-08T10:00:00+07:00');
      return {before:service.eligibilityMessage(order, boundary - 1), exact:service.eligibilityMessage(order, boundary), after:service.eligibilityMessage(order, boundary + 1), deadline:service.returnDeadline(order), boundary};
    })()`);
    assert.equal(policy.before, null); assert.equal(policy.exact, null);
    assert.ok(policy.after.includes('quá thời hạn')); assert.equal(policy.deadline, policy.boundary);
  });
  await test('Evidence URL checks reject script/data URLs and newlines', async () => {
    const urls = ['javascript:alert(1)', 'data:image/png,abc', 'https://example.com/a\nhttps://example.com/b', 'https://example.com/a', ' http://example.com/b '];
    const results = await evaluate(`(async () => { const {isEvidenceUrl} = await import('/src/services/returnService.ts'); return ${JSON.stringify(urls)}.map(isEvidenceUrl); })()`);
    assert.deepEqual(results, [false, false, false, true, true]);
  });
  await fillForm();
  for (const width of [320, 390, 768, 1024, 1296, 1536]) {
    await test(`Responsive form has no horizontal scrolling at ${width}px`, async () => {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await delay(70);
      const sizes = await evaluate('({width:innerWidth, document:document.documentElement.scrollWidth})');
      assert.ok(sizes.document <= sizes.width, JSON.stringify(sizes));
      if (width === 390) {
        await evaluate('scrollTo(0,0)');
        const screenshot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:true });
        await fs.writeFile(path.join(workspace, '.cache/returns-mobile.png'), Buffer.from(screenshot.data, 'base64'));
      }
    });
  }
  await test('Cancel returns to order picker without creating a request', async () => {
    await click('button[class*=cancelButton]');
    await until(() => evaluate('Boolean(document.querySelector("#return-order")) && !document.querySelector("main [class*=loading]")'), 'cancel');
    assert.equal(await evaluate('document.querySelector("#return-order").value'), '');
    await expectNoPost();
  });
  await test('No uncaught JavaScript errors', async () => assert.equal(browser.exceptions.length, 0, JSON.stringify(browser.exceptions)));
  for (const [destination, expected] of [
    ['/returns/new?orderId=9842', '/returns/new?orderId=9842'],
    ['//external.example/steal', '/'],
    ['/\n/external.example/steal', '/'],
  ]) {
    await test(`Login redirect stays on this site: ${JSON.stringify(destination)}`, async () => {
      await send('Page.navigate', { url: `${baseUrl}/login?redirect=${encodeURIComponent(destination)}` });
      await until(() => evaluate('Boolean(document.querySelector("main form a")) && location.pathname === "/login"'), 'login page');
      assert.equal(await evaluate('document.querySelector("main form a").getAttribute("href")'), expected);
    });
  }
  const report = { mocked: true, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results };
  await fs.writeFile(path.join(workspace, '.cache/returns-test-results.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed} passed, ${report.failed} failed (mocked API; no real refund or return created)`);
  process.exitCode = report.failed ? 1 : 0;
} finally { await browser.close(); }
