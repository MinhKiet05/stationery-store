# Checkout Preview và thông báo toàn hệ thống — 27/11/2026

## 1. Nguyên nhân HTTP 400 đã xác minh

Người dùng cung cấp request production lúc **15:10:04 UTC**:

```json
{"shippingMethod":"STANDARD","couponCode":"BLACKFRIDAY"}
```

Response cũ:

```json
{"timestamp":"2026-11-27T15:10:04.218Z","status":400,"error":"Bad Request","path":"/api/checkout/preview"}
```

Cấu hình coupon do người dùng cung cấp: phần trăm 50%, `min_order_value=200000.00`, hoạt động, từ 25–30/11/2026, `usage_limit=null`, `used_count=1`. Giỏ hàng **14.800đ < 200.000đ**, vì vậy không đủ giá trị tối thiểu. Ngày kiểm tra nằm trong hạn; mã đang hoạt động và không giới hạn lượt sử dụng. Điều kiện mức tối thiểu trong `CheckoutPolicy.discount` giải thích việc từ chối này. Không sửa mức tối thiểu, giảm giá 50%, cách làm tròn hoặc công thức phí ship.

Đây là lỗi nghiệp vụ có phản hồi HTTP, không phải bằng chứng mất kết nối. Các dòng Broken pipe lúc 15:07:05 UTC chỉ cho biết đầu nhận đã đóng kết nối trong lúc server ghi JSON; chưa có request ID để liên hệ chúng với preview lúc 15:10:04. Log mới không có OOM/restart. Không thay đổi cấu hình JVM của bản sửa trả hàng trước.

## 2. Contract và đường đi request

`CheckoutPage`/`CartPage` → `useCouponCheckout`/`useCheckout` → `checkoutService.previewCheckout` → `api.ts` → `CheckoutController.preview` → `CheckoutService.quote` → `CheckoutPolicy.discount/shippingFee` → DTO quote.

- Preview chỉ nhận shipping method và coupon tùy chọn, độ dài tối đa 50. Shipping thiếu/null mặc định STANDARD theo contract hiện có; enum sai bị 400. Payload production khớp DTO.
- Username lấy từ authentication. Subtotal lấy từ giỏ của tài khoản và giá DB; client không gửi tổng tiền để điều khiển preview.
- Server kiểm tra giỏ trống, giá/số lượng, trạng thái sản phẩm và tồn kho trước khi áp dụng coupon.
- Địa chỉ và payment method thuộc request tạo đơn, không nằm trong DTO preview. Sửa địa chỉ không làm đổi phí ship theo chính sách hiện tại; phí phụ thuộc STANDARD/EXPRESS và giá trị sau coupon.
- Payment method/tồn kho/giá/coupon/fee vẫn được kiểm tra lại khi tạo đơn; preview không giữ hàng, tăng usage hoặc tạo order.
- Coupon hiện là ưu đãi toàn đơn. Model không có điều kiện theo sản phẩm/danh mục/tài khoản; không tự dựng thêm quy tắc hoặc schema. Frontend có ánh xạ an toàn cho mã lỗi eligibility nếu API bổ sung sau này; browser tests mô phỏng việc hiển thị các code này, không chứng minh server đã hỗ trợ điều kiện đó.

Quote thành công giữ nguyên contract:

```json
{"subTotal":14800,"discountAmount":0,"shippingFee":25000,"totalAmount":39800,"shippingMethod":"STANDARD","couponCode":null}
```

Đây là ví dụ local theo phí STANDARD 25.000đ đã cấu hình trong test, không khẳng định đã thực hiện request production không coupon.

Backend mới trả ProblemDetail cho lỗi preview, ví dụ:

```json
{"status":400,"code":"COUPON_MINIMUM_NOT_MET","detail":"Đơn hàng chưa đạt giá trị tối thiểu để sử dụng mã này."}
```

Các code coupon khác: `COUPON_NOT_FOUND`, `COUPON_INACTIVE`, `COUPON_NOT_STARTED`, `COUPON_EXPIRED`, `COUPON_EXHAUSTED`. Status từ chối giữ nguyên: điều kiện coupon 400, hết lượt 409. Tách thông báo của các nhánh vốn dùng chung một phép OR; không nới điều kiện. Thêm `CART_EMPTY`, `CHECKOUT_STOCK_UNAVAILABLE`, `CHECKOUT_INVALID_INPUT` để phân biệt giỏ, tồn kho và DTO sai. Lỗi DAO trả 503 an toàn; không đưa SQL/parser diagnostics ra response.

## 3. Vì sao thông báo và giao diện cũ sai

1. Checkout chưa có advice riêng để đưa reason nghiệp vụ vào response; envelope mặc định chỉ có status/error/path. Không nên bật hiển thị toàn bộ exception messages trên production để chữa việc này.
2. API client có fallback cuối là “Không thể kết nối cửa hàng” cho hầu hết HTTP error, gồm cả 400. Allowlist không nhận được lý do cụ thể vì response đã bỏ mất nó.
3. `couponCode` được set ngay khi bấm nút, rồi dùng trực tiếp cho badge/summary/request tạo đơn, trước xác nhận server.
4. Summary dùng điều kiện `quote.data ? số tiền : "Đang tính…"`, không xét request đã lỗi hay chưa.
5. Cart cũng có cùng lỗi coupon/summary; các mutation Cart/Checkout và payment demo chưa dùng đầy đủ toast chung.

## 4. Coupon và preview sau sửa

- Input giữ draft độc lập. Chỉ bấm Sử dụng/Áp dụng mới gửi kiểm tra, không gọi API theo từng ký tự; không cần debounce cho thao tác gõ.
- Trong lúc kiểm tra có trạng thái riêng, khóa đặt hàng. Sửa draft hoặc đổi shipping/cart/session sẽ hủy validation cũ; response bị hủy không được áp dụng hay báo lỗi. Sửa draft cũng xóa lỗi của lần nhập trước, không tự kiểm tra mã mới.
- Chỉ quote server xác nhận đúng mã mới được seed vào TanStack Query và đánh dấu đã áp dụng. Cache key chứa session, shipping method và nội dung giỏ (ID/số lượng/line total).
- Mã mới không hợp lệ: giữ input, báo toast đúng lý do, giữ mã hợp lệ trước đó nếu có. Khi chưa có mã hợp lệ, quote không coupon vẫn sử dụng được; có thể xóa mã lỗi và tiếp tục.
- Xóa mã hủy validation đang chạy, xóa draft/code/error và báo info; quote chuyển về không coupon.
- Cart chuyển sang checkout chỉ truyền mã được xác nhận; checkout kiểm tra lại mã đầu vào. Không tự retry POST tạo đơn.
- Quote mới không sử dụng placeholder từ key khác. Khi refetch/error, summary không trình bày số tiền cũ như ước tính mới. “Đang tính…” chỉ xuất hiện khi query đang fetch; lỗi có “Chưa tính được” và nút thử lại. Trạng thái chưa có dữ liệu tách khỏi loading/error.
- Response quote được kiểm tra số hữu hạn, không âm và trường shipping/coupon trước khi render; dữ liệu thiếu/sai kiểu không trở thành NaN/undefined trên summary.
- Preview không tự retry, gồm cả 400. Quote xác nhận có stale time 15 giây cho cùng key; thay đổi giỏ hoặc shipping tạo key mới. Background refetch không phát toast tự động.
- Preview bị tạm dừng trong mutation giỏ để tránh đọc giỏ server cũ trong lúc UI đang optimistic. Mutation giỏ hiện có rollback/reconcile qua `useCartMutation` được giữ nguyên.
- Nút đặt hàng và handler đều yêu cầu quote hợp lệ, phương thức payment được bật và không có mutation/validation đang chạy. Địa chỉ thiếu vẫn là validation tại form.
- Tạo đơn 408/5xx/timeout/mất phản hồi vẫn giữ bản nháp, khóa submit và cho xem lịch sử. Không thông báo chắc chắn chưa tạo, không tự POST lại. Các lỗi xác định không reset form; có thể sửa dữ liệu và gửi lại. Thanh toán demo chỉ retry cùng order ID, không tạo lại order.

## 5. Shared error handling và toast

`apiError.ts` tập trung code và fallback theo status: 400, 401, 403, 404, 408, 409, 413, 422, 429, 500, 502/503/504. `ApiError` giữ thêm code; `userMessage` ưu tiên code được duyệt, rồi detail/message được duyệt, rồi status/fallback an toàn. Không đưa reason tùy ý, stack trace, SQL hay parser diagnostics tới khách hàng. Unknown code, kể cả tên thuộc prototype object, không được dùng như message.

- Network TypeError khác với HTTP error; TimeoutError có thông báo thời gian chờ riêng.
- AbortError do hủy có chủ đích không báo toast. Lỗi response từ session cũ được chuyển thành AbortError, không đăng xuất hay báo lỗi lên session mới.
- 401 vẫn do API client sở hữu một cảnh báo hết phiên; component kiểm tra `notificationHandled`. Admin có thể giữ câu chữ theo ngữ cảnh và truyền nguyên nhân gốc ở tham số thứ ba để không mất metadata cancellation/401.
- Password reset tiếp tục public/no bearer/no retry, giữ thông báo link hết hạn và cooldown. Envelope legacy không được ghi đè thông báo reset/register chuyên biệt bằng generic 400.
- AI chat bỏ timer `abort()` riêng trùng mốc 65 giây: dùng timeout chung để phân biệt timeout thật với unmount/hủy chủ đích. Không tăng thời gian chờ.
- Vẫn chỉ có một `AppNotifications`/ToastContainer, vị trí top-right, theme/style hiện hành, nút đóng, mobile layout và portal vào native dialog. Không thêm thư viện/notification component hay thay design system.
- Toast cho kết quả thao tác và kiểm tra coupon. Validation trường nhập và recovery UI có nút thử lại giữ inline. Không phát toast từ mọi query nền/render.

## 6. Audit các trang thực tế

| Khu vực | Kết quả và xử lý |
| --- | --- |
| Login/Register | Đã dùng notify; sửa phân loại HTTP qua API chung, giữ validation và payload; cập nhật test 500 không còn giả network error. |
| Forgot/Reset Password | Đã dùng notify; giữ bảo mật thông báo email trung tính, sửa legacy status envelope và fallback HTTP, giữ cooldown. |
| Product Detail/Search cards | Đã dùng notify cho cart/favorite/share; deliberate AbortError được chặn; không sửa layout. |
| Search/list/catalog | Lỗi read giữ recovery tại chỗ; 503 nay là gián đoạn dịch vụ, không giả lỗi mạng hoặc fabricate sản phẩm. |
| Guest Cart/Wishlist | Đã dùng notify; storage/stock validation giữ đúng chủ sở hữu, không toast từ synchronization effects. |
| Cart/Checkout | Sửa coupon state, summary loading/error, pause preview trong mutation, success/failure toast cho cập nhật giỏ/tạo đơn; giữ uncertain lock và history. |
| Payment demo | Toast chỉ sau response xác nhận; lỗi có recovery cùng order ID, không tự tạo lại order. |
| My Profile/Account/Security | Đã dùng notify, giữ inline field validation và drafts; lỗi chung dùng sanitizer/status mới. |
| Order History/Order Detail | Hủy đơn báo đúng một toast; đọc chi tiết giữ recovery; trạng thái trả hàng/lịch sử không đổi. |
| Product Review/media | Đã dùng notify và shared attachment validation; bổ sung allowlist đúng lỗi Cloudinary để generic gateway không che lỗi upload đã xác định. |
| Return Request | Giữ cơ chế uncertain outcome, bản nháp và đối chiếu lịch sử của bản sửa trước; không đổi công thức hoàn tiền. |
| Admin Overview/read resources | Giữ filter validation và dashboard recovery inline; không toast từ background refetch. |
| Admin Products/Stock | Giữ thao tác/confirmation/stale guards; truyền cause gốc để AbortError/401 không báo thêm toast. |
| Admin Users | Sửa hai nhánh không return sau access-denied (export và detail); giữ cause gốc, không báo action error sau hết phiên. |
| Admin Orders/Returns/Reviews/Promotions | Giữ toast và inline recovery/stale controls; giữ cause gốc và sửa fallback status trong admin utility. Không đổi nghiệp vụ kho/trả hàng. |
| Excel Import | Return ngay sau 401/403; truyền cause gốc, giữ validation file/preview và unknown-result lock. |
| Các trang tĩnh/chính sách/thông tin và skeletons | Không có mutation cần toast; không chuyển các thông báo nội dung thành toast. |

Tìm kiếm toàn `frontend/src` không có `window.alert()`/`alert()` và không có lời gọi toast trực tiếp ngoài utility chung. Các catch im lặng cho analytics, image/catalog enrichment, cancelled requests hoặc storage tùy chọn không được biến thành toast gây spam. Không coi chúng là thao tác người dùng thất bại nếu luồng chính vẫn hoàn thành.

## 7. Kiểm thử

Backend tests dùng dữ liệu giả và H2; browser suites mock toàn bộ API và không ghi production. Kết quả cuối cùng:

| Suite | Kết quả |
| --- | --- |
| Backend `mvnw.cmd -o test` | 377 ca: 331 pass, 46 skip theo điều kiện môi trường, 0 failure/error |
| Backend checkout focused sau khi chỉnh fixture min 200.000đ | 11/11 pass |
| Frontend unit hiện có `node --test --test-concurrency=1 tests/*.mjs` | 52/52 pass |
| API error regression TypeScript mới | 20/20 pass |
| Checkout error browser mới | 22/22 pass |
| Cart/Checkout browser | 11/11 pass |
| Notification browser | 18/18 pass |
| Order review và review media | 7/7 và 6/6 pass |
| Return Request regression | 58/58 pass |
| Admin Users / Products / Orders | 10/10, 11/11, 9/9 pass |
| Admin Returns / Reviews / Promotions | 14/14, 10/10, 12/12 pass |
| Excel Import / Dashboard / Admin route | 9/9, 23/23, 13/13 pass |
| Query navigation / storefront | 1/1 (hai lượt qua bảy route) và 6/6 pass |
| ESLint / TypeScript + Vite build / `git diff --check` | Pass |

46 ca backend skip không tính là pass; cần môi trường PostgreSQL/container/browser opt-in tương ứng. Suite đầy đủ chạy trước khi điều chỉnh fixture từ min 100.000đ sang 200.000đ; suite focused sau đó compile và chạy lại 11 ca checkout. Không thay đổi backend runtime code sau suite đầy đủ.

Các regression expectations cũ cũng được sửa cho hành vi mới: 503 không còn được kỳ vọng là network error; response 401 của session cũ trở thành AbortError; checkout có toast kết quả thao tác. Fixture storefront thiếu trường `couponCode:null` được bổ sung cho đúng DTO backend, thay vì nới validator để chấp nhận response sai contract.

Hai nhóm mới:

- `npm run test:api-errors`: status mapping, safe code/detail, legacy envelopes, body gateway rỗng, timeout/network/abort, metadata cause Admin, 401 đồng thời, session cũ, response quote sai kiểu.
- `npm run test:checkout-errors`: giỏ 14.800đ, coupon hợp lệ/không đủ mức tối thiểu/hết hạn/không tồn tại/hết lượt/eligibility code, input chưa áp dụng, thay mã hợp lệ bằng mã lỗi, xóa và tiếp tục, 400/500/502, timeout/mạng, cancellation, nhiều shipping requests, kết thúc loading, không tạo đơn khi quote sai, không POST trùng và responsive.

Các test eligibility sản phẩm/tài khoản chỉ kiểm tra UI cho response code mô phỏng; backend hiện không có quy tắc này. Integration H2 kiểm tra điều kiện thật về mức tối thiểu, ngày, hoạt động, usage, enum/body sai, quyền sở hữu, tồn kho, shipping/payment và tạo đơn revalidate. Ca mức tối thiểu dùng giá giỏ 14.800đ và min 200.000đ đúng cấu hình người dùng cung cấp.

## 8. Database, environment và production

Không cần migration hoặc environment variable mới. Không đổi Flyway V1–V6, schema, coupon data, công thức tiền, JVM hoặc design system. Đã xác minh nguyên nhân dựa trên payload/response và cấu hình coupon người dùng cung cấp, đồng thời tái hiện rule bằng H2; chưa tự gọi preview với tài khoản production hay chạy checkout thật. Việc thử đọc trang bằng công cụ web không truy cập được nội dung, không được tính là kiểm thử production.

Sau triển khai đồng bộ, cần kiểm tra request coupon không đạt mức tối thiểu trả `COUPON_MINIMUM_NOT_MET` và toast cụ thể; kiểm tra vận hành thực tế qua môi trường được phép. Không tạo order, thanh toán hoặc thay đổi database production trong task. Chưa commit/push/deploy.

## 9. File thay đổi

- `backend/src/main/java/com/example/backend/controller/CheckoutExceptionHandler.java`
- `backend/src/main/java/com/example/backend/services/CheckoutFailure.java`
- `backend/src/main/java/com/example/backend/services/CheckoutPolicy.java`
- `backend/src/main/java/com/example/backend/services/CheckoutService.java`
- `backend/src/test/java/com/example/backend/deployment/CheckoutShippingPaymentTest.java`
- `docs/CHECKOUT_NOTIFICATION_AUDIT.md`
- `frontend/package.json`
- `frontend/scripts/test-checkout-errors.ts`
- `frontend/scripts/test-notifications.mjs`
- `frontend/scripts/test-query-storefront.mjs`
- `frontend/src/components/aiChat/AiChatWidget.tsx`
- `frontend/src/components/dashboard/ImportExcelModal.jsx`
- `frontend/src/components/dashboard/OrderDetailModal.jsx`
- `frontend/src/components/dashboard/ProductDetailModal.jsx`
- `frontend/src/components/dashboard/ProductFormModal.jsx`
- `frontend/src/components/dashboard/ReturnDetailModal.jsx`
- `frontend/src/components/dashboard/ReturnInventoryModal.jsx`
- `frontend/src/components/dashboard/ReviewDetailModal.jsx`
- `frontend/src/components/dashboard/StockDetailModal.jsx`
- `frontend/src/components/dashboard/UserDetailModal.jsx`
- `frontend/src/components/dashboard/VoucherDetailModal.jsx`
- `frontend/src/components/dashboard/VoucherFormModal.jsx`
- `frontend/src/hooks/useCheckout.ts`
- `frontend/src/hooks/useCouponCheckout.ts`
- `frontend/src/pages/carts/CartPage.tsx`
- `frontend/src/pages/carts/CheckoutPage.tsx`
- `frontend/src/pages/carts/PaymentModal.tsx`
- `frontend/src/pages/dashboard/OrdersPage.jsx`
- `frontend/src/pages/dashboard/ProductsPage.jsx`
- `frontend/src/pages/dashboard/PromotionsPage.jsx`
- `frontend/src/pages/dashboard/ReturnsPage.jsx`
- `frontend/src/pages/dashboard/ReviewsPage.jsx`
- `frontend/src/pages/dashboard/UsersPage.jsx`
- `frontend/src/services/api.ts`
- `frontend/src/services/apiError.ts`
- `frontend/src/services/checkoutService.ts`
- `frontend/src/services/dashboardApi.ts`
- `frontend/src/services/passwordResetApi.ts`
- `frontend/src/utils/notifications.ts`
- `frontend/tests/apiErrors.test.ts`
- `frontend/tests/catalogService.test.mjs`
- `frontend/tests/profile.test.mjs`

## 10. Commit gợi ý

- `fix(checkout): confirm coupons before applying and recover failed previews`
- `fix(notifications): classify HTTP errors and preserve cancellation ownership`
- `test(checkout): cover coupon rejection stale quotes and uncertain orders`
