# Trả hàng: upload minh chứng và tiền hàng hoàn dự kiến

Báo cáo triển khai 27/11/2026, branch `fix/return-evidence-and-refund`. Không commit, push, deploy, chạy migration production hoặc hoàn tiền thật.

## 1. Nguyên nhân thực tế

Sidebar cũ cộng `unitPrice × số lượng trả`, chưa trừ coupon. Backend chỉ lưu yêu cầu, số lượng và URL minh chứng; chưa có bộ tính, snapshot tiền hoàn hoặc ledger giao dịch hoàn tiền. Vì vậy món có giá mua 2.000.000đ nhưng thực trả 1.000.000đ vẫn hiện 2.000.000đ.

## 2. Giá mua và discount hiện có

`order_details` lưu `unit_price`, `quantity`, `sub_total`; `orders` lưu `discount_amount`, `shipping_fee`, `total_amount`, `is_paid`. Chưa có allocation theo item. Giá mua là giá bán đã chốt, không áp dụng lại giảm giá sản phẩm.

Checkout hiện chỉ có PERCENTAGE và FIXED_AMOUNT trên toàn bộ tiền hàng. Chưa có coupon theo sản phẩm/danh mục/biến thể hoặc coupon phí ship. Miễn phí ship tiêu chuẩn là quy tắc phí riêng. Các snapshot hiện có đủ cho mô hình này; không thêm cột allocation vào đơn một cách thừa. Khi mở rộng loại coupon phải bổ sung snapshot phù hợp trước.

## 3. Công thức và giới hạn

`RefundCalculator` dùng chung cho preview, tạo yêu cầu và đọc snapshot khách/admin. Không đọc giá Product/Variant hoặc tính lại Coupon hiện tại.

- Kiểm tra `unit price × quantity = line subtotal` và `sum(subtotal) − discount + shipping fee = order total`. Dữ liệu tiền không nguyên VND hoặc không nhất quán cần CSKH đối soát.
- Với subtotal S, discount D và subtotal dòng Si, phân bổ ban đầu `floor(D × Si / S)`. VND dư phân theo phần dư lớn nhất, tie-break bằng order detail ID. Tổng allocation đúng bằng D; tổng net đúng bằng S − D.
- Với net dòng N, số lượng mua Q, số lượng đang giữ R và tiền net đã giữ M: yêu cầu q sản phẩm nhận `floor((N − M) × q / (Q − R))`. Lần trả hết phần còn lại nhận toàn bộ phần dư.
- PENDING/APPROVED/COMPLETED giữ số lượng và tiền; REJECTED giải phóng cả hai. Khóa order, kiểm tra lại trước lưu để hai yêu cầu đồng thời không vượt giới hạn.
- Yêu cầu cũ chưa có snapshot tiền: không đoán tiền đã hoàn; lần trả tiếp cùng dòng cần đối soát. Không tính lại/ghi đè khoản hoàn lịch sử.

Tất cả tính tiền dùng BigDecimal. Backend bỏ qua số tiền do client tự gửi. Chưa xác nhận thanh toán được ghi rõ; phí hoàn ship, phí thu hồi và tổng hoàn cuối cùng là `null`. Đây là ước tính tiền hàng, không phải giao dịch hoàn tiền.

## 4. Regression đơn tương đương #ST-6

| Chọn trả | Giá mua | Discount phân bổ | Tiền hàng hoàn dự kiến |
| --- | ---: | ---: | ---: |
| A | 1.000.000đ | 500.000đ | 500.000đ |
| B | 2.000.000đ | 1.000.000đ | 1.000.000đ |
| A và B | 3.000.000đ | 1.500.000đ | 1.500.000đ |

40.000đ phí vận chuyển được tách riêng. Không hardcode ví dụ vào production.

## 5. Tái sử dụng upload

Backend dùng lại `ReviewImageStorage`, `ReviewImageValidator`, `ReviewImageCleanup`, Cloudinary configuration và credentials environment hiện có. Chỉ cho hai folder server quản lý: `stationery-store/reviews` và `stationery-store/returns`. Public ID là UUID do server tạo, không dùng tên file khách. Không có secret/unsigned preset trên frontend.

Frontend dùng chung `useImageAttachments` với ReviewForm. Gallery minh chứng TypeScript được dùng trong lịch sử khách và modal admin; gallery review hiện có không bị sửa.

## 6. Ảnh local, validation và cleanup

- API tạo mới bắt buộc 1–5 ảnh JPEG/PNG/WebP, không rỗng, mỗi ảnh ≤ 5 MB. MIME phải khớp format thực; backend giải mã ảnh, giới hạn 20 megapixel. Tổng multipart giữ 26 MB hiện có.
- File/Object URL dùng để preview, không upload khi render. Xóa, gửi thành công, đổi đơn/phiên hoặc unmount giải phóng URL. Reset input cho phép chọn lại file; đổi lý do/số lượng không mất ảnh.
- Kiểm tra owner/trạng thái/hạn 7 ngày/số lượng/tiền trước upload. Dùng RequestRateLimiter hiện có: 10 lần upload / 15 phút / tài khoản.
- Validate cả batch trước Cloudinary. Upload nằm giữa read-only preflight và transaction ghi ngắn; sau upload khóa order và kiểm tra lại.
- Upload lỗi cleanup cả IDs đã cấp, kể cả request timeout. Database rollback cleanup qua transaction callback. Commit UNKNOWN được log để đối soát DB trước khi xóa. Cleanup lỗi log public ID để retry vận hành.
- Ref lock chống double-submit; lỗi giữ form/ảnh. Mất response sau khi có thể commit cần kiểm tra lịch sử trước retry; chưa có idempotency key cho trường hợp này.

## 7. API trước và sau

| API | Trước | Sau |
| --- | --- | --- |
| `POST /api/returns` | JSON orderID, reason, evidenceUrls, items | Multipart: part `returnRequest` là Blob application/json gồm orderID/reason/items; 1–5 part `images` |
| `POST /api/returns/preview` | Chưa có | JSON orderID + items; trả unit price, gross/discount/net từng dòng và tổng, paymentConfirmed; phí chưa xác định null |
| Customer get/list và admin detail | Các field cũ | Giữ field cũ; thêm `pricing`, null cho lịch sử chưa có snapshot |

JSON create cũ trả 415; không bypass ảnh bằng URL thủ công. Evidence URL/video cũ vẫn đọc và xem trong trang, có fallback. Không upload video mới.

Shared API client giữ JWT, timeout 65 giây, abort và session isolation; FormData không tự đặt Content-Type. Preview debounce 180 ms, query key theo selection/session; hủy request cũ và ẩn giá cũ khi đổi lựa chọn. Tạo thành công chỉ invalidation nhóm orders/returns/returnPreview của phiên hiện tại, không xóa toàn bộ cache.

## 8. Database migration

Flyway mới `V6__return_evidence_and_estimates.sql`:

- Thêm `return_requests.evidence_public_ids` nullable.
- Thêm `return_request_items.gross_amount`, `discount_amount`, `net_amount` nullable; CHECK không âm và gross = discount + net.
- Không backfill/drop/ghi đè rows cũ; URL tiếp tục ở cột text cũ. Không sửa V1–V5.
- Test upgrade giữ nguyên URL video/trạng thái/order total cũ; public IDs cũ vẫn null. Cần Flyway migration khi triển khai code mới.

## 9. Danh sách file

42 files:

- [backend/src/main/java/com/example/backend/controller/ReturnRequestController.java](../../../../backend/src/main/java/com/example/backend/controller/ReturnRequestController.java)
- [backend/src/main/java/com/example/backend/controller/ReviewExceptionHandler.java](../../../../backend/src/main/java/com/example/backend/controller/ReviewExceptionHandler.java)
- [backend/src/main/java/com/example/backend/dto/returns/AdminReturnDetailResponse.java](../../../../backend/src/main/java/com/example/backend/dto/returns/AdminReturnDetailResponse.java)
- [backend/src/main/java/com/example/backend/dto/returns/CreateReturnRequest.java](../../../../backend/src/main/java/com/example/backend/dto/returns/CreateReturnRequest.java)
- [backend/src/main/java/com/example/backend/dto/returns/RefundPreview.java](../../../../backend/src/main/java/com/example/backend/dto/returns/RefundPreview.java)
- [backend/src/main/java/com/example/backend/dto/returns/RefundPreviewRequest.java](../../../../backend/src/main/java/com/example/backend/dto/returns/RefundPreviewRequest.java)
- [backend/src/main/java/com/example/backend/dto/returns/ReturnResponse.java](../../../../backend/src/main/java/com/example/backend/dto/returns/ReturnResponse.java)
- [backend/src/main/java/com/example/backend/model/ReturnRequest.java](../../../../backend/src/main/java/com/example/backend/model/ReturnRequest.java)
- [backend/src/main/java/com/example/backend/model/ReturnRequestItem.java](../../../../backend/src/main/java/com/example/backend/model/ReturnRequestItem.java)
- [backend/src/main/java/com/example/backend/repositories/AdminReturnRepository.java](../../../../backend/src/main/java/com/example/backend/repositories/AdminReturnRepository.java)
- [backend/src/main/java/com/example/backend/services/AdminReturnService.java](../../../../backend/src/main/java/com/example/backend/services/AdminReturnService.java)
- [backend/src/main/java/com/example/backend/services/RefundCalculator.java](../../../../backend/src/main/java/com/example/backend/services/RefundCalculator.java)
- [backend/src/main/java/com/example/backend/services/ReturnEvidenceService.java](../../../../backend/src/main/java/com/example/backend/services/ReturnEvidenceService.java)
- [backend/src/main/java/com/example/backend/services/ReturnRequestService.java](../../../../backend/src/main/java/com/example/backend/services/ReturnRequestService.java)
- [backend/src/main/java/com/example/backend/services/ReviewImageStorage.java](../../../../backend/src/main/java/com/example/backend/services/ReviewImageStorage.java)
- [backend/src/main/java/com/example/backend/services/ReviewImageValidator.java](../../../../backend/src/main/java/com/example/backend/services/ReviewImageValidator.java)
- [backend/src/main/java/com/example/backend/services/impl/ReturnRequestServiceImpl.java](../../../../backend/src/main/java/com/example/backend/services/impl/ReturnRequestServiceImpl.java)
- [backend/src/main/resources/db/migration/V6__return_evidence_and_estimates.sql](../../../../backend/src/main/resources/db/migration/V6__return_evidence_and_estimates.sql)
- [backend/src/test/java/com/example/backend/deployment/AdminReturnsApiTest.java](../../../../backend/src/test/java/com/example/backend/deployment/AdminReturnsApiTest.java)
- [backend/src/test/java/com/example/backend/deployment/FullstackBrowserIntegrationTest.java](../../../../backend/src/test/java/com/example/backend/deployment/FullstackBrowserIntegrationTest.java)
- [backend/src/test/java/com/example/backend/deployment/PostgresMigrationTest.java](../../../../backend/src/test/java/com/example/backend/deployment/PostgresMigrationTest.java)
- [backend/src/test/java/com/example/backend/deployment/ProductionReadinessTest.java](../../../../backend/src/test/java/com/example/backend/deployment/ProductionReadinessTest.java)
- [backend/src/test/java/com/example/backend/services/RefundCalculatorTest.java](../../../../backend/src/test/java/com/example/backend/services/RefundCalculatorTest.java)
- [backend/src/test/java/com/example/backend/services/ReturnEvidenceIntegrationTest.java](../../../../backend/src/test/java/com/example/backend/services/ReturnEvidenceIntegrationTest.java)
- [backend/src/test/java/com/example/backend/services/ReviewImageValidatorTest.java](../../../../backend/src/test/java/com/example/backend/services/ReviewImageValidatorTest.java)
- [frontend/scripts/fixtures/returns.mjs](../../../../frontend/scripts/fixtures/returns.mjs)
- [frontend/scripts/test-api-e2e.mjs](../../../../frontend/scripts/test-api-e2e.mjs)
- [frontend/scripts/test-returns.mjs](../../../../frontend/scripts/test-returns.mjs)
- [frontend/src/components/dashboard/ReturnDetailModal.jsx](../../../../frontend/src/components/dashboard/ReturnDetailModal.jsx)
- [frontend/src/components/dashboard/ReturnEvidenceGallery.jsx](../../../../frontend/src/components/dashboard/ReturnEvidenceGallery.jsx)
- [frontend/src/components/returns/EvidenceGallery.module.css](../../../../frontend/src/components/returns/EvidenceGallery.module.css)
- [frontend/src/components/returns/EvidenceGallery.tsx](../../../../frontend/src/components/returns/EvidenceGallery.tsx)
- [frontend/src/components/returns/RefundEstimate.tsx](../../../../frontend/src/components/returns/RefundEstimate.tsx)
- [frontend/src/components/returns/RefundSummary.tsx](../../../../frontend/src/components/returns/RefundSummary.tsx)
- [frontend/src/components/returns/ReturnEvidencePicker.tsx](../../../../frontend/src/components/returns/ReturnEvidencePicker.tsx)
- [frontend/src/components/review/ReviewForm.tsx](../../../../frontend/src/components/review/ReviewForm.tsx)
- [frontend/src/hooks/useImageAttachments.ts](../../../../frontend/src/hooks/useImageAttachments.ts)
- [frontend/src/pages/returnRequest/README.md](../../../../frontend/src/pages/returnRequest/README.md)
- [frontend/src/pages/returnRequest/ReturnRequest.module.css](../../../../frontend/src/pages/returnRequest/ReturnRequest.module.css)
- [frontend/src/pages/returnRequest/ReturnRequest.tsx](../../../../frontend/src/pages/returnRequest/ReturnRequest.tsx)
- [frontend/src/services/adminTypes.ts](../../../../frontend/src/services/adminTypes.ts)
- [frontend/src/services/returnService.ts](../../../../frontend/src/services/returnService.ts)

## 10. Frontend lint và build

`npm run lint` và `npm run build`: PASS. Build kiểm tra dùng origin HTTPS hợp lệ `https://api.example.test`; không deploy hoặc gọi origin đó.

## 11. Backend tests

Maven Wrapper offline: **370 tests, 324 pass, 46 skip, 0 failure/error**. Các test H2 kiểm tra allocation/partial/rejected returns, rounding, giá/coupon thay đổi, zero net, dữ liệu không tin cậy, upload lỗi, DB rollback, cleanup, quyền sở hữu, forged amount, multipart contract và concurrency. Test review validator bổ sung MIME không khớp.

46 test opt-in không được tính là pass; browser E2E chạy riêng. Ban đầu test incremental gặp class IDE biên dịch sai source level; `clean test` loại bỏ class cũ, không sửa mã nghiệp vụ không liên quan để che lỗi.

## 12. Browser và regression

Đã đạt: returns 53; admin returns 14; order/review create-edit 7; review media 6; admin reviews 10; storefront query 6; cart/checkout 11; admin orders 9; admin promotions 12. Tổng **128 nhóm browser mock**, gồm desktop/mobile, ảnh inline, Escape/focus, rollback lỗi và form giữ draft. Frontend unit suite: **52 pass**.

E2E HTTP/browser: **9 nhóm PASS** với Spring Boot/H2 và Vite thật; chỉ mock Cloudinary storage. Tạo multipart thật, kiểm tra snapshot qua HTTP, mở Dashboard và xem ảnh inline. Không có runtime exception, console error hoặc failed network request trong E2E. Logs `.cache/return-*.log`, `.cache/audit-real-browser.log`; screenshots `.cache/returns-*.png`; chỉ dùng dữ liệu tổng hợp.

## 13. Chưa kiểm thử / giới hạn

Không upload Cloudinary thật hoặc gọi thanh toán/email/AI production. PostgreSQL/Supabase, Redis và private assets chưa được kiểm chứng thực; H2 PostgreSQL mode không thay thế staging PostgreSQL.

Coupon theo sản phẩm/danh mục/biến thể và coupon ship chưa tồn tại nên không dựng test giả như đã hỗ trợ. Dữ liệu tiền thiếu/mâu thuẫn, tiền lẻ không nguyên VND và lịch sử yêu cầu chưa có snapshot cần xử lý thủ công.

Chấp thuận vẫn chỉ duyệt trả hàng. Không có API nhập tiền hoàn/điều chỉnh phí hay ledger giao dịch; không tuyên bố kiểm soát được chi tiền thủ công ngoài hệ thống.

## 14. Quyết định cần xác nhận

- Cloudinary hiện là public assets. Owner/admin authorization bảo vệ API trả URL, không làm URL công khai thành ảnh riêng tư. Minh chứng có thể chứa địa chỉ/nhãn vận chuyển: cần quyết định retention, private/authenticated assets và signed delivery trước khi đổi kiến trúc.
- Cần quy trình đối soát yêu cầu cũ, hoàn phí ship/thu hồi và hoàn tiền thực tế. Không tự điền tiền hoàn lịch sử.
- Triển khai backend/Flyway và frontend đồng bộ; client cũ gửi JSON không còn tạo mới được. Task này không tự deploy.

## 15. Commit gợi ý

- `fix(returns): allocate merchandise discounts and persist refund estimates`
- `feat(returns): upload validated evidence through shared Cloudinary storage`
- `refactor(media): share local drafts and inline evidence viewer`
- `test(returns): cover pricing uploads rollback concurrency and browser flows`

Không có commit nào được tạo tự động.
