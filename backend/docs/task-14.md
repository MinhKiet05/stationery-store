# Task 14 - StatisticsService

Nhánh: `feature-statistics`. Phạm vi backend, theo Task 14 trong `Phan_cong_Backend_Stationery_Store.docx`, đặc tả UC035/UC036/UC037 và quy tắc Review/Return nhóm đã cung cấp.

## Đối chiếu đặc tả

| Nguồn | Yêu cầu | Triển khai |
| --- | --- | --- |
| UC035 | Doanh thu, số đơn thành công, tổng giảm giá | `SUM(totalAmount)`, `COUNT(orderID)`, `SUM(discountAmount)`; trả tổng và dữ liệu biểu đồ theo ngày/tháng/năm. |
| UC035 A1 | Không chọn ngày thì dùng tháng hiện tại | Từ ngày đầu đến ngày cuối tháng, theo `Asia/Ho_Chi_Minh`. |
| UC035 E1 | Ngày bắt đầu sau ngày kết thúc | HTTP 400, `detail` = `Khoảng thời gian không hợp lệ`. |
| UC035 E2 | Không có giao dịch | Các tổng doanh thu/số đơn/giảm giá bằng 0, `periods=[]`. |
| UC035 E3 | Lỗi CSDL | Giao dịch đọc bị lỗi được kết thúc bởi Spring; trả HTTP 503, `Không thể lấy dữ liệu thống kê`, không lộ lỗi SQL. |
| UC036 | Top khách hàng, tổng số đơn, tổng tiền đã thanh toán | JOIN User/Order, GROUP BY khách hàng; `sortBy=REVENUE` hoặc `ORDERS`. |
| UC036 E2 | Không có dữ liệu mua hàng | `customers=[]`. |
| UC037 | Top sản phẩm, số lượng và doanh thu | JOIN Product/Variant/OrderDetail/Order, `SUM(quantity)`, `SUM(subTotal)`, GROUP BY sản phẩm. |
| UC037 | Lọc danh mục, đổi tiêu chí xếp hạng | `productTypeID`, `sortBy=QUANTITY` hoặc `REVENUE`. |
| UC037 E2 | Không có dữ liệu bán hàng | Trả danh sách `[]`; frontend có thể hiển thị thông báo theo UC. |
| Task 14 | Tổng quan, thống kê trạng thái đơn và khách hàng | Thêm `overview`, `orders`, bộ đếm tài khoản khách hàng. |
| Quy tắc nhóm | Duyệt trả hàng khác với hoàn tiền | Không tự trừ doanh thu khi có yêu cầu trả hàng hoặc khi yêu cầu được duyệt; thống kê riêng trạng thái trả hàng. |

## API

Tất cả endpoint dùng `GET /api/admin/statistics/...`, yêu cầu `Authorization: Bearer <adminToken>`. Kiểm tra ADMIN ở security filter, Controller và Service.

| Endpoint | Tham số riêng | Kết quả |
| --- | --- | --- |
| `/overview` | Không có | Tổng đơn, đơn thành công, doanh thu, giảm giá, số lượng bán, tổng khách hàng và khách mới. |
| `/revenue` | `groupBy=DAY/MONTH/YEAR`, mặc định DAY | Tổng doanh thu và các kỳ cho bảng/biểu đồ. |
| `/top-products` | `productTypeID`, `sortBy=QUANTITY/REVENUE`, `limit` | Danh sách xếp hạng sản phẩm. |
| `/orders` | Không có | Tổng đơn, số đơn theo từng trạng thái, số yêu cầu trả hàng theo trạng thái. |
| `/customers` | `sortBy=REVENUE/ORDERS`, `limit` | Bộ đếm khách hàng và danh sách xếp hạng. |

Tham số chung: `startDate`, `endDate`, định dạng `yyyy-MM-dd`.

- Bỏ cả hai ngày: dùng toàn bộ tháng hiện tại theo giờ Việt Nam.
- Gửi một ngày và thiếu ngày còn lại: 400, yêu cầu chọn đủ khoảng ngày.
- Tính trọn cả ngày kết thúc bằng điều kiện `>= startDate 00:00` và `< (endDate + 1 ngày) 00:00`.
- Thống kê đơn/doanh thu/sản phẩm/đơn mua của khách lọc bằng `Order.orderDate`, theo cấu trúc truy vấn doanh thu có sẵn của dự án.
- `newCustomers` lọc bằng `User.createdAt`; số yêu cầu trả hàng lọc bằng `ReturnRequest.createdAt`.
- `limit` mặc định 10, từ 1 đến 100. Danh mục phải có ID dương; danh mục không có giao dịch trả danh sách rỗng.
- Sắp xếp giảm dần theo tiêu chí được chọn, sau đó theo ID tăng dần để ổn định thứ tự khi bằng nhau.
- Giới hạn ngày hỗ trợ: năm bắt đầu 0001–9999; ngày kết thúc tối đa 9999-12-30 để tính được mốc cuối khoảng.

Ví dụ:

```http
GET /api/admin/statistics/revenue?startDate=2026-11-02&endDate=2026-11-02&groupBy=DAY
GET /api/admin/statistics/customers?startDate=2026-11-01&endDate=2026-11-30&sortBy=ORDERS&limit=10
GET /api/admin/statistics/top-products?startDate=2026-11-01&endDate=2026-11-30&productTypeID=1&sortBy=REVENUE&limit=10
```

Ví dụ response doanh thu với dữ liệu thử nghiệm:

```json
{
  "startDate": "2026-11-02",
  "endDate": "2026-11-02",
  "groupBy": "DAY",
  "successfulOrders": 4,
  "totalRevenue": 720.00,
  "totalDiscount": 30.00,
  "periods": [
    {
      "periodStart": "2026-11-02",
      "orderCount": 4,
      "totalRevenue": 720.00,
      "totalDiscount": 30.00
    }
  ]
}
```

`periodStart` là ngày đầu kỳ: ngày thực tế, ngày đầu tháng hoặc ngày đầu năm. Chỉ trả các kỳ có đơn thành công trong khoảng lọc.

## Quy tắc tính tiền và phối hợp module

1. Đơn thành công là `DELIVERED`. Với đơn đã giao chuyển sang `RETURN_PENDING`, vẫn tính giao dịch gốc nếu có `deliveredAt`; yêu cầu trả hàng chưa phải bằng chứng hoàn tiền. Loại `CANCELLED`, `PENDING`, `PROCESSING`, `SHIPPED` và `RETURN_PENDING` chưa có ngày giao khỏi số liệu bán hàng.
2. UC035 dùng `Order.totalAmount` đã được OrderService trừ giảm giá. Không trừ `discountAmount` thêm lần nữa. Tiền đơn và giảm giá được tổng hợp trực tiếp từ Order, tránh nhân đôi khi JOIN nhiều dòng chi tiết.
3. UC037 dùng đúng `OrderDetail.subTotal` theo đặc tả. Đây là doanh số dòng hàng trước giảm giá cấp đơn; không dùng giá sản phẩm hiện tại. Các biến thể cùng sản phẩm được gộp lại, lịch sử của sản phẩm đã ngừng bán vẫn được giữ trong báo cáo.
4. UC036 xếp hạng tài khoản CUSTOMER. `orderCount` đếm đơn thành công; `totalPaid` chỉ cộng `totalAmount` khi `isPaid=true`, tránh coi đơn giao thành công là đã thu tiền. Sắp xếp theo REVENUE dùng `totalPaid`, theo ORDERS dùng `orderCount`. Không trả password/hash, entity hoặc quan hệ JPA.
5. `totalCustomers/activeCustomers/inactiveCustomers` là tổng tài khoản CUSTOMER toàn hệ thống. `newCustomers` là số tài khoản tạo trong khoảng ngày; `purchasingCustomers` là số CUSTOMER khác nhau có đơn thành công trong khoảng đó.
6. `orders.statusCounts` luôn có đủ 6 trạng thái hiện tại, trạng thái không có dữ liệu bằng 0. `returnRequestCounts` luôn có PENDING, APPROVED, REJECTED, COMPLETED.

**Giới hạn dữ liệu hoàn tiền:** Entity Return hiện chỉ có 4 trạng thái trên, không có REFUNDED, thời điểm hoàn tiền hay số tiền hoàn thực tế/phân bổ giảm giá từng dòng. Không tự coi APPROVED hoặc COMPLETED là đã hoàn tiền. Vì vậy `totalRevenue` phản ánh giá trị đơn thành công sau giảm giá theo SUM(totalAmount) của UC035, chưa điều chỉnh hoàn tiền thực tế; không thể dùng nó làm doanh thu thuần sau hoàn tiền. Khi module Return/Order lưu được giao dịch hoàn tiền đã xác nhận, cần bổ sung phần điều chỉnh này theo đúng quy tắc nhóm.

`OrderService` hiện chuyển DELIVERED nhưng không tự đổi `isPaid`; dữ liệu thanh toán cần được module Order cập nhật đúng để UC036 phản ánh tiền đã thu.

## Cấu trúc code

- `dto/statistics`: Request/Response record và enum nhóm kỳ/tiêu chí xếp hạng.
- `services/StatisticsService.java`: hợp đồng 5 API thống kê.
- `services/impl/StatisticsServiceImpl.java`: kiểm tra ngày, mặc định tháng, giới hạn và chuyển projection sang DTO.
- `repositories/StatisticsRepository.java`: repository tổng hợp riêng, truy vấn SUM/COUNT/GROUP BY và giới hạn kết quả trong database.
- `controller/StatisticsController.java`: nhận HTTP request.
- `controller/StatisticsExceptionHandler.java`: lỗi 400/503, giới hạn trong module Statistics.
- `config/StatisticsConfig.java`: Clock theo giờ Việt Nam, hỗ trợ kiểm thử mốc chuyển tháng.

Service chạy `@Transactional(readOnly=true)`. Không sửa Entity, schema, logic Order/Return/Review hoặc repository của thành viên khác. H2 chỉ được thêm với scope `test` để chạy kiểm thử truy vấn; cấu hình SQL Server runtime giữ nguyên.

## Kiểm thử

Từ thư mục `backend`:

```powershell
.\mvnw.cmd "-Dmaven.repo.local=$env:USERPROFILE/.m2/repository" "-Dtest=StatisticsRepositoryTest,StatisticsApiTest" test
```

Kiểm thử API dùng security filter và method authorization thật. Kiểm thử repository chạy truy vấn thật trên H2 với `MODE=MSSQLServer`, dữ liệu riêng và rollback sau mỗi test.

Kết quả: **48 tests passed, 0 failures, 0 errors** (38 ca API/phân quyền, 10 ca truy vấn và nghiệp vụ). Postman Collection đã kiểm tra cú pháp 37 script.

Các tình huống gồm mặc định tháng theo giờ Việt Nam, dữ liệu rỗng, khoảng ngày sai, bao gồm cuối ngày, phân nhóm năm/tháng/ngày, đơn hủy/chưa giao, tránh nhân tổng tiền khi nhiều chi tiết, giá lịch sử, gộp biến thể, lọc danh mục, đổi tiêu chí xếp hạng, tiền đã thanh toán, yêu cầu trả hàng, 401/403 và lỗi CSDL 503.

H2 ở chế độ tương thích không thay thế kiểm thử SQL Server thật. Chưa chạy collection trực tiếp với backend/SQL Server.

## Postman và SQL đối chiếu

Collection: `docs/postman/Task14_Statistics.postman_collection.json` tại thư mục gốc, gồm 37 GET request có assertion.

1. Chạy SQL Server/backend, import collection và điền `baseUrl`, `adminToken`, `customerToken`.
2. Chỉnh `startDate/endDate`, `productTypeID`. `emptyDate` phải là ngày không có giao dịch trong database thử nghiệm.
3. Run collection một lượt. Collection chỉ đọc dữ liệu, có các ca mong đợi 400/401/403.
4. Chạy `docs/sql/verify_task14.sql` trên database `stationery_shop`, cùng khoảng ngày và danh mục, rồi so sánh với response Postman.

Tiêu đề PR đề xuất: `Hoàn thành task 14: thống kê doanh thu, khách hàng và sản phẩm`.
