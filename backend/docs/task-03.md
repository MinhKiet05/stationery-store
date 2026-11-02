# Task 03 - ProductTypeService

Nhánh triển khai: `feature-product-type`.

## Các class

| File | Chức năng |
| --- | --- |
| `dto/producttype/ProductTypeRequest.java` | Dữ liệu tạo/cập nhật: `name`, `isActive`. |
| `dto/producttype/ProductTypeResponse.java` | Trả về `productTypeID`, `name`, `isActive`. |
| `services/ProductTypeService.java` | Interface cho 5 thao tác quản lý danh mục. |
| `services/impl/ProductTypeServiceImpl.java` | Kiểm tra tên, xử lý nghiệp vụ, chuyển Entity sang DTO. |
| `controller/ProductTypeController.java` | Nhận HTTP request và trả đúng mã trạng thái. |
| `controller/ProductTypeExceptionHandler.java` | Trả lỗi có `status`, `detail`, chỉ áp dụng cho module này. |
| `repositories/ProductTypeRepository.java` | Bổ sung 2 method kiểm tra tên trùng không phân biệt hoa/thường. |

Cấu trúc theo Vendor/Tag: DTO dạng `record`, constructor injection bằng `@RequiredArgsConstructor`, logic trong ServiceImpl, `@Transactional` cho thao tác ghi và `readOnly = true` cho thao tác đọc.

## API

| Method | Endpoint | Quyền | Thành công |
| --- | --- | --- | --- |
| GET | `/api/product-types` | Công khai | 200, danh sách DTO |
| GET | `/api/product-types/{id}` | Công khai | 200, một DTO |
| POST | `/api/product-types` | ADMIN | 201, DTO vừa tạo |
| PUT | `/api/product-types/{id}` | ADMIN | 200, DTO sau cập nhật |
| DELETE | `/api/product-types/{id}` | ADMIN | 204, không có body |

POST/PUT dùng `Content-Type: application/json` và `Authorization: Bearer <adminToken>`.

Ví dụ tạo:

```json
{
  "name": "Bút viết",
  "isActive": true
}
```

Ví dụ cập nhật tên/trạng thái:

```json
{
  "name": "Bút và dụng cụ viết",
  "isActive": false
}
```

Quy tắc:

- `name` bắt buộc, bỏ khoảng trắng đầu/cuối, không được rỗng hoặc toàn khoảng trắng, tối đa 100 ký tự sau khi trim.
- Tên không trùng không phân biệt hoa/thường, kể cả tên của danh mục đã ngừng hoạt động. Khi cập nhật được giữ nguyên tên của chính danh mục đó.
- POST bỏ qua hoặc gửi `isActive: null` thì mặc định `true`. PUT vẫn bắt buộc `name`; nếu bỏ qua hoặc gửi `isActive: null` thì giữ trạng thái cũ.
- GET trả cả danh mục đang hoạt động và đã ngừng hoạt động, có trường `isActive` để phân biệt.
- DELETE chỉ đặt `isActive=false`. Dữ liệu danh mục và liên kết từ sản phẩm được giữ lại, kể cả khi danh mục đang được sử dụng. DELETE lặp lại vẫn trả 204.
- PUT với `isActive=true` có thể kích hoạt lại danh mục.

Lỗi: 400 khi dữ liệu không hợp lệ, 401 khi thao tác ghi thiếu xác thực, 403 khi CUSTOMER thao tác ghi, 404 khi ID không tồn tại, 409 khi trùng tên hoặc có xung đột ràng buộc dữ liệu.

## Kiểm thử tự động

Từ thư mục `backend` chạy:

```powershell
.\mvnw.cmd "-Dtest=ProductTypeServiceImplTest,ProductTypeApiTest" test
```

Nếu Maven đang tìm repository tại `C:\.m2\repository`, chỉ rõ repository của tài khoản Windows:

```powershell
.\mvnw.cmd "-Dmaven.repo.local=$env:USERPROFILE/.m2/repository" "-Dtest=ProductTypeServiceImplTest,ProductTypeApiTest" test
```

Kết quả: **26 tests passed, 0 failures, 0 errors**. Các test dùng mock repository, kiểm tra nghiệp vụ và HTTP với security filter thật; không cần SQL Server, SMTP hoặc biến JWT của máy.

## Postman và SQL Server

Import `docs/postman/Task03_ProductType.postman_collection.json` tại thư mục gốc dự án. Collection có 33 request kèm assertion.

1. Khởi động SQL Server và backend với cấu hình database, JWT, SMTP hợp lệ.
2. Điền `baseUrl`, `adminToken`, `customerToken` trong Collection Variables. Token lấy từ API đăng nhập của tài khoản tương ứng; không đưa token thật vào Git.
3. Chạy Collection Runner theo thứ tự để tạo ID/tên tự động, kiểm tra CRUD, dữ liệu lỗi, tên trùng và phân quyền.
4. Collection tạo hai danh mục có tên ngẫu nhiên. Cuối lượt chạy, các danh mục còn trong database với `is_active=0` vì DELETE là xóa mềm.

Kiểm tra SQL sau DELETE, thay `123` bằng `productTypeID` đã tạo:

```sql
SELECT product_type_id, name, is_active
FROM product_types
WHERE product_type_id = 123;

SELECT product_id, product_type_id
FROM products
WHERE product_type_id = 123;
```

Với danh mục đã có sản phẩm trong database thử nghiệm, ghi lại các `product_id` trước DELETE rồi chạy lại hai truy vấn sau DELETE. Danh mục phải còn với `is_active=0`, các sản phẩm vẫn giữ `product_type_id` cũ.

**Chưa chạy Postman hoặc kiểm thử tích hợp trực tiếp SQL Server.** Kết quả 26 test ở trên kiểm tra với repository được mock. Việc chạy toàn bộ backend còn phụ thuộc cấu hình SQL Server/JWT/SMTP đã nêu.

## Chuẩn bị PR

Tiêu đề đề xuất: `feat: implement product type management API`.

Nội dung đề xuất: Thêm API danh mục với DTO, kiểm tra tên trùng và trạng thái hoạt động. DELETE ngừng hoạt động danh mục, giữ liên kết sản phẩm. Có 26 test tự động đã thành công và Postman Collection 33 request; kiểm thử SQL Server/Postman cần thực hiện với môi trường đã cấu hình.
