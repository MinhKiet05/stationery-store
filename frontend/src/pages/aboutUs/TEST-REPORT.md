# Kết quả kiểm thử trang Giới thiệu & Liên hệ

Kết quả cuối: **32 ca đạt, 0 ca thất bại**, chạy bằng Chrome headless trên Vite.

| Nhóm | Đã kiểm tra |
| --- | --- |
| Nội dung | Tiêu đề tiếng Việt, một vùng nội dung chính, 3 ảnh tải thành công |
| Điều hướng | Nút liên hệ, nút giá trị cốt lõi, liên kết cửa hàng trong footer |
| Đường dẫn | `/about#faq`, `/about-us`, `/gioi-thieu`, `/about/`, `/contact`, `/lien-he` |
| FAQ | Mở/đóng, mở câu trả lời, mở từ footer ngay trên cùng trang |
| Form không hợp lệ | Bỏ trống, tên chỉ có khoảng trắng, email sai định dạng, thiếu chủ đề, tin nhắn dưới 10 ký tự, tin nhắn chỉ có khoảng trắng |
| Form hợp lệ | Điện thoại có thể bỏ trống, giới hạn 500 ký tự, cập nhật bộ đếm, xóa thông báo cũ khi sửa thông tin |
| Email | Đúng người nhận/chủ đề, giữ dấu tiếng Việt, dấu `&`, xuống dòng, lựa chọn nhận ưu đãi |
| Liên kết | Đích Google Maps, liên kết gọi điện và email; không thực hiện cuộc gọi hoặc gửi email |
| Responsive | Không cuộn ngang ở 320, 390, 768, 1024, 1296 và 1536px |
| JavaScript | Không có lỗi chưa được xử lý trong các thao tác được kiểm tra |

## Lỗi tìm thấy và đã sửa

1. FAQ không mở khi bấm liên kết từ footer trên cùng trang. Đã đồng bộ trạng thái FAQ với hash URL và bỏ hash khi đóng FAQ.
2. Tin nhắn chỉ gồm khoảng trắng vẫn hợp lệ. Đã yêu cầu ít nhất 10 ký tự sau khi bỏ khoảng trắng ở đầu/cuối.
3. Thông báo đã soạn email vẫn xuất hiện khi sửa email/tên/chủ đề. Đã xóa thông báo khi thay đổi biểu mẫu.

## Giới hạn và phần chưa tích hợp

- Form liên hệ mở ứng dụng email. Chưa có API tiếp nhận hoặc lưu liên hệ; kiểm thử không xác nhận email được gửi hay được nhận.
- Form đăng ký ưu đãi trong footer hiện chỉ chặn tải lại trang, chưa lưu đăng ký.
- Liên kết mạng xã hội đang trỏ đến trang chủ của từng nền tảng, chưa có URL tài khoản cửa hàng.
- Một số liên kết chính sách/tuyển dụng ở footer vẫn là `#`.
- Lần kiểm thử này dành cho trang giới thiệu và liên hệ; không xác nhận các luồng mua hàng, đăng nhập, thanh toán hay backend/database.

Chạy lại: `npm run test:about` từ `frontend` khi Vite đang chạy.
