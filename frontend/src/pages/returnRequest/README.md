# Yêu cầu Trả hàng / Hoàn tiền (UC014)

Trang: `src/pages/returnRequest/ReturnRequest.tsx`.

## Truy cập

- `/returns/new`: chọn đơn hàng của tài khoản đang đăng nhập.
- `/returns/new?orderId=9842`: mở biểu mẫu của một đơn cụ thể; thay ID bằng đơn thật.
- `/orders/9842/return`: đường dẫn tương đương.
- Có liên kết **Yêu cầu trả hàng & hoàn tiền** trong footer.

Người chưa đăng nhập được đưa đến `/login?redirect=...` và quay lại trang đã chọn
sau khi đăng nhập. Chỉ chấp nhận đường dẫn quay lại thuộc cùng website.

## API hiện có được sử dụng

| API | Mục đích |
| --- | --- |
| `GET /api/orders/my-orders` | Danh sách đơn hàng của tài khoản |
| `GET /api/orders/{id}` | Chi tiết đơn đã chọn, giá mua và địa chỉ giao hàng |
| `GET /api/returns/my-requests` | Lịch sử, ghi chú xét duyệt và số lượng đã yêu cầu trả |
| `POST /api/returns` | Gửi `orderID`, `reason`, `evidenceUrls`, `items[{orderDetailID, quantity}]` |
| `GET /api/product-variants/{id}` và `GET /api/products/{id}` | Bổ sung tên/ảnh sản phẩm; nếu lỗi vẫn sử dụng thông tin trong đơn |

Token được gửi qua `Authorization: Bearer`, dùng chung `services/api.ts`.
Lỗi 400/401/403/404/409 được hiển thị riêng, không tự gửi lại yêu cầu khi thất bại.

## Quy tắc theo backend

- Chỉ đơn `DELIVERED` hoặc `RETURN_PENDING`, có `deliveredAt` và còn trong hạn 7 ngày.
- Thời điểm đúng 7 ngày vẫn được chấp nhận; sau thời điểm đó không được trả.
- `PENDING`, `APPROVED`, `COMPLETED` giữ số lượng; `REJECTED` không giữ số lượng.
- Từ 1 đến 5 URL minh chứng HTTP(S), tối đa 500 ký tự mỗi URL.
- Lý do và tình trạng được gộp trong trường `reason`, dưới giới hạn 1000 ký tự.
- Hiển thị theo giờ Việt Nam đối với ngày không kèm múi giờ; backend quyết định
  điều kiện cuối cùng tại thời điểm gửi.

## Khác biệt với ảnh thiết kế do API hiện tại

- Backend chưa có API tải tệp; biểu mẫu nhận liên kết công khai đến ảnh/video.
- Backend chưa nhận ví MoMo, voucher, tài khoản hoàn tiền hoặc địa chỉ thu hồi mới.
  Trang hiển thị địa chỉ của đơn và hướng dẫn liên hệ CSKH để thống nhất xử lý.
- Không có API hoàn tiền tự động, hoàn phí ship hay cấp voucher thêm 10%.
  Tổng tiền trên trang là giá trị sản phẩm tạm tính theo giá mua, không cam kết số
  tiền thực nhận; CSKH xác nhận cả ưu đãi của đơn và phí vận chuyển.
- Backend chấp thuận yêu cầu để xử lý thủ công; việc tạo/duyệt yêu cầu không thực
  hiện hoàn tiền hay nhập lại tồn kho.

## Chạy và kiểm tra

Từ `frontend`, chạy `npm run dev`; trong terminal khác chạy:

```sh
npm run test:returns
npm run test:about
npm run build
```

`test:returns` mở Chrome/Edge ẩn và mô phỏng API trong một phiên trình duyệt riêng,
không gửi yêu cầu thật, không thay đổi tài khoản, database hay thanh toán.
Fixture chỉ nằm trong `scripts/fixtures/returns.mjs`, không được import vào app.

Kết quả kiểm thử chức năng nằm tại `.cache/returns-test-results.json` ở thư mục gốc.
Ảnh desktop/mobile chụp từ dữ liệu kiểm thử nằm tại `.cache/returns-*.png`.

Đã kiểm tra: xác thực, chọn đơn/sản phẩm, giới hạn số lượng, hạn 7 ngày, minh chứng,
payload Unicode, chống bấm gửi hai lần, cập nhật trạng thái sau xét duyệt, các lỗi API,
chuyển tiếp đăng nhập và 6 chiều rộng từ 320 đến 1536px.

Chưa xác nhận được với backend/SQL Server chạy thật trên máy. Các file backend
`ReturnRequestServiceImplTest.java` và `ReturnSecurityTest.java` hiện trống;
Maven Wrapper trên máy cũng chưa khởi chạy được. Không ghi nhận các kiểm thử backend
này là đã đạt.
