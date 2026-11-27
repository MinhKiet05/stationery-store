# Sự cố gửi yêu cầu trả hàng — 27/11/2026

## Nguyên nhân và giới hạn kết luận

Log production cung cấp bởi người dùng nối được chuỗi sự kiện UTC:

- 14:06:18: backend sẵn sàng sau 200,701 giây khởi động.
- 14:06:44: hai cảnh báo Broken pipe: bên nhận đã đóng kết nối khi ghi JSON; không chứng minh lỗi upload hay rollback.
- 14:06:58–14:07:05: scheduled AI khởi tạo pool thứ hai và PGVectorStore, embedding model `gemini-embedding-001`, 3072 chiều.
- Tiếp theo: `OutOfMemoryError: Metaspace`, JVM thoát theo `ExitOnOutOfMemoryError` và Render restart.
- 14:07:52: trình duyệt nhận POST `/api/returns` trả 502 rỗng.
- 14:08:30: tiến trình backend mới bắt đầu khởi động.

Đây là bằng chứng mạnh cho lỗi gateway do backend bị dừng, với giới hạn Metaspace 128 MiB. Metaspace chứa metadata lớp Java, riêng với heap chứa dữ liệu ảnh. Khởi tạo AI nền nạp thêm lớp trùng thời điểm sự cố; chưa đủ dữ liệu để quy lỗi cho một lớp cụ thể, kết luận memory leak hay nói request upload trực tiếp gây OOM. Không có log request/transaction cũ để xác định POST đó đã commit hay chưa.

Tham khảo chính thức: [Oracle: Metaspace OOM](https://docs.oracle.com/en/java/javase/21/troubleshoot/troubleshooting-memory-leaks.html), [Java 21 JVM options](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html), [Render environment variables](https://render.com/docs/configure-environment-variables).

## Thay đổi

| Trước | Sau |
| --- | --- |
| Heap tối đa 45%, Metaspace 128 MiB | Heap tối đa 30%, Metaspace 192 MiB; code cache 32 MiB, stack 512 KiB, SerialGC và ExitOnOOM giữ nguyên |
| HTTP 502/503 có thể gợi ý thử gửi lại | 5xx/408, timeout, mất mạng hoặc lỗi đọc phản hồi được coi là chưa rõ kết quả; khóa POST trong form hiện tại |
| Lỗi submit chỉ có inline alert | Toast chung; cảnh báo cho kết quả chưa rõ; validation inline vẫn giữ; 401 đã được API báo không báo lần hai |
| Không có log thời gian theo bước | Mã UUID do server sinh, thời gian validation/upload từng ảnh/database tới commit/DTO sẵn sàng/hoàn tất servlet chain |
| Không đối chiếu lần gửi mất phản hồi | GET lịch sử đối chiếu order, nguyên văn reason, tập item/quantity và loại ID đã biết trước lần gửi; chỉ xác nhận khi có đúng một bản ghi khớp mới |

Không tìm thấy bản ghi trong một lần GET không chứng minh POST chưa commit: giữ khóa và bản nháp, cho kiểm tra lại/liên hệ CSKH. Không tự retry POST. Khi tìm được bản ghi, hiển thị xác nhận và mới xóa ảnh/bản nháp. Kiểm tra lịch sử không tạo đơn hay thực hiện hoàn tiền.

Idempotency hiện tại bảo vệ trong vòng đời form; tải lại trang, mở tab khác hoặc chủ động đổi đơn có thể bỏ khóa. Khóa hàng ở server kiểm soát tổng số lượng, không phải idempotency cho một ý định gửi. Muốn đảm bảo xuyên phiên cần thiết kế khóa idempotency bền vững, unique constraint, hash payload và trả lại kết quả cũ; cần đề xuất/duyệt migration mới trước. Task này không tạo V7 và không sửa V1–V6.

## Luồng đã kiểm tra

Frontend gửi FormData với `returnRequest` JSON Blob và `images`, không tự đặt Content-Type multipart. API client có giới hạn 65 giây, không tăng timeout. Backend xác thực quyền sở hữu/điều kiện/ước tính và kiểm tra cả lô ảnh trước upload. Cloudinary dùng thư mục/ID server sinh, giới hạn JPEG/PNG/WebP, timeout SDK 15 giây. Upload nằm ngoài transaction ghi. Transaction cuối khóa đơn, tính lại số lượng/tiền, lưu snapshot; cleanup được đăng ký trước khi ghi, xóa ảnh khi rollback. DTO được tạo trong transaction, không trả entity/lazy graph ra JSON. Review dùng chung validator/storage/cleanup nhưng service review hiện có transaction bao quanh upload; không đổi luồng review trong bản sửa này.

Lỗi Cloudinary có phản hồi JSON chính xác `Không thể tải ảnh. Vui lòng thử lại.` hoặc chưa cấu hình dịch vụ ảnh là lỗi trước transaction ghi: cho phép thử lại, giữ bản nháp. Gateway rỗng và các 5xx khác không được xem là bằng chứng rollback. Không đổi công thức phân bổ coupon; ví dụ #ST-6: 2.000.000 − 1.000.000 = 1.000.000 đồng tiền hàng hoàn dự kiến.

Log chỉ chứa UUID, tên phase, số ảnh/byte, index ảnh, thời gian, HTTP status và tên loại exception. Không log JWT, username, lý do, tên file, địa chỉ, credentials hay nội dung ảnh. Header `X-Return-Request-ID` phục vụ đối chiếu trên Network; không tin ID từ client. `response_ready` là DTO sau commit, `http_response chain_completed=true` là servlet chain hoàn tất, cả hai không đảm bảo trình duyệt đã nhận phản hồi. Filter xóa MDC kể cả Broken pipe.

## Đo bộ nhớ và thời gian

Probe `backend/scripts/ReturnMemoryProbe.java` chạy Java 21, Spring Boot thật, H2 local, bỏ devtools khỏi classpath, AI indexing tắt. Probe chỉ dựng chat SDK với key giả và nạp lớp PGVector/driver; không gọi embedding/chat/vector DB/Cloudinary. Ảnh PNG hợp lệ 2×2 được thêm byte đệm tới 5 MiB − 1; đây là kiểm tra kích thước nén, không phải stress ảnh 20 megapixel.

| Chỉ số | Cũ: Xmx230m/Metaspace128m | Mới: Xmx154m/Metaspace192m |
| --- | ---: | ---: |
| Heap tối đa JVM báo, MiB (SerialGC) | 222,4 | 148,9 |
| Metaspace sau boot, MiB | 105,4 | 105,2 |
| Metaspace sau dựng AI SDK, MiB | 110,3 | 110,1 |
| Metaspace sau validator ảnh, MiB | 111,7 | 111,5 |
| Heap dùng sau lô 5 ảnh, MiB | 93,8 | 109,6 |
| Validation 1 ảnh gần 5 MiB | 18 ms | 8 ms |
| Validation 5 ảnh gần 5 MiB | 38 ms | 19 ms |

Hai lần đo đơn lẻ chịu ảnh hưởng GC/JIT và tải máy; không dùng chênh lệch này để khẳng định tăng tốc. Cả cấu hình cũ và mới đều chạy qua probe local; không tái hiện đủ điều kiện OOM production. Thời gian upload, commit Postgres và gửi response production chưa đo được; không thay bằng thời gian mock. Log mới cho phép đo chính xác các phase ở lần triển khai tiếp theo.

Lệnh tái hiện PowerShell từ root (sau khi compile backend):

```powershell
Push-Location backend
.\mvnw.cmd -o dependency:build-classpath '-Dmdep.outputFile=../.cache/return-probe-classpath.txt' '-Dmdep.includeScope=test'
Pop-Location
$probeDependencies = (Get-Content .cache/return-probe-classpath.txt -Raw).Trim().Split(';') | Where-Object { $_ -notmatch 'spring-boot-devtools' }
$probeClasspath = 'backend/target/classes;' + ($probeDependencies -join ';')
& 'C:\Program Files\Java\jdk-21\bin\javac.exe' -proc:none -cp $probeClasspath -d .cache backend/scripts/ReturnMemoryProbe.java
& 'C:\Program Files\Java\jdk-21\bin\java.exe' -Xms51m -Xmx154m -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=32m -Xss512k -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError -cp ('.cache;' + $probeClasspath) ReturnMemoryProbe
```

Đây không phải phép đo RSS/cgroup 512 MiB. Docker daemon trên máy không chạy nên chưa kiểm chứng image runtime và tải đồng thời trong container. Heap thấp hơn tăng rủi ro khi nhiều lô ảnh lớn/ảnh nhiều megapixel chạy cùng AI; phải đo RSS, heap và Metaspace sau warm-up, upload và indexing thực tế. Nếu tiếp tục thiếu tổng RAM, cần tăng tài nguyên hoặc thiết kế giới hạn đồng thời; không chỉ tiếp tục nâng mọi giới hạn JVM.

## Render và triển khai

Nếu Render có override `JAVA_TOOL_OPTIONS`, rebuild Dockerfile không thay giá trị đó. Thay override bằng:

```text
-XX:InitialRAMPercentage=10 -XX:MaxRAMPercentage=30 -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=32m -Xss512k -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError
```

Hoặc bỏ override để dùng default Dockerfile sau triển khai. Kiểm tra dòng `Picked up JAVA_TOOL_OPTIONS` không còn `MaxMetaspaceSize=128m`/heap45%. Không đổi model/chiều vector, không tắt chức năng AI, không thay Cloudinary secrets hay cấu hình database. Không cần migration. Chưa commit, push, deploy, cập nhật environment Render hoặc ghi dữ liệu production.

## File thay đổi

- `backend/Dockerfile`: ngân sách JVM.
- `backend/src/main/java/com/example/backend/services/ReturnEvidenceService.java`: log từng phase.
- `backend/src/main/java/com/example/backend/security/ReturnSubmissionTraceFilter.java`: đối chiếu HTTP/MDC.
- `backend/src/test/java/com/example/backend/services/ReturnEvidenceIntegrationTest.java`: 5 ảnh gần 5 MiB và giữ đúng snapshot tiền.
- `backend/src/test/java/com/example/backend/security/ReturnSubmissionTraceFilterTest.java`: ID server, Broken pipe, cleanup context, bỏ qua GET.
- `backend/scripts/ReturnMemoryProbe.java`: probe local không gọi dịch vụ ngoài.
- `frontend/src/services/returnService.ts`: phân loại kết quả chưa rõ so với upload thất bại xác định.
- `frontend/src/pages/returnRequest/ReturnRequest.tsx`: toast, khóa POST, giữ bản nháp và đối chiếu lịch sử.
- `frontend/scripts/fixtures/returns.mjs`, `frontend/scripts/test-returns.mjs`: mô phỏng lỗi và lost response; đóng toast qua control thật trước thao tác phía dưới.
- `frontend/scripts/test-notifications.mjs`: cập nhật fixture checkout thiếu options/preview và luồng `/checkout` theo contract hiện hành; kiểm tra toast trong native dialog riêng; xác nhận đúng một cảnh báo khi đơn chưa có thời gian giao hàng.
- Tài liệu sự cố này và liên kết trong README trang trả hàng.

## Kiểm thử

| Kiểm tra | Kết quả |
| --- | --- |
| Backend `mvnw.cmd -o test` | 373 ca, 327 pass, 46 skip theo điều kiện môi trường, 0 failure/error |
| Backend focused sau khi bổ sung ca 5 ảnh gần giới hạn | 10/10 pass: 7 evidence integration và 3 trace filter |
| Frontend lint và build | Pass; build đặt `VITE_API_BASE_URL` thành HTTPS backend origin, không gọi backend khi build |
| Return request browser | 58/58 pass: 502 rỗng, 503, timeout, mất mạng, commit rồi mất response, chỉ một POST, giữ bản nháp, đối chiếu GET, validation/ảnh, coupon và 6 kích thước viewport |
| Notification browser | 18/18 pass: StrictMode, không trùng toast, 401 đồng thời, nội dung lỗi an toàn, chuyển trang, native dialog và mobile |
| Review media browser | 6/6 pass: gallery, modal, keyboard, tỉ lệ ảnh, mobile và không tạo API request ngoài ý muốn |
| Admin returns browser | 14/14 pass: ảnh minh chứng, duyệt/trạng thái/quyền, responsive và các luồng kho hiện có |
| Java 21 memory probe | Cả ngân sách cũ/mới chạy qua boot, dựng SDK và validate 1/5 ảnh gần 5 MiB; không khẳng định đã tái hiện OOM production |
| Git diff whitespace và migration | `git diff --check` pass; không thay đổi file migration |

Suite backend đầy đủ chạy trước khi thêm ca 5 ảnh gần giới hạn; suite focused sau đó đã compile lại và chạy ca mới cùng regression liên quan. 46 ca skip không được tính là pass; có các kiểm tra cần PostgreSQL/container/browser opt-in. Browser suites dùng API giả lập; backend evidence integration dùng transaction H2 thật và mock storage ngoài. Vì vậy các kết quả này không thay thế phép đo Cloudinary/Postgres/Render thực tế.

Log chạy local nằm trong `.cache/return-*.log` (không đưa vào Git). Cloudinary thật, Postgres production, RSS Render, thời gian upload/commit thật và hành vi sau deploy vẫn cần xác minh qua môi trường được phép; không tạo yêu cầu thử trên production trong task này.

Commit gợi ý: `fix(returns): budget JVM metaspace and reconcile uncertain submissions`
