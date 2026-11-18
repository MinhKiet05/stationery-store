# Chuyển dữ liệu SQL Server → PostgreSQL an toàn

Đây là quy trình riêng với migration schema Flyway. Chưa có dữ liệu production nào được chuyển.
Không chạy import trong startup/scheduler. Source SQL Server không nhận INSERT/UPDATE/DELETE/DDL.
Toàn bộ lệnh bên dưới do người vận hành review và chạy, không yêu cầu gửi secret qua chat/source.

## Chuẩn bị và schema

1. Backup SQL Server và Supabase theo quy trình của đội vận hành. Ghi lại release backend đang chạy.
2. Kiểm tra mapping 18 bảng/cột trong `backend/scripts/migrate_data.py` với database thật.
   Repository không có DDL/stored procedures SQL Server gốc; các object khác ngoài mapping cần được audit riêng.
   Kiểm tra collation nguồn, username/email/handle/SKU, Unicode, decimal, nulls và các giá trị enum.
3. Chuẩn bị Supabase extensions qua dashboard và chạy preflight read-only.
4. Cấp env trong `backend/.env.example`, đặt `AI_ENABLED=false`. Tạo schema bằng chính Flyway của app,
   chạy JAR trên máy quản trị và chỉ bind loopback để không nhận đăng ký/đơn mới:

   ```sh
   java -jar backend/target/backend-0.0.1-SNAPSHOT.jar --server.address=127.0.0.1 --server.port=10001 --app.ai.enabled=false
   ```

   Chờ startup/Flyway/Hibernate validate thành công rồi dừng process. Các bảng `store` phải rỗng.
   Flyway history được giữ nguyên; không bật baseline-on-migrate hoặc clean. Nếu store có dữ liệu, dừng review.
   Bảng vector public hiện có không thuộc Flyway migration và không được copy/xóa.

## Nếu startup báo password authentication failed (28P01)

Đây là lỗi xác thực trước khi Flyway chạy migration, không phải lỗi SQL tạo bảng.
`DB_PASSWORD` có giá trị chỉ chứng minh biến đã được nhập, không chứng minh mật khẩu đúng.
Với shared session pooler, user phải là `postgres.<PROJECT_REF>`; thông báo lỗi phía server
có thể ghi user `postgres`, không có nghĩa phải bỏ project ref khỏi DB_USERNAME.

1. Trong Dashboard của đúng project, mở Connect → Session pooler và đối chiếu host/port/user.
   Dùng **database password**, không dùng mật khẩu đăng nhập Supabase, anon key hay service-role key.
   Nếu không chắc mật khẩu, reset trong Database → Settings rồi cập nhật các nơi dùng cùng credential.
2. Nhập lại trong đúng PowerShell sẽ chạy Java. Chữ trong `Read-Host "..."` là lời nhắc,
   không phải giá trị mật khẩu. Gõ mật khẩu tại dòng nhập ẩn sau khi chạy lệnh:

   ```powershell
   $env:DATABASE_URL = 'jdbc:postgresql://aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require'
   $env:DB_USERNAME = 'postgres.lyuggqgiocydqljblxch'
   $dbPasswordInput = Read-Host 'Nhap DATABASE password cua Supabase' -AsSecureString
   $env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $dbPasswordInput).Password
   Remove-Variable dbPasswordInput
   # Neu da khai bao password rieng cho vector pool cung database:
   if (Test-Path Env:PGVECTOR_PASSWORD) { $env:PGVECTOR_PASSWORD = $env:DB_PASSWORD }
   ```

   Mật khẩu ở biến riêng là chuỗi gốc; không thêm dấu nháy, không URL-encode hoặc escape ký tự.
   Không đưa password vào tham số `--spring.datasource.password` hay in ra terminal.
3. Nếu vừa reset, pooler có thể còn cache credential cũ trong thời gian ngắn. Thử kết nối lại
   sau khoảng 15–30 giây, không reset liên tục. Nếu vẫn lỗi, kiểm tra bằng direct connection
   lấy từ Dashboard (direct user `postgres`, host khác, cần mạng hỗ trợ), rồi liên hệ Supabase
   nếu direct hoạt động nhưng pooler vẫn thất bại sau vài phút.
4. Chạy lại lệnh tạo schema ở phần trên, từ cùng PowerShell. Không cần rebuild JAR chỉ vì
   thay env. Java 25 trong log không phải nguyên nhân lỗi 28P01; dùng Java 21 theo runtime dự án:

   ```powershell
   & 'C:\Program Files\Java\jdk-21\bin\java.exe' -jar backend/target/backend-0.0.1-SNAPSHOT.jar --server.address=127.0.0.1 --server.port=10001 --app.ai.enabled=false
   ```

Nguồn: [Supabase authentication](https://supabase.com/kb/troubleshooting/fatal-password-authentication-failed),
[reset database password](https://supabase.com/kb/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB),
[pooler cache sau khi reset](https://supabase.com/kb/troubleshooting/supavisor-error-password-authentication-failed-after-password-rotation).

## Export source (read-only)

Dùng Python >=3.11 trên máy quản trị có Microsoft ODBC Driver 18 for SQL Server:

```sh
python -m venv .venv
# Activate .venv theo hệ điều hành, sau đó:
python -m pip install -r backend/scripts/requirements-migration.txt
```

Đặt biến **MIGRATION_SQLSERVER_CONNECTION_STRING** trong môi trường tiến trình,
ví dụ cấu trúc `DRIVER={ODBC Driver 18 for SQL Server};SERVER=<HOST>;DATABASE=<DB>;UID=<USER>;PWD=<SECRET>;Encrypt=yes;...`.
Không ghi connection string thật vào file commit hay tham số command line.

Default isolation SNAPSHOT cần được admin bật từ trước trên source. Kiểm tra read-only:

```sql
SELECT name, snapshot_isolation_state_desc FROM sys.databases WHERE name=DB_NAME();
SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS database_collation;
```

Script không tự bật snapshot/alter database. Nếu snapshot chưa bật, dừng mọi writer trong maintenance
window và chọn `--source-isolation SERIALIZABLE`; cách này giữ read locks và có thể chặn writer.
Giữ source không nhận đơn/update cho tới khi xác minh cutover để không có delta bị bỏ sót.

Nếu export lỗi, script báo bước đang chạy, SQLSTATE và mã SQL Server đã nhận diện; không in
raw driver message/credentials. Mã 3951/3952 chỉ ra vấn đề SNAPSHOT; 207 là thiếu cột mapping,
208 là thiếu bảng/sai database hoặc schema, 229 là thiếu quyền SELECT. Không tự bỏ bảng/cột
để né lỗi. Export lỗi có thể để lại thư mục chưa hoàn chỉnh, không dùng nó để import và không
ghi đè; khi thử lại hãy chọn một tên thư mục export mới.

```sh
python backend/scripts/migrate_data.py export backend/migration-data/export-2026-11-18
python backend/scripts/migrate_data.py verify backend/migration-data/export-2026-11-18
```

Directory export phải mới; script từ chối ghi đè. Nó ghi JSONL UTF-8 cùng manifest chứa tên cột,
count và SHA-256 từng bảng; monetary decimal được giữ dạng chuỗi, không chuyển float.
Lệnh SELECT COUNT_BIG kiểm tra count nguồn trong cùng transaction. Source connection kết thúc bằng rollback.
Export có thông tin cá nhân/password hashes/reset token hashes: lưu riêng, giới hạn quyền truy cập,
không upload vào repo/logs. `.gitignore` đã chặn mọi thư mục `migration-data/`.

## Dry-run và import

### Sửa lỗi độ dài catalog sau khi V1 đã áp dụng

Audit local export `export-2026-11-18-v6` đã verify đủ 2.772 bản ghi: 8 handle dài hơn
100 ký tự (max 148), 57 URL dài hơn 100 (max 178), không có cột chuỗi khác vượt V1.
Xem [báo cáo tọa độ từng ô, không có giá trị dữ liệu](migration-length-audit.md).
V2 mở rộng riêng `store.products.handle` thành varchar(255), giữ UNIQUE; `url` thành text.
Entity và validation service đã đồng bộ. Không sửa V1, không cắt chuỗi, không xóa bản ghi.

Chạy từ repository root, trong cùng PowerShell đã có DATABASE_URL/DB_USERNAME/DB_PASSWORD,
JWT_SECRET_BASE64 và cấu hình SMTP. Backup trước khi chạy DDL. Đóng ứng dụng đang ghi dữ liệu;
để AI tắt khi khởi động phục vụ migration. Build chỉ tạo artifact, không kết nối database:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
Push-Location backend
try {
    .\mvnw.cmd -DskipTests package -B -ntp
    if ($LASTEXITCODE -ne 0) { throw 'Backend package failed' }
} finally { Pop-Location }
& 'C:\Program Files\Java\jdk-21\bin\java.exe' -jar backend/target/backend-0.0.1-SNAPSHOT.jar --server.address=127.0.0.1 --server.port=10001 --app.ai.enabled=false
```

Chờ Flyway áp dụng V2, Hibernate validate và startup thành công rồi Ctrl+C.
Không chạy JAR cũ chỉ chứa V1; không chạy flyway repair/baseline/clean.
V2 cần khóa DDL ngắn trên products; chỉ chạy trong maintenance window.

Kiểm tra schema và bảng rỗng bằng Supabase SQL Editor (chỉ SELECT):

```sql
SELECT version, description, success
FROM store.flyway_schema_history ORDER BY installed_rank;
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema='store' AND table_name='products' AND column_name IN ('handle','url');
SELECT 'users' AS table_name, count(*) FROM store.users
UNION ALL SELECT 'products', count(*) FROM store.products;
```

Kỳ vọng version 2 success, handle character varying/255, url text/NULL.
Importer kiểm tra cả 18 bảng phải rỗng; nếu bất kỳ bảng nào đã có dữ liệu thì dừng review,
không xóa để ép import. Dòng Verified trong lần dry-run lỗi trước đó không phải đã commit.

Sau đó verify export và chạy kiểm tra độ dài **chỉ đọc**, dùng metadata thật của schema đích:

```powershell
python backend/scripts/migrate_data.py verify backend/migration-data/export-2026-11-18-v6
python backend/scripts/migrate_data.py check-lengths backend/migration-data/export-2026-11-18-v6
```

`check-lengths` cần MIGRATION_PG_DSN/DB_USERNAME/DB_PASSWORD như bên dưới; nó đặt transaction
READ ONLY, không có INSERT/DDL và có thể chạy cả trước V2 để xem đủ 65 ô lỗi.
Thông báo chỉ chứa table, column, file/dòng JSONL, length và limit; không in giá trị/ID.
Nó kiểm tra mọi cột giới hạn độ dài của cả 18 bảng, kể cả username/password hash/email/reset token.
Import cũng tự chạy cùng preflight trong transaction sau lock và trước **mọi** INSERT.

Chỉ khi các kiểm tra thành công, người vận hành tự chạy lại **dry-run**:

```powershell
python backend/scripts/migrate_data.py import backend/migration-data/export-2026-11-18-v6 --dry-run
```

Kỳ vọng đủ bảng được verified và `Dry run complete: target transaction rolled back`.
Toàn bộ bản ghi/identity vẫn rollback khi thành công hoặc lỗi; không tự chuyển sang apply.
Không chỉnh sửa JSONL hoặc manifest để né lỗi; script xác minh lại checksum trước commit.

Đặt các biến môi trường, không paste secret vào shell history:

```dotenv
MIGRATION_PG_DSN=host=aws-1-ap-northeast-1.pooler.supabase.com port=5432 dbname=postgres sslmode=require
DB_USERNAME=postgres.lyuggqgiocydqljblxch
DB_PASSWORD=<PRIVATE_DATABASE_PASSWORD>
```

MIGRATION_PG_DSN là libpq DSN cho Python, khác DATABASE_URL dạng JDBC cho Spring.
Nếu dùng verify-full, cấu hình CA certificate phù hợp theo hướng dẫn Supabase.

```sh
python backend/scripts/migrate_data.py import backend/migration-data/export-2026-11-18 --dry-run
```

Dry-run xác minh file/layout/count/checksum, lock riêng 18 bảng target `store`, từ chối bảng có dữ liệu,
insert theo thứ tự parent-first, đối chiếu count và kiểm tra FK; giữ nguyên ID, password hashes, timestamps.
Identity được RESTART tới max ID + 1 bằng ALTER transactional. Cuối dry-run rollback toàn transaction,
gồm việc restart identity. Vector/public và source không bị chạm.

Sau khi review kết quả, chạy riêng bước commit:

```sh
python backend/scripts/migrate_data.py import backend/migration-data/export-2026-11-18 --apply
```

Lỗi ở bất kỳ bảng/check nào làm rollback toàn bộ target transaction. Re-run sau khi import đã commit
bị từ chối vì target có dữ liệu, không có UPSERT/truncate/reset tự động. Script không in driver exception
message để tránh lộ connection string/row data; chỉ báo exception type và diagnostics cố định an toàn.

## Kiểm tra trước cutover và rollback

- Đối chiếu count cả 18 bảng với manifest và source frozen; kiểm tra FK, giá/discount/historical totals,
  tên tiếng Việt/emoji, thứ tự ảnh, stock/version, role/isActive và timestamps.
- Dùng staging để kiểm tra register/login, đơn cũ, cart/checkout, tracking/recommendation và reset mail.
  Nếu source dùng collation CI, đối chiếu hành vi hoa/thường của các lookup exact trước khi chấp thuận cutover.
- Bật AI, reindex sang bảng Gemini riêng sau khi dữ liệu nghiệp vụ đã xác minh. Không import embeddings Ollama.
- Trước cutover, rollback nghĩa là giữ backend/release SQL Server cũ hoạt động với dữ liệu gốc;
  không có yêu cầu xóa target. Bản backend PostgreSQL mới không còn SQL Server runtime driver.
- Sau cutover nếu đã có ghi mới trên PostgreSQL, **không** trỏ lại source cũ ngay: dừng writer, backup
  target và đối soát/chuyển delta trước, tránh mất đơn. Phục hồi backup chỉ do người vận hành quyết định.
  Không có down migration DROP/truncate tự động trong repository.

## Kiểm thử script

`python backend/scripts/test_migrate_data.py` kiểm tra layout/checksum/count/precision.
`test_import_postgres.py` chỉ chạy khi TEST_MIGRATION_DSN trỏ tới database tạm chưa có schema store.
Nó tạo fixture giả, kiểm tra dry-run, rollback khi FK sai, import thành công, identity và chống ghi đè.
Không dùng DSN Supabase production cho integration test này.
