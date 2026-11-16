# Trang danh mục Bút & Mực

- Mở `/products?category=but-muc` hoặc chọn **Bút & Mực** trên thanh điều hướng.
- Ô tìm kiếm ở header chuyển đến `/products?search=<từ khoá>`.
- `GET /api/product-types` cung cấp tên và ID các loại sản phẩm. Bộ lọc dùng `productTypeID` thực tế, chỉ hiển thị loại đang hoạt động thuộc Bút, Mực, Ngòi bút hoặc Ruột bút. Backend hiện có danh mục phẳng nên phạm vi Bút & Mực được xác định từ tên loại, không gán cứng ID.
- `GET /api/products?page=0&size=100&sort=productID,asc` và các trang tiếp theo cung cấp sản phẩm. Trang tải đủ các trang trước khi tính số lượng và lọc theo `productTypeID`, thương hiệu, giá, đánh giá, tồn kho. Với quy mô catalog hiện tại, lọc, sắp xếp và phân trang giao diện chạy phía frontend.
- Tên, thương hiệu, giá, đánh giá, trạng thái và URL ảnh đều lấy từ API. Không dùng file SQL, JSON tĩnh hoặc ảnh tự tạo làm dữ liệu dự phòng. Sản phẩm thiếu ảnh hiển thị thông báo bằng chữ.
- Có trạng thái đang tải, lỗi kết nối và nút **Thử lại**. Request bị huỷ khi rời trang. API chưa cung cấp thông tin giao hoả tốc nên bộ lọc đó được vô hiệu hoá.
- Nút sản phẩm/giỏ hàng mở xem nhanh; chọn **Xem chi tiết sản phẩm** để chuyển đến trang chi tiết hiện có. Yêu thích được giữ trong phiên hiện tại.
- Chọn 4 hoặc 8 sản phẩm mỗi trang để kiểm tra phân trang. Dùng bộ lọc thương hiệu/giá kết hợp để kiểm tra trạng thái không có kết quả và nút xoá bộ lọc.
- CSS Modules cung cấp bố cục 4/3/2 cột và bộ lọc thu gọn trên điện thoại.

Chạy backend ở `http://localhost:8080`, sau đó chạy `npm run dev` trong thư mục `frontend`. Vite đã cấu hình proxy `/api` đến backend. Khi triển khai khác địa chỉ, cấu hình `VITE_API_BASE_URL` đến backend và cho phép origin frontend trong CORS của backend.

Kiểm tra:

```powershell
npm run test:catalog
npm run build
```

Các bài kiểm tra dùng phản hồi API giả lập để kiểm tra loại bị vô hiệu hoá, ID danh mục động, ảnh từ API, nhiều trang, kết quả rỗng, lỗi API và huỷ request. Chúng không thay đổi database.
