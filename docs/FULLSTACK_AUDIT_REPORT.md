# StationeryStore — Full-stack audit

Ngày kiểm tra: 27/11/2026, Asia/Ho_Chi_Minh. Branch: `refactor/fullstack-audit`. Baseline: `95028da`.

## 1. Executive Summary

Đã sửa trực tiếp các lỗi có bằng chứng trong routing, phân trang, giỏ hàng, review, session, trạng thái lỗi và accessibility; giữ kiến trúc và các quy tắc nghiệp vụ backend hiện có. Không đổi model Gemini, embedding dimension, database schema hay quy ước page index. Không commit, push, deploy, reindex hoặc dùng dữ liệu production.

Các kết quả chính:

- HTTP pagination dùng DTO ổn định tại 9 endpoint, giữ envelope cũ; không bật VIA_DTO hoặc che logging.
- Storefront/dashboard có 404 đúng layout và phân quyền. API/product 404 được phân biệt với lỗi tải dữ liệu.
- Khôi phục `/cart`, checkout qua API hiện có và sửa các link/alias sai. Bộ lọc đơn hàng có URL để refresh/Back/Forward.
- Modal review hỗ trợ sửa nội dung và giữ/xóa/thêm ảnh bằng endpoint owner update hiện có; gallery xem ảnh không bị sửa.
- Cache/session guards hiện có được giữ; chatbot được reset khi đổi phiên; đổi mật khẩu sử dụng API adapter chung.
- Gỡ package `tailwind` không dùng; npm audit từ 33 advisory xuống 0. Tailwind CSS vẫn hoạt động.
- Merge giỏ 3 món giảm từ 25 xuống 19 SQL trong fixture H2, dựng response giỏ một lần.

Chưa thể kết luận sẵn sàng production vô điều kiện: cơ chế thu hồi JWT, nội dung chính sách/thanh toán và các kiểm tra PostgreSQL/Redis/provider thực còn cần xử lý hoặc xác nhận, xem mục 18–19.

## 2. Baseline trước khi chỉnh sửa

Working tree ban đầu sạch; làm việc trên branch hiện tại. Không tìm thấy `AGENTS.md` ở repository hoặc các thư mục cha đã kiểm tra.

Đã đọc README, package/pom, service/controller/DTO, routing, cấu hình Vite/Vercel/Docker/Spring, ví dụ môi trường, tài liệu performance/Redis và các test hiện có. Các commit gần nhất: thêm gallery review (`95028da`), sửa request review phục vụ deployment (`baf00f7`), merge modal review và trả hàng. Những luồng này được ưu tiên regression.

| Kiểm tra baseline | Kết quả thực chạy |
| --- | --- |
| `npm run lint` | PASS |
| `node --test tests/*.test.mjs` | 49 PASS; chạy đồng thời gây cảnh báo tranh cổng HMR của harness, nên lượt cuối dùng `--test-concurrency=1` |
| `npm run build` không có env | Từ chối đúng do thiếu `VITE_API_BASE_URL` |
| Build với `https://backend.example.com` | PASS; origin ví dụ chỉ để kiểm tra build, không gửi request/deploy |
| Maven Wrapper online | Bị chậm bởi metadata repository 401/timeout; dừng và chạy offline bằng dependencies đã có |
| `.\mvnw.cmd -o test` | 338 tests: 293 PASS, 45 SKIPPED, 0 failure/error |
| `npm run test:review-media` | 6 browser checks PASS |
| `npm audit --json` | 33 advisory: 1 critical, 11 high, 17 moderate, 4 low |
| Pagination | Tái hiện cảnh báo `Serializing PageImpl instances as-is...` trong log baseline |

Log baseline nằm trong `.cache/audit-baseline-*`, `.cache/audit-npm-baseline.json`. `.cache/` được Git ignore.

## 3. Danh sách phát hiện, mức độ, nguyên nhân và giải pháp

Mức độ xét theo tác động và bằng chứng; advisory dependency không đồng nghĩa đã khai thác được trên production.

| ID | Mức độ | Trạng thái | Nguyên nhân / giải pháp / vị trí |
| --- | --- | --- | --- |
| A01 | Critical | FIXED | Dependency `tailwind` là package khác Tailwind CSS và không có import sử dụng; kéo theo chuỗi advisory, gồm critical. Gỡ package, giữ `tailwindcss`/`@tailwindcss/vite`, cập nhật lock trong semver cho phép. `frontend/package*.json`. |
| A02 | High | FIXED | Không có storefront catch-all; dashboard catch-all là placeholder. Thêm 404 có title, recovery links và layout đúng. `frontend/src/App.tsx`, `pages/notFound/*`. |
| A03 | High | FIXED | Header dẫn `/cart` nhưng không có route, dù cart CRUD và checkout API đã có. Thêm trang guest/customer cart, cập nhật/xóa, lỗi/retry, COD, coupon tùy chọn và chặn double-submit/kết quả checkout chưa rõ. `pages/cart/*`. |
| A04 | High | FIXED | Product ID/handle không tồn tại ném `IllegalArgumentException`, không có catalog error adapter. Trả HTTP 404 rõ ràng; filter/sort/ID sai trả 400, lỗi DB trả 503 không lộ SQL. `ProductServiceImpl`, `CatalogExceptionHandler`, `ProductDetail.tsx`. |
| A05 | High | FIXED | `getCurrentUser` trả anonymous success cho lỗi 5xx, và không có timeout riêng. Cho lỗi transient reject với status, timeout/abort 65s và retry chủ động ở Header; không xóa login vì 5xx. `authService.ts`, `Header.tsx`. |
| A06 | High | FIXED | Đổi mật khẩu dùng fetch riêng, bỏ qua 401/session-generation/timeout. Chuyển sang `changeMyPassword` qua `api`, abort khi unmount, khóa request trùng. `SecurityTab.tsx`, `userService.ts`. |
| A07 | Medium | FIXED | 9 HTTP endpoint serialize Spring Page trực tiếp. Chuyển sang `PageResponse.from`, giữ cả `pageable` và `sort`. Controllers + `dto/PageResponse.java`. |
| A08 | Medium | FIXED | `/profile`, `/orders` mất search/hash; `/review` cũ không có đích; handle bị decode hai lần có thể làm lỗi `%`. Alias bảo toàn query/hash, review về order history, bỏ decode lần hai. `App.tsx`. |
| A09 | Medium | FIXED | Header gửi category slug trong khi Search chỉ nhận ID số; `/promotions` không có trang. Header lấy category thật từ shared cache; promotion dùng `onSale=true`, giữ alias cũ. `Header.tsx`, `App.tsx`. |
| A10 | Medium | FIXED | Header/Footer/product/chat dùng anchor nội bộ gây reload; Footer có `href="#"`; About chỉ theo native hashchange. Dùng React Router, sửa đích và đồng bộ hash bằng location. `Header`, `Footer`, `AboutUs`, `ProductDetail`, `AiChatWidget`, `ReturnRequest`. |
| A11 | Medium | FIXED | Conversation chatbot sống qua logout/account switch. Key widget theo session generation; abort khi unmount không phát toast muộn. `App.tsx`, `AiChatWidget.tsx`. |
| A12 | Medium | FIXED | Modal chỉ đọc review đã gửi, API sửa bị bỏ rơi; action bị disabled khi tất cả món đã review. Tái sử dụng form cho owner update, giữ ảnh cũ mặc định, xóa theo position, thêm ảnh trong giới hạn tổng 5; action “Xem đánh giá” vẫn mở modal để sửa. `OrderHistoryTab.tsx`, `ReviewModal.tsx`, `ReviewForm.tsx`. |
| A13 | Medium | FIXED | E2E thật tái hiện toast thành công che link giỏ ở viewport hẹp. Vị trí toast theo cạnh dưới Header; trong native dialog giữ top-layer host và offset riêng. `AppNotifications.tsx`, `Notifications.css`. |
| A14 | Medium | FIXED | Order search/status/page chỉ ở component state; refresh/Back mất filter. Chuyển sang search params, giữ page API zero-based. Đồng bộ draft giá catalog khi URL đổi. `OrderHistoryTab.tsx`, `SearchPage.tsx`. |
| A15 | Medium | FIXED | Return picker dùng `history.replaceState(null,...)`, bypass React Router và có thể mất history state. Dùng navigate replace. Link điều kiện trả hàng trỏ thẳng policy. `ReturnRequest.tsx`. |
| A16 | Medium | FIXED | Merge giỏ gọi addItem rồi hydrate toàn bộ giỏ cho mỗi món. Lock một lần, giữ kiểm tra/cộng dồn từng món và hydrate response một lần trong transaction. `CartService`, `CartServiceImpl`, `CartMergeServiceImpl`. |
| A17 | Medium | FIXED | Không có Error Boundary cho render/lazy chunk failures. Thêm boundary giữ storefront/dashboard shell khi lỗi trang con; reload là thao tác người dùng, không tạo loop. `RouteErrorBoundary.tsx`, `App.tsx`, `DashboardLayout.jsx`. |
| A18 | Low | FIXED | Nút quick-search policy không có nhãn và sai dấu; password toggles bị bỏ khỏi keyboard; đổi tab đăng ký là span click. Bổ sung nhãn, button semantic và keyboard access. `Policy.tsx`, `Login.tsx`, `SecurityTab.tsx`. |
| A19 | Low | FIXED | Newsletter form không gửi gì; Google/Facebook buttons không có hành vi. Newsletter dẫn liên hệ, bỏ hứa voucher tự cấp; social buttons disabled có nhãn chưa khả dụng, không dựng OAuth mới. `Footer.tsx`, `Login.tsx`. |
| A20 | Low | FIXED | README tham chiếu `.env.example` và tài liệu Gemini không tồn tại; file có encoding không tương thích công cụ patch UTF-8. Viết lại README UTF-8 với link/config/test thực tế. |

### Source locations

| Area | File and starting line |
| --- | --- |
| Pagination DTO | `backend/src/main/java/com/example/backend/dto/PageResponse.java:9` |
| Catalog HTTP errors | `backend/src/main/java/com/example/backend/controller/CatalogExceptionHandler.java:14` |
| Product endpoints | `backend/src/main/java/com/example/backend/controller/ProductController.java:29` |
| Merge transaction | `backend/src/main/java/com/example/backend/services/impl/CartServiceImpl.java:46` |
| Routes and boundaries | `frontend/src/App.tsx:82` |
| 404 component | `frontend/src/pages/notFound/NotFound.tsx:6` |
| Cart/checkout | `frontend/src/pages/cart/CartPage.tsx:39` |
| Review editor | `frontend/src/components/review/ReviewForm.tsx:15` |
| Review view/edit entry | `frontend/src/components/review/ReviewModal.tsx:72` |
| Order URL state | `frontend/src/pages/myProfile/tabs/OrderHistoryTab.tsx:31` |
| Notification positioning | `frontend/src/components/notifications/AppNotifications.tsx:19` |
| Transient identity failures | `frontend/src/services/authService.ts:60` |
| Password API adapter | `frontend/src/services/userService.ts:22` |
| Session-separated chat | `frontend/src/App.tsx:55` |
| Render/chunk boundary | `frontend/src/components/RouteErrorBoundary.tsx:4` |
| Real browser test entry | `backend/src/test/java/com/example/backend/deployment/FullstackBrowserIntegrationTest.java:33` |

## 4. Route và link đã xử lý

| Nguồn/URL | Hành vi cuối |
| --- | --- |
| Unknown storefront URL, kể cả nested URL | Render 404 tại URL đó, giữ Header/Footer |
| `/dashboard/*` unknown | Qua AdminRoute trước; admin có dashboard 404; guest login; customer 403 |
| `/cart` | Guest cart lưu thiết bị; customer cart/checkout dùng API hiện có |
| `/products` | Alias sang `/search`, giữ search/hash |
| `/profile`, `/orders` | Alias sang `/my-profile`, `/my-profile/orders`, giữ search/hash |
| `/review` | Alias tương thích về order history chứa modal review |
| `/promotions` | Alias sang search có `onSale=true`; nav mới dùng trực tiếp URL này |
| Header category links | ID thật từ `/api/product-types`, dùng cùng catalog key/prefetch |
| Header search, logo, order tracking, login/cart | SPA navigation; login nhớ trang đang xem |
| Footer mua hàng / thanh toán / tuyển dụng | FAQ / policy terms / contact thực tế; không còn `href="#"` |
| Policy/Footer hash và About FAQ/contact/stores | SPA hash cập nhật nội dung/scroll; cùng trang không cần reload |
| Product checkout guest login | Sau login quay về `/cart` để tiếp tục giỏ đã merge |
| Return consent link | `/policy#returns` |

Giữ toàn bộ About aliases và 6 biến thể route trả hàng đang có. Không thêm trang notifications giả: bỏ link mặc định dẫn vào route chưa tồn tại và chấm báo tin giả. `notificationsHref` vẫn là prop tùy chọn cho nơi gọi đã có chức năng thực.

## 5. Trang Not Found và lỗi tải trang

`NotFound.tsx`/CSS Module dùng #FD761A, icon Lucide sẵn có, responsive, h1 “Không tìm thấy trang”, mã 404, title phù hợp, nút về home/overview và khám phá sản phẩm. Không tải thư viện/hình minh họa mới. Nút có focus-visible và độ tương phản chữ tối trên cam.

Không redirect unknown URL về home. `frontend/vercel.json` đã có SPA rewrite vào index.html. Đây là **UI 404 của SPA**: hosting rewrite vẫn có thể trả **HTTP 200**; không tuyên bố HTTP 404 thật cho tài liệu HTML. Product API không tồn tại trả HTTP 404 thật, khác 503/network/retry và list rỗng.

Boundary nhận biết lỗi import chunk để hướng dẫn reload/cập nhật phiên bản. Không hiển thị exception/stack trace cho khách; intentional render-error test có console error dự kiến riêng, các luồng bình thường phải không có lỗi console bất thường.

## 6. API phân trang đã chuẩn hóa

| Method | Endpoint |
| --- | --- |
| GET | `/api/products` |
| GET | `/api/products/search` (legacy và `catalog=true`) |
| GET | `/api/admin/products` |
| GET | `/api/admin/orders?page=...` |
| GET | `/api/admin/returns?page=...` |
| GET | `/api/admin/reviews` |
| GET | `/api/admin/users` |
| GET | `/api/admin/dashboard/orders` |
| GET | `/api/admin/dashboard/low-stock` |

Giữ top-level `content`, `number`, `size`, `totalElements`, `totalPages`, `first`, `last`, `empty`, `numberOfElements`, `sort`, `pageable`. Sort có `sorted`, `unsorted`, `empty`; pageable có `pageNumber`, `pageSize`, `offset`, `paged`, `unpaged`, `sort`. Không đưa Spring Page/Sort/Pageable trực tiếp vào DTO HTTP.

Frontend chủ yếu dùng `content`, `totalElements`, `totalPages`, admin type còn mô tả các cờ/số lượng; không có consumer đọc sort descriptors. Metadata sort của catalog được giữ đúng như Page nguồn, kể cả trường hợp Criteria áp dụng order còn PageRequest là unsorted.

`/api/admin/promotions` đã có record `AdminCouponService.Page`; order history đã có `MyOrderHistoryResponse` (thêm `statusCounts`), không phải PageImpl. Giữ nguyên hai contract đó. Legacy order/return APIs không có `page` vẫn trả array. Các Page trong service/cache/repository nội bộ không phải HTTP serialization và được giữ.

`PaginationContractIntegrationTest` kiểm tra chính xác tập field của cả 9 endpoint, nested metadata, page hai, empty result, filter/sort thực, legacy arrays, admin denial và product HTTP errors. Không bật VIA_DTO: Spring mô tả chế độ đó là wrapper `PagedModel`, khác envelope hiện dùng ([Spring Data documentation](https://docs.spring.io/spring-data/jpa/reference/repositories/core-extensions.html)).

## 7. Đối chiếu API contract

| Nhóm services | Backend/contract đã đối chiếu |
| --- | --- |
| auth/passwordReset/user | `/api/auth/*`, `/api/users/me`, password PUT/204; Bearer header, auth public không gửi token cũ |
| product/catalog/productType | `/api/products`, handle endpoint, `/search?catalog=true`, `/api/product-types`, variants; ID/handle encoding và page zero-based |
| cart/order | Cart item POST/PUT/DELETE; guest merge POST; checkout POST gồm address/phone/COD/couponCode; my-orders array hoặc page/summary |
| review | Product review POST, owner review PUT/DELETE; JSON hoặc multipart `review`, `images`, `removeImagePositions`; response `Review.images` |
| return | Create gồm orderID/reason/evidenceUrls/items; ownership ở backend; PENDING/APPROVED/REJECTED/COMPLETED; receipt/inspection/restock ở admin |
| admin products/orders/returns/users/reviews | Paths, methods, page/filter/export, expected state/version và nullable detail fields giữ nguyên |
| promotions/Excel | Existing coupon CRUD, promotion page, date-only fields, import preview/token/confirm, multipart/download filename |
| AI/tracking | Chat POST, recommendation recent/popular, tracking events; source enum và private query keys giữ nguyên |

Toàn bộ `frontend/src/services` hiện là TypeScript. Không migrate JSX hàng loạt, không tắt strict/noUnused hoặc lint rules. Không thay kiểu tiền/timestamp hoặc enum trạng thái backend để khớp UI giả định.

## 8. Luồng khách hàng và admin

Guest/customer flows đã kiểm tra bằng unit, browser mocks và một bài E2E HTTP thật: sản phẩm/variant, guest cart, login/merge, cart CRUD/rollback, COD checkout, history, review create/edit, return request và direct route. Forgot/reset có browser riêng và backend tests; không gửi email thật.

Dashboard hiện có Overview, Products, Orders, Returns, Users, Reviews, Promotions; Excel import nằm trong modal. Tất cả có browser scripts thực thi. Không phát hiện route nghiệp vụ admin còn trỏ vào placeholder; đã xóa `DashboardPlaceholder.jsx` sau khi catch-all được thay bằng 404. Unknown dashboard route giờ là 404.

Các mutation quan trọng dùng busy/ref lock, expected status/version hoặc backend row lock. UI chỉ là lớp thuận tiện; backend vẫn kiểm tra role, ownership, tồn kho, coupon, trạng thái và giới hạn trả hàng. Không tự thêm nghiệp vụ thanh toán, hoàn tiền hay shipper.

## 9. UI/UX và accessibility

Đã kiểm tra overflow ở 360, 390, 768, 1024, 1440, 1920 cho 404/cart/policy/search bằng script audit; các browser suite sẵn có còn kiểm tra nhiều viewport cho dashboard, modal và returns. Chưa phải kiểm tra mọi tổ hợp nội dung trên mọi thiết bị thật.

Giữ thiết kế tổng thể. Header có danh mục cuộn ngang trong vùng nav ở màn hình nhỏ, không đẩy document tràn ngang; login và cart vẫn truy cập được. Thêm global focus-visible/reduced-motion, native button cho thao tác, nhãn password/quick search, disabled state rõ ràng cho OAuth chưa có. Modal review tiếp tục dùng native dialog/focus restore/Escape và scroll bên trong.

Cart/API failure hiển thị error/retry, không đổi thành empty state. Checkout chưa rõ kết quả khóa submit và có link lịch sử. Product 404 không dùng thông báo lỗi mạng. Không dùng timeout giả hoặc loading vô hạn để che lỗi.

## 10. Frontend performance

Route product/search/profile/tabs/dashboard đã lazy-load ở baseline; không thêm manual chunk tùy tiện hoặc nâng warning limit. Các trang mới vẫn lazy-load. Shared query categories và catalog prefetch tái sử dụng key; header không tải toàn bộ catalog.

Giữ TTL, cancellation, sessionScope, cache generation và mutation retry=false hiện có. `test:query-navigation` đo hai vòng qua 7 route: 32 request ở vòng đầu, 0 ở vòng fresh-cache sau. Đây là hành vi đã có và được **VERIFIED**, không gán thành cải thiện mới.

Cloudinary thumbnail utility chỉ transform unsigned URLs; giữ signed/transformed URLs. Review media gallery đã đúng: inline preview, thumbnail canh trái, điều khiển/đóng/keyboard, không mở Cloudinary tab. **NOT REPRODUCED** lỗi gallery; không sửa component đó, chỉ chạy regression 6 checks.

## 11. Backend performance

Đã đo và sửa merge cart hydrate lặp. Việc kiểm tra tồn kho và cộng dồn vẫn từng món trong cùng transaction; không thay isolation/schema. Response projection chỉ thực hiện một lần sau các write.

Các tối ưu có sẵn tiếp tục được **VERIFIED** bằng SQL budget tests: product page/search 20 rows = 3 SQL, catalog hydration 20 = 4, cart 45 = 4, reviews 45 = 2, order history 45 = 15, returns 45 = 7 trong fixture H2. Đây là số query của bài test tổng hợp, không phải latency production và không phải toàn bộ được cải thiện trong audit này.

Giữ open-in-view=false, batch fetch 32, main Hikari pool max 4/minIdle 0, AI pool riêng max 3. Không tăng pool hay thêm index khi chưa có EXPLAIN PostgreSQL đại diện. Giữ `docs/performance-index-review.sql` là đề xuất; không chạy migration/index trên production.

## 12. AI chatbot và recommendations

Đã đọc RAG retrieval/hydration/generation path, optional AI config, capacity semaphore, rate limit, no-provider-retries, timeout và fallback. SQL hydration dùng `catalog.byIds(Collection)` thay vì gọi từng ID; dữ liệu đã được recheck trước response. Các test AI disabled/failure/fallback/hydration/budget/security chạy trong Maven suite.

Không gọi Gemini thật, không đo embedding/vector/generation của provider trong audit. `RagRequestTrace` đã có stage timing/query counter; không tạo số ms production giả. Không thay model, dimensions, table/index strategy hoặc reindex. Fix frontend giới hạn request đôi và conversation privacy được kiểm tra browser; request guard đã có được giữ, session reset được bổ sung.

## 13. Security

**VERIFIED:** role lấy từ DB, disabled account bị từ chối, AdminRoute fail closed, backend admin authorization, customer order/review/return ownership, optimistic concurrency/row lock, password-reset one-time/expiry/rate limit, image MIME/size validation và cleanup tests. CORS chỉ cho frontend origin cấu hình; stateless Bearer header không dùng auth cookie, nên CSRF configuration hiện tại không thay đổi.

Public UI không render HTML tùy ý từ descriptions/errors; notification allowlist che diagnostics. Upload tests không dùng Cloudinary thật. Không phát hiện literal credential mới trong diff; fixture secrets/passwords chỉ thuộc H2/test, không phải credential thật. Không in JWT hoặc secret cấu hình.

**NEEDS APPROVAL / High:** logout hiện chỉ bỏ token ở client; backend logout và password reset ghi rõ JWT đã cấp vẫn dùng được đến expiry. Disabled-account/role revocation đã có, nhưng chưa phải thu hồi từng session hoặc thu hồi sau đổi mật khẩu. Cần thiết kế token version/revoked-before hoặc session store, migration tương thích và rollout token cũ. Không âm thầm thay auth contract/database trong audit.

**NOT TESTED:** full Java dependency SCA/NVD scan; repository không cấu hình công cụ đó. Npm audit 0 chỉ nói về dependency graph npm tại thời điểm kiểm tra, không là chứng nhận không có mọi lỗ hổng.

## 14. Deployment và môi trường

Vite build kiểm tra HTTPS public backend origin, không có `/api` ở cuối, query/hash/credentials/localhost. Build thực chạy bằng origin ví dụ hợp lệ; không hardcode origin đó vào source. Vercel SPA rewrite giữ nested URL khi refresh. Docker dùng Java 21, runtime non-root, RAM limits; Spring dùng Flyway validate/private schema, clean-disabled và health không lộ details.

Không chạy Docker production image, không gọi Supabase/Render/Vercel production để thử. Cold start thật, cross-version deployment và actual hosting HTTP status vẫn **NOT TESTED**. Local API errors, request cancellation, explicit retry, missing product và chunk/render boundary được kiểm tra riêng.

## 15. Automated tests và browser results

Kết quả cuối được ghi cùng commands/log bên dưới. Browser mock tests không được gọi là kiểm thử backend thật; real HTTP E2E được tách rõ.

<!-- AUDIT_FINAL_RESULTS -->
| Check | Final result | Log under `.cache/` |
| --- | --- | --- |
| Lint | PASS, no errors | audit-final-lint.log |
| Production build | PASS; entry 328.38 kB / gzip 104.63 kB; no chunk size warning | audit-final-build.log |
| All frontend unit files | 52 PASS, 0 fail (sequential runner) | audit-final-units.log |
| Maven full suite | 345 total: 299 PASS, 46 SKIPPED, 0 failure/error | audit-final-backend.log |
| Opt-in real HTTP/browser E2E | 1 JUnit test PASS; 8 real browser flow groups PASS; loopback Spring Boot + H2 + Vite, no API mocks | audit-real-backend.log / audit-real-browser.log |
| npm dependency audit | 0 advisories; dependency graph 228 total / 15 prod | audit-npm-final.json |
| Dependency tree | npm ls --depth=0 PASS | audit-final-dependencies.log |
| Pagination warning | 0 PageImpl serialization warnings in full endpoint suite | audit-final-backend.log |
| Cart merge performance | 25 -> 19 SQL; full response hydration 3 -> 1; both regression tests PASS | audit-cart-merge-before.log / audit-cart-merge-after.log |
| Admin authorization | 13 browser groups PASS | audit-final-test-admin-route.log |
| Dashboard | 23 browser groups PASS | audit-final-test-dashboard.log |
| Admin products | 11 browser groups PASS | audit-final-test-admin-products.log |
| Admin orders | 9 browser groups PASS | audit-final-test-admin-orders.log |
| Admin returns | 14 browser groups PASS | audit-final-test-admin-returns.log |
| Admin reviews | 10 browser groups PASS | audit-final-test-admin-reviews.log |
| Admin promotions | 12 browser groups PASS | audit-final-test-admin-promotions.log |
| Admin users | 10 browser groups PASS | audit-final-test-admin-users.log |
| Excel import | 9 browser groups PASS | audit-final-test-excel-import.log |
| Homepage/catalog | 7 browser groups PASS | audit-final-test-homepage.log |
| Order review/create/edit/media | 7 browser groups PASS | audit-final-test-order-review.log |
| Inline review gallery | 6 browser groups PASS | audit-final-test-review-media.log |
| About/contact | 32 browser groups PASS | audit-final-test-about.log |
| Customer returns | 53 browser groups PASS | audit-final-test-returns.log |
| Notifications | 17 browser groups PASS | audit-final-test-notifications.log |
| Query navigation cache | 1 browser groups PASS | audit-final-test-query-navigation.log |
| Storefront query/session/cart | 6 browser groups PASS | audit-final-test-query-storefront.log |
| Password recovery | 5 browser groups PASS | audit-final-password-recovery.log |
| Audit routes/errors/responsive | 16 browser groups PASS, including explicit chunk reload recovery | audit-browser-new.log |

Mock browser suites: 261 scenario/check groups PASS. Real HTTP E2E: 8 flow groups PASS separately. These counts describe test groups, not individual assertions. The 46 default skips include 45 PostgreSQL/Redis opt-in cases and the separately executed real-browser test.

Screenshots: `.cache/fullstack-audit/storefront-404-mobile.png`, `.cache/fullstack-audit/dashboard-404.png`, plus existing suite artifact directories. Normal mock flows and real HTTP E2E assert no unexpected runtime/console errors; render/chunk failure cases deliberately inject and handle failures.
<!-- /AUDIT_FINAL_RESULTS -->

Các test mới: `PaginationContractIntegrationTest`, `CartMergePerformanceTest`, `FullstackBrowserIntegrationTest` (opt-in), `test-fullstack-audit.mjs`, `test-api-e2e.mjs`, và regression profile/password/review multipart. `test:returns` tự tạo Vite nếu không cung cấp TEST_BASE_URL.

Test cũ được sửa dựa trên contract thực tế: order-review trước đây chờ placeholder trả hàng, nay assert route/form thật rồi Back; About fixture trả đúng array categories và selector chấp nhận React Router resolved hash href; catalog test chờ DOM loading commit thay vì chỉ URL khi kiểm tra giấu kết quả cũ. Không bỏ assertion chức năng hoặc xóa test để làm pass.

## 16. So sánh trước/sau

| Thước đo | Baseline | Sau sửa | Giới hạn |
| --- | --- | --- | --- |
| npm dependency graph | 475 tổng / 268 prod | 228 tổng / 15 prod | Theo npm audit metadata, gồm graph và optional/platform packages |
| npm advisories | 33 | 0 | Snapshot registry tại ngày audit; không chứng minh exploitability |
| SQL merge giỏ 3 variant | 25 | 19 | Cùng fixture H2/seed/query counter |
| Hydrate full response trong merge đó | 3 | 1 | Repository spy xác nhận |
| Pagination warning | Reproduced | Không có ở endpoint suite sau sửa | Không che logging; Page nội bộ vẫn dùng Spring |
| Main entry JS | 325.82 kB / gzip 103.77 kB | Xem kết quả build cuối ở mục 15 | Tăng nhẹ cho guards/nav/UX; không tuyên bố giảm bundle |
| Production/cold-start latency | Không đo | Không đo | Không tạo số liệu giả |

## 17. Danh sách file thay đổi

<!-- AUDIT_CHANGED_FILES -->
- [README.md](../README.md)
- [backend/src/main/java/com/example/backend/controller/AdminOrderController.java](../backend/src/main/java/com/example/backend/controller/AdminOrderController.java)
- [backend/src/main/java/com/example/backend/controller/AdminProductController.java](../backend/src/main/java/com/example/backend/controller/AdminProductController.java)
- [backend/src/main/java/com/example/backend/controller/AdminReturnRequestController.java](../backend/src/main/java/com/example/backend/controller/AdminReturnRequestController.java)
- [backend/src/main/java/com/example/backend/controller/AdminReviewController.java](../backend/src/main/java/com/example/backend/controller/AdminReviewController.java)
- [backend/src/main/java/com/example/backend/controller/AdminUserController.java](../backend/src/main/java/com/example/backend/controller/AdminUserController.java)
- [backend/src/main/java/com/example/backend/controller/CatalogExceptionHandler.java](../backend/src/main/java/com/example/backend/controller/CatalogExceptionHandler.java)
- [backend/src/main/java/com/example/backend/controller/DashboardController.java](../backend/src/main/java/com/example/backend/controller/DashboardController.java)
- [backend/src/main/java/com/example/backend/controller/ProductController.java](../backend/src/main/java/com/example/backend/controller/ProductController.java)
- [backend/src/main/java/com/example/backend/dto/PageResponse.java](../backend/src/main/java/com/example/backend/dto/PageResponse.java)
- [backend/src/main/java/com/example/backend/services/CartService.java](../backend/src/main/java/com/example/backend/services/CartService.java)
- [backend/src/main/java/com/example/backend/services/impl/CartMergeServiceImpl.java](../backend/src/main/java/com/example/backend/services/impl/CartMergeServiceImpl.java)
- [backend/src/main/java/com/example/backend/services/impl/CartServiceImpl.java](../backend/src/main/java/com/example/backend/services/impl/CartServiceImpl.java)
- [backend/src/main/java/com/example/backend/services/impl/ProductServiceImpl.java](../backend/src/main/java/com/example/backend/services/impl/ProductServiceImpl.java)
- [backend/src/test/java/com/example/backend/deployment/CartMergePerformanceTest.java](../backend/src/test/java/com/example/backend/deployment/CartMergePerformanceTest.java)
- [backend/src/test/java/com/example/backend/deployment/FullstackBrowserIntegrationTest.java](../backend/src/test/java/com/example/backend/deployment/FullstackBrowserIntegrationTest.java)
- [backend/src/test/java/com/example/backend/deployment/PaginationContractIntegrationTest.java](../backend/src/test/java/com/example/backend/deployment/PaginationContractIntegrationTest.java)
- [docs/FULLSTACK_AUDIT_REPORT.md](../docs/FULLSTACK_AUDIT_REPORT.md)
- [frontend/package-lock.json](../frontend/package-lock.json)
- [frontend/package.json](../frontend/package.json)
- [frontend/scripts/browser-test.mjs](../frontend/scripts/browser-test.mjs)
- [frontend/scripts/test-about.mjs](../frontend/scripts/test-about.mjs)
- [frontend/scripts/test-api-e2e.mjs](../frontend/scripts/test-api-e2e.mjs)
- [frontend/scripts/test-fullstack-audit.mjs](../frontend/scripts/test-fullstack-audit.mjs)
- [frontend/scripts/test-homepage-catalog.mjs](../frontend/scripts/test-homepage-catalog.mjs)
- [frontend/scripts/test-order-review.mjs](../frontend/scripts/test-order-review.mjs)
- [frontend/scripts/test-returns.mjs](../frontend/scripts/test-returns.mjs)
- [frontend/src/App.tsx](../frontend/src/App.tsx)
- [frontend/src/components/RouteErrorBoundary.tsx](../frontend/src/components/RouteErrorBoundary.tsx)
- [frontend/src/components/aiChat/AiChatWidget.tsx](../frontend/src/components/aiChat/AiChatWidget.tsx)
- [frontend/src/components/footer/Footer.tsx](../frontend/src/components/footer/Footer.tsx)
- [frontend/src/components/header/Header.module.css](../frontend/src/components/header/Header.module.css)
- [frontend/src/components/header/Header.tsx](../frontend/src/components/header/Header.tsx)
- [frontend/src/components/notifications/AppNotifications.tsx](../frontend/src/components/notifications/AppNotifications.tsx)
- [frontend/src/components/notifications/Notifications.css](../frontend/src/components/notifications/Notifications.css)
- [frontend/src/components/review/ReviewForm.tsx](../frontend/src/components/review/ReviewForm.tsx)
- [frontend/src/components/review/ReviewModal.tsx](../frontend/src/components/review/ReviewModal.tsx)
- [frontend/src/index.css](../frontend/src/index.css)
- [frontend/src/layouts/DashboardLayout.jsx](../frontend/src/layouts/DashboardLayout.jsx)
- [frontend/src/pages/aboutUs/AboutUs.tsx](../frontend/src/pages/aboutUs/AboutUs.tsx)
- [frontend/src/pages/cart/CartPage.module.css](../frontend/src/pages/cart/CartPage.module.css)
- [frontend/src/pages/cart/CartPage.tsx](../frontend/src/pages/cart/CartPage.tsx)
- `frontend/src/pages/dashboard/DashboardPlaceholder.jsx` (deleted)
- [frontend/src/pages/login/Login.module.css](../frontend/src/pages/login/Login.module.css)
- [frontend/src/pages/login/Login.tsx](../frontend/src/pages/login/Login.tsx)
- [frontend/src/pages/myProfile/tabs/OrderHistoryTab.tsx](../frontend/src/pages/myProfile/tabs/OrderHistoryTab.tsx)
- [frontend/src/pages/myProfile/tabs/SecurityTab.tsx](../frontend/src/pages/myProfile/tabs/SecurityTab.tsx)
- [frontend/src/pages/notFound/NotFound.module.css](../frontend/src/pages/notFound/NotFound.module.css)
- [frontend/src/pages/notFound/NotFound.tsx](../frontend/src/pages/notFound/NotFound.tsx)
- [frontend/src/pages/policy/Policy.tsx](../frontend/src/pages/policy/Policy.tsx)
- [frontend/src/pages/productDetail/ProductDetail.tsx](../frontend/src/pages/productDetail/ProductDetail.tsx)
- [frontend/src/pages/returnRequest/ReturnRequest.tsx](../frontend/src/pages/returnRequest/ReturnRequest.tsx)
- [frontend/src/pages/searchPage/SearchPage.tsx](../frontend/src/pages/searchPage/SearchPage.tsx)
- [frontend/src/services/authService.ts](../frontend/src/services/authService.ts)
- [frontend/src/services/cartService.ts](../frontend/src/services/cartService.ts)
- [frontend/src/services/orderService.ts](../frontend/src/services/orderService.ts)
- [frontend/src/services/productTypeService.ts](../frontend/src/services/productTypeService.ts)
- [frontend/src/services/userService.ts](../frontend/src/services/userService.ts)
- [frontend/tests/profile.test.mjs](../frontend/tests/profile.test.mjs)
<!-- /AUDIT_CHANGED_FILES -->

Không có migration mới, thay đổi production data, commit hoặc deploy. Các ảnh/log kiểm tra nằm trong `.cache/` hoặc thư mục temp của browser harness, không đưa vào source.

## 18. Các vấn đề còn lại và trạng thái

| Nội dung | Trạng thái / lý do |
| --- | --- |
| JWT thu hồi theo session/sau password change | NEEDS APPROVAL — cần auth/schema/rollout design, mức High |
| Các test PostgreSQL/pgvector/Redis opt-in | NOT TESTED — không có test instances được cấu hình; không dùng DB production thay thế |
| Gemini/Cloudinary/email thật | NOT TESTED — provider integrations không được gọi trong audit; mock/failure tests có chạy |
| Policy mô tả GHN thu hồi tự động/miễn phí, badges nhiều cổng thanh toán | NEEDS APPROVAL — backend hiện chủ yếu điều phối thủ công/COD; không tự sửa điều khoản hoặc dựng payment/refund integration |
| Social links/marketing ngoài luồng auth | NEEDS APPROVAL — About còn link tới trang chủ Facebook/Instagram/TikTok/Shopee và các lời hứa marketing chưa có nguồn xác thực; cần địa chỉ tài khoản/chính sách chính thức để thay, không tự đoán URL. |
| Timezone LocalDateTime | NEEDS APPROVAL — frontend return helper giả định +07, backend có phần dùng system clock; cần chốt semantics và kiểm tra Render TZ/giá trị timestamp đã lưu trước khi migrate |
| Legacy list orders/returns, public all-variants | DEFERRED — giữ array contract; cần pagination/version plan nếu dữ liệu lớn |
| Guest-cart merge bị mất response sau khi backend commit | DEFERRED — storage khách vẫn giữ khi lỗi; retry additive merge có thể cộng lại. Cần idempotency/operation identity để xử lý chắc chắn trường hợp kết quả chưa rõ; chưa tự đổi API/schema. |
| Wishlist lưu local theo thiết bị | VERIFIED as existing behavior; account-specific server wishlist là DEFERRED, không tự đổi mô hình dữ liệu |
| File DashboardPlaceholder không còn route | FIXED — đã xóa file sau khi thay catch-all bằng 404 |
| Root-cause gallery mở tab/ảnh lệch | NOT REPRODUCED — 6 regression checks PASS, component được giữ |
| Java dependency vulnerability scan | NOT TESTED — không có cấu hình SCA trong repo; nên bổ sung CI staging riêng |
| Tuyên bố production-ready toàn bộ hệ thống | DEFERRED — cần xử lý High auth risk và staging/provider checks nêu trên |

## 19. Đề xuất cần phê duyệt và bước tiếp theo

1. Chọn cách thu hồi JWT và migration tương thích; xác định hành vi logout mọi thiết bị và password reset.
2. Xác nhận chính sách vận chuyển/thu hồi/hoàn tiền, các cổng thanh toán thực sự hỗ trợ; sau đó mới sửa nội dung pháp lý hoặc mở rộng tích hợp.
3. Chốt timezone cho timestamps và hoạch định chuyển dữ liệu nếu cần; không thay ngày hết hạn trả hàng/coupon tùy ý.
4. Cấp PostgreSQL/Redis staging/test riêng và tài khoản provider sandbox để chạy những test opt-in còn thiếu; đo EXPLAIN, cold/warm timing và region trước khi thêm index/pool/cache.

Trước rollout có chủ đích: kiểm tra nested routes/refresh trên Vercel staging, backend cold start, version skew trong deployment, token expiration/revocation và provider failure. Audit này không tự deploy.

## 20. Đề xuất commit messages

- `fix(api): stabilize pagination envelopes and catalog error responses`
- `fix(storefront): restore cart checkout and compatible navigation with 404 states`
- `fix(auth): preserve session error handling and isolate chat conversations`
- `fix(review): restore owner editing with retained and replacement media`
- `fix(ux): keep notices clear of navigation and improve keyboard controls`
- `perf(cart): hydrate merged cart response once per transaction`
- `chore(deps): remove unused tailwind server dependency and patch advisories`
- `test(audit): cover routing pagination sessions and real HTTP browser flows`
- `docs: record full-stack audit evidence and unresolved rollout decisions`

Không có commit nào được tạo tự động.
