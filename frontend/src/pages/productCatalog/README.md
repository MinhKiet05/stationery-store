# Trang danh mục Bút & Mực

- Mở `/products?category=but-muc` hoặc chọn **Bút & Mực** trên thanh điều hướng.
- Ô tìm kiếm ở header chuyển đến `/products?search=<từ khoá>`.
- Dữ liệu 12 sản phẩm và ảnh được lấy từ thiết kế SVG do người dùng cung cấp. Đây là giao diện mẫu, chưa kết nối API danh mục hoặc giỏ hàng. Các nút sản phẩm/giỏ hàng mở hộp xem nhanh, không tạo đơn hàng.
- Bộ lọc danh mục, giá, thương hiệu, đánh giá, tồn kho, giao nhanh; sắp xếp; phân trang; đổi kiểu hiển thị và yêu thích hoạt động trong phiên hiện tại. Mặc định không áp dụng bộ lọc để hiển thị đủ sản phẩm trong thiết kế; số lượng kết quả được tính từ dữ liệu thực tế của giao diện mẫu.
- Chọn 4 hoặc 8 sản phẩm mỗi trang để kiểm tra phân trang. Dùng bộ lọc thương hiệu/giá kết hợp để kiểm tra trạng thái không có kết quả và nút xoá bộ lọc.
- CSS Modules cung cấp bố cục 4/3/2 cột và bộ lọc thu gọn trên điện thoại.

Kiểm tra build: `npm run build` trong thư mục `frontend`.
