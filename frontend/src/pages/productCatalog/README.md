# Trang danh mục Bút & Mực

- Mở `/products?category=but-muc` hoặc chọn **Bút & Mực** trên thanh điều hướng.
- Ô tìm kiếm ở header chuyển đến `/products?search=<từ khoá>`.
- Dữ liệu 55 sản phẩm Bút & Mực được trích từ `stationery_shop_full.sql`. `catalogProducts.json` lưu tên, handle, thương hiệu, giá, trạng thái và URL ảnh gốc từ bảng `product_images` (`image_position=0`), ghép qua `@pid` của từng sản phẩm. Không dùng ảnh từ SVG hoặc ảnh tự tạo.
- Đây là bản trích dữ liệu tĩnh, chưa kết nối API danh mục hoặc giỏ hàng. Các nút sản phẩm/giỏ hàng mở hộp xem nhanh, không tạo đơn hàng. Ảnh tải trực tiếp từ CDN ghi trong SQL, cần kết nối mạng.
- Bộ lọc danh mục, giá, thương hiệu, đánh giá, tồn kho; sắp xếp; phân trang; đổi kiểu hiển thị và yêu thích hoạt động trong phiên hiện tại. Số lượng kết quả được tính từ dữ liệu đã trích. Database chưa có dữ liệu giao nhanh nên bộ lọc hoả tốc được vô hiệu hoá. Không tự đặt số đã bán, xuất xứ hay đánh giá; sản phẩm chưa có đánh giá hiển thị trạng thái tương ứng.
- Chọn 4 hoặc 8 sản phẩm mỗi trang để kiểm tra phân trang. Dùng bộ lọc thương hiệu/giá kết hợp để kiểm tra trạng thái không có kết quả và nút xoá bộ lọc.
- CSS Modules cung cấp bố cục 4/3/2 cột và bộ lọc thu gọn trên điện thoại.

Kiểm tra build: `npm run build` trong thư mục `frontend`.

Cập nhật dữ liệu từ file SQL (chạy trong thư mục `frontend`):

```powershell
python scripts/import-catalog-sql.py "C:\Users\PC\Downloads\stationery_shop_full.sql"
```

Script chỉ đọc các bản ghi sản phẩm và URL ảnh, không thực thi SQL hoặc xuất dữ liệu tài khoản/khách hàng.
