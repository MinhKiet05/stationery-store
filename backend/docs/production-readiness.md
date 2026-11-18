# Production migration — báo cáo và hướng dẫn triển khai

Repository `MinhKiet05/stationery-store`, branch triển khai `main`.
Code đã chuẩn bị để review; không commit, push, deploy hoặc chuyển dữ liệu production.
Hướng dẫn Gemini cũ mô tả giai đoạn còn SQL Server; tài liệu này thay thế phần database/deployment đó.

## A. Những file thay đổi

| File | Mục đích |
| --- | --- |
| `.gitignore` | Bảo vệ file env, export dữ liệu, cache Python; cho phép commit template an toàn |
| `backend/pom.xml` | Bỏ JDBC SQL Server; giữ PostgreSQL/Gemini; thêm Flyway PostgreSQL và Actuator |
| `backend/src/main/resources/application.properties` | Datasource PostgreSQL, Flyway, private schema, pool nhỏ, port Render, health, frontend URL |
| `backend/src/main/resources/application-ai.properties` | Logging production mặc định INFO; debug là opt-in |
| `backend/src/main/resources/db/migration/V1__business_schema.sql` | Schema 18 bảng, identity, FK, unique constraints, indexes |
| `backend/src/main/java/com/example/backend/model/Product.java` | `description`: NVARCHAR(MAX) → text |
| `backend/src/main/java/com/example/backend/model/Review.java` | `comment`: NVARCHAR(MAX) → text |
| `backend/src/main/java/com/example/backend/model/ReturnRequest.java` | `evidence_images`: NVARCHAR(MAX) → text |
| `backend/src/main/java/com/example/backend/security/SecurityConfig.java` | CORS từ FRONTEND_URL; health GET public; giữ Bearer JWT và quyền API |
| `backend/src/main/java/com/example/backend/ai/AiProperties.java` | Bỏ địa chỉ vector localhost mặc định trong class |
| `backend/src/main/java/com/example/backend/ai/GeminiCatalogAi.java` | Session SQL search_path/timeout phù hợp Supabase, extension trong extensions |
| `backend/Dockerfile` | Multi-stage Java 21, JRE, non-root, giới hạn bộ nhớ |
| `backend/.dockerignore` | Loại env/secrets, build outputs, script/export khỏi context |
| `backend/.env.example` | Template Render/Supabase an toàn, không có secret thật |
| `backend/scripts/migrate_data.py` | Export read-only, verify manifest và import có transaction/rollback |
| `backend/scripts/requirements-migration.txt` | Dependencies riêng cho máy chuyển dữ liệu |
| `backend/scripts/test_migrate_data.py` | Test checksum, số lượng, precision và thứ tự FK |
| `backend/scripts/test_import_postgres.py` | Test import thật trên PostgreSQL tạm, rollback và chống ghi đè |
| `backend/scripts/supabase-preflight.sql` | Kiểm tra extension, quyền, vector type/index, không ghi dữ liệu |
| `backend/src/test/resources/application-test.properties` | Cách ly fixture H2 khỏi Flyway production |
| `backend/src/test/java/com/example/backend/ai/GeminiDisabledTest.java` | PostgreSQL mode/test profile cho AI-disabled startup |
| `backend/src/test/java/com/example/backend/ai/RecentRecommendationsTest.java` | PostgreSQL mode/test profile cho tracking/recommendation |
| `backend/src/test/java/com/example/backend/services/OrderHistoryIntegrationTest.java` | PostgreSQL mode/test profile cho order history |
| `backend/src/test/java/com/example/backend/deployment/ProductionReadinessTest.java` | Flyway + Hibernate validate, health/CORS/security, truy vấn và HTTP nghiệp vụ |
| `backend/src/test/java/com/example/backend/deployment/PostgreSqlReadinessTest.java` | Chạy cùng contract trên PostgreSQL thật khi opt-in |
| `backend/src/test/java/com/example/backend/deployment/PostgresMigrationTest.java` | Không chạm bảng vector cũ, FK, không lặp migration, cấm clean |
| `backend/src/test/java/com/example/backend/ai/PgVectorPostgresTest.java` | pgvector thật, vector(3072), exact search, extensions schema, metadata/delete |
| `frontend/src/services/api.ts` | Trim/chuẩn hóa API base URL dùng chung |
| `frontend/src/components/header/Header.tsx` | Lấy user bằng API_BASE thay localhost |
| `frontend/src/pages/forgotPassword/ForgotPassword.tsx` | Reset/forgot requests dùng backend origin |
| `frontend/src/pages/myProfile/tabs/SecurityTab.tsx` | Đổi mật khẩu dùng backend origin |
| `frontend/vite.config.ts` | Kiểm tra API origin khi build; dev proxy theo port mới |
| `frontend/.env.example` | Biến public VITE_API_BASE_URL |
| `frontend/vercel.json` | SPA routing khi mở trực tiếp link reset-password/profile/product |
| `backend/docs/gemini-migration.md` | Đánh dấu tài liệu database/deployment cũ đã được thay thế |
| `backend/docs/data-migration.md` | Quy trình chuyển dữ liệu, kiểm tra và rollback |
| `backend/docs/production-readiness.md` | Báo cáo này |

File `.env.example` ở root đã được người dùng xóa trước task; giữ nguyên việc xóa,
không khôi phục các giá trị bí mật. Template hiện tại nằm trong `backend/` và `frontend/`.

## B. Database migration

Runtime chính: Java 21, Spring Boot 4.1.1, Spring AI 2.0.2; PostgreSQL driver do Boot quản lý.
Flyway 12.4.0 là cơ chế migration schema duy nhất mới được thêm vì repository chưa có Flyway/Liquibase.
Hibernate chỉ `validate`, không `create`, `create-drop`, `update` trên production.

Flyway quản lý **schema `store`**, với `baseline-on-migrate=false`, `clean-disabled=true`.
Schema này tách biệt các bảng vector cũ ở `public` và không nằm trong schema public mặc định
của Supabase Data API. Không cấp quyền anonymous vào bảng user/order/password-reset.
Nếu `store` đã có bảng nhưng chưa có Flyway history, startup sẽ dừng để review; không tự baseline.

Các bảng: users, vendors, product_types, tags, coupons, products, product_variants,
product_images, product_tags, carts, cart_items, orders, order_details, reviews,
password_reset_tokens, return_requests, return_request_items, user_tracking_events.
Giữ tên cột, ID, quan hệ, trường soft-delete, enum string, giá numeric và optimistic version.
`IDENTITY` chuyển sang `bigint GENERATED BY DEFAULT AS IDENTITY`; BIT → boolean;
DATETIME tương ứng timestamp(6) không timezone, giữ LocalDateTime; nội dung Unicode dùng text/UTF-8.

Không tìm thấy stored procedure hoặc native TOP/GETDATE/ISNULL trong source repository.
Native DELETE ở TagRepository là SQL chuẩn, giữ nguyên; search_path đưa nó vào `store`.
YEAR/MONTH/DAY là JPQL qua Hibernate, đã kiểm thử trên PostgreSQL thật, không phải T-SQL.
Giữ transaction, lock tồn kho/giỏ hàng/đơn, JWT và API DTO.

Datasource chính và vector vẫn có hai pool riêng (4 và 3 connections tối đa), dùng cùng
project Supabase. Với session pooler, connection-init SQL đặt search_path và timeout;
không truyền startup `options` riêng cho Supavisor. JPA dùng `store`, vector dùng `public,extensions`.

**Dữ liệu thật chưa migrate.** Xem [quy trình dữ liệu](data-migration.md) trước cutover.
SQL Server gốc không bị ghi/xóa. Lưu ý kiểm tra collation nguồn: PostgreSQL mặc định phân biệt
hoa/thường, trong khi SQL Server có thể dùng collation CI. Các lookup không có IgnoreCase
giữ nguyên code hiện tại; cần đối chiếu username/handle/SKU và hành vi mong muốn trên staging.

## C. Environment variables

Copy giá trị từ `backend/.env.example` vào Render Environment, thay placeholder bằng secret riêng.
Không paste dấu escape `\=` vào JWT; giá trị phải là Base64 thuần, decode ít nhất 32 byte.
Spring Boot không tự đọc `.env`; IntelliJ phải nhận các biến trong Environment variables.

| Nhóm | Biến và giá trị |
| --- | --- |
| Server | `SPRING_PROFILES_ACTIVE=ai`, `PORT=10000` (Render có thể cấp PORT) |
| Main DB | `DATABASE_URL=jdbc:postgresql://aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require` |
| Main DB user | `DB_USERNAME=postgres.lyuggqgiocydqljblxch`, `DB_PASSWORD=<SUPABASE_DATABASE_PASSWORD>` |
| Vector | `PGVECTOR_URL` cùng JDBC endpoint, `PGVECTOR_USERNAME` cùng user, `PGVECTOR_PASSWORD=<SUPABASE_DATABASE_PASSWORD>` |
| Vector table | `PGVECTOR_TABLE=stationery_vectors_gemini` |
| AI | `AI_ENABLED=true`, `GEMINI_API_KEY=<PRIVATE_GEMINI_KEY>` |
| Models | `GEMINI_CHAT_MODEL=gemini-2.5-flash-lite`, `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`, `GEMINI_EMBEDDING_DIMENSIONS=3072` |
| JWT | `JWT_SECRET_BASE64=<PRIVATE_BASE64_SECRET>` |
| SMTP | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USERNAME=<GMAIL_ADDRESS>`, `SMTP_PASSWORD=<GMAIL_APP_PASSWORD>`, `SMTP_FROM=<GMAIL_ADDRESS>` |
| Frontend | `FRONTEND_URL=https://stationery-store-nu.vercel.app` |
| Reset link | `FRONTEND_RESET_PASSWORD_URL=https://stationery-store-nu.vercel.app/reset-password` |
| Weights | `AI_VIEW_WEIGHT=1`, `AI_CART_WEIGHT=3`, `AI_PURCHASE_WEIGHT=5` |
| History | `AI_HALF_LIFE_DAYS=30`, `AI_HISTORY_DAYS=180`, `TRACKING_VIEW_COOLDOWN_SECONDS=300` |
| Limits | `AI_CHAT_REQUESTS_PER_MINUTE=10`, `AI_INDEX_DELAY_MS=60000`, `AI_TIMEOUT=30s`, `AI_VECTOR_TIMEOUT=5s` |

Không còn dùng `SQLSERVER_URL`, `SQLSERVER_USERNAME`, `SQLSERVER_PASSWORD`, OLLAMA_* cho runtime mới.
DATABASE_URL bắt buộc có tiền tố **jdbc:postgresql://**, không dùng Supabase REST URL hay anon key.
DB/JWT/SMTP credentials là bắt buộc cho cấu hình nghiệp vụ; Gemini key chỉ cần khi bật AI.
PGVECTOR_URL/USERNAME/PASSWORD có thể bỏ qua nếu cùng endpoint/user/password main DB:
code fallback sang DATABASE_URL/DB_USERNAME/DB_PASSWORD. Table/model/weights/limits có default như bảng.
FRONTEND_URL/reset link có default production ở trên; nên vẫn khai báo rõ trên Render.
`AI_LOG_LEVEL=DEBUG` chỉ dùng khi điều tra; bình thường INFO để không ghi nội dung chat.

Vercel chỉ cần **`VITE_API_BASE_URL=https://<YOUR_RENDER_SERVICE>.onrender.com`**.
Đây là origin, không thêm `/api`. Đặt trước khi build và redeploy sau khi thay giá trị.
Không có password/API key/JWT secret trong VITE_*. Các luồng login, products, cart, orders,
chat dùng API_BASE; reset/password/profile header đã được sửa cùng origin. Dev proxy chỉ áp dụng khi
chạy Vite dev server, không được dùng để thay cho VITE_API_BASE_URL trên Vercel.

## D. Render deployment

| Setting | Giá trị |
| --- | --- |
| Service | Docker Web Service, repository trên, branch `main` sau khi user review/commit |
| Root Directory | để trống |
| Dockerfile Path | `backend/Dockerfile` |
| Docker Build Context Directory | `backend` |
| Health Check Path | `/actuator/health` |
| Port | `server.port=${PORT:10000}` |
| Runtime | Java 21 JRE, non-root `app` |
| Memory | thiết kế cho 512 MB; heap tối đa 45%, metaspace 128 MB, code cache 32 MB, SerialGC |

Dockerfile COPY paths tính từ `backend/`; không có đường dẫn `backend/backend`.
Image không copy env và chỉ chứa JAR runtime. Health GET public, chỉ lộ trạng thái/nhóm health,
không lộ DB URL/user/password; endpoint env/config/metrics không được expose.
Mail health bị tắt để lỗi dịch vụ mail không làm health của cửa hàng down.

**Giới hạn cần xử lý trước production:** Render Free chặn outbound TCP 25/465/587,
nên Gmail SMTP 587 không hoạt động trên Free dù TLS/config đúng. Muốn giữ Gmail SMTP,
chọn gói Render cho phép outbound SMTP. Đổi sang nhà cung cấp email qua HTTPS là công việc
riêng cần được chọn và triển khai; không tự đổi luồng gửi mail trong task này.
[Nguồn Render](https://render.com/docs/free).

## E. Verification

Kết quả xác minh ngày 18/11/2026, dùng JDK 21 và database/container tạm riêng:

| Kiểm tra | Kết quả |
| --- | --- |
| Backend `clean test` | **PASS: 72 tests, 0 failures, 0 errors, 0 skipped**; gồm PostgreSQL thật và pgvector thật |
| Backend compile/package | **PASS**; JAR có Flyway, PostgreSQL, Gemini, Actuator và migration V1; không có driver SQL Server/Ollama |
| Schema và nghiệp vụ | Flyway V1 + Hibernate validate; health, CORS, security, đăng ký/đăng nhập, catalog, cart/checkout, tracking và JPQL thống kê pass |
| pgvector | vector(3072), exact search, extensions schema, metadata/delete, kiểm tra model mismatch và SQL khởi tạo pool production pass |
| Python migration | **PASS: 3 unit tests + 1 integration test PostgreSQL**; dry-run rollback, lỗi FK rollback, giữ ID/sequence và từ chối target có dữ liệu |
| Frontend | **PASS** TypeScript/Vite production build với HTTPS backend origin mẫu; **5/5** catalog tests pass; cấu hình SPA rewrite có trong vercel.json |
| Docker | **PASS** build từ context backend; Java 21 chạy non-root với giới hạn 512 MiB/1 CPU, PostgreSQL thật, AI tắt |
| Runtime health | HTTP 200, status UP, không lộ thông tin datasource; container dùng khoảng 316 MiB khi idle, khởi động khoảng 36 giây trong lần smoke test |
| Context và diff | Image không có file .env; template không có Gemini key thật; `git diff --check` pass |

Giới hạn của kết quả: Docker smoke test tắt AI và dùng mail/JWT thử nghiệm; mức RAM idle
không thay thế load test khi bật Gemini hoặc có nhiều request. Không gọi Gemini/Gmail thật,
không kết nối Supabase production, không export SQL Server thật, không import dữ liệu người dùng,
không deploy Render/Vercel. Các test migration dùng dữ liệu fixture riêng; không chứng minh dữ liệu
production đã được chuyển. Cần thực hiện preflight, đối chiếu dữ liệu/collation, thử email và AI trên
staging trước cutover. Container/network test riêng được dọn sau kiểm tra; image local được giữ để review.

Các lệnh tái lập (chạy từ backend trừ lệnh Docker/frontend):

```sh
./mvnw -DskipTests compile
./mvnw clean test
./mvnw -DskipTests package
docker build -f backend/Dockerfile -t stationery-backend-readiness:local backend
```

Test PostgreSQL thật là opt-in: đặt `TEST_POSTGRES_URL` trỏ tới **database localhost tạm**
không có dữ liệu nghiệp vụ; user `postgres`/trust chỉ dành cho container test. Nếu không đặt,
các test PG riêng sẽ skip, còn các test offline/H2 vẫn chạy. Không trỏ test này vào production.
Ở máy hiện tại Maven dùng thêm `-Dmaven.repo.local=C:\Users\ASUS\.m2\repository` để chọn cache.

Frontend: đặt VITE_API_BASE_URL rồi `npm run build`; `npm run test:catalog` kiểm tra catalog service.
Python: `python backend/scripts/test_migrate_data.py` và integration test opt-in ở cùng thư mục.

## F. Các bước tiếp theo trên Supabase / Render / Vercel

1. Supabase: chạy `backend/scripts/supabase-preflight.sql` bằng role dùng cho Render.
   Kiểm tra vector/hstore/uuid-ossp và quyền CREATE schema store, usage/create public/extensions.
   Nếu thiếu extension, admin bật extension trong dashboard/SQL editor; không di chuyển extension đang có.
2. Chuẩn bị schema và chuyển dữ liệu theo data-migration.md trong maintenance window.
   Kiểm tra FK, counts, tiếng Việt, decimal, ID/sequence; review khác biệt collation trước cutover.
3. Chọn gói hosting phù hợp Gmail SMTP, nhập secrets riêng trong Render Environment.
   Review/commit changes rồi người dùng tự deploy branch main với settings bảng D.
4. Vercel: Root Directory `frontend`, build `npm run build`, output `dist`;
   đặt VITE_API_BASE_URL là Render origin thật, redeploy để nhúng giá trị mới.
5. Sau import thành công, bật Gemini và chạy `POST /api/admin/ai/index` với ADMIN bearer token.
   Scheduler cũng tự sync sau khoảng 15 giây, chu kỳ 60 giây. Dữ liệu semantic có SHA-256 fingerprint,
   nên restart không re-embed toàn catalog; chỉ có một probe dimension khi khởi tạo vector store.
6. Kiểm tra health, register/login, cart/checkout, reset email, CORS Vercel, chatbot và recommendations.
   Không dùng response CATALOG_FALLBACK làm bằng chứng Gemini đã hoạt động: kiểm tra source AI_RAG/log reason.

Vector mặc định 3072 chiều dùng **exact cosine search**, không HNSW vector vượt giới hạn 2000 chiều.
Không tự giảm chiều, không dùng lại embeddings Ollama, không drop/truncate bảng vector cũ.
Đổi model/dimensions phải dùng bảng mới và reindex. Preflight thật trên Supabase, quota/model access
và Gmail gửi/nhận vẫn là các bước manual: task không dùng secret thật để gọi dịch vụ bên ngoài.

Tài liệu chính thức đã đối chiếu:
[Boot/Flyway](https://docs.spring.io/spring-boot/how-to/data-initialization.html),
[Actuator](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html),
[Supabase session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Spring AI Google GenAI](https://docs.spring.io/spring-ai/reference/api/chat/google-genai-chat.html),
[pgvector index limits](https://github.com/pgvector/pgvector#hnsw).
