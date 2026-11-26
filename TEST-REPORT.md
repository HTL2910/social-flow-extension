# Kiểm chứng 0.1.2 — 2026-10-22

- Người dùng xác nhận 0.1.1 chạy và cuộn 27 lần nhưng không nhận diện bài. Chưa có DOM tài khoản thực tế nên chưa biết chính xác trường hợp nào xảy ra trên tài khoản đó.
- Tái hiện 6 trường hợp nhận diện bị thiếu bằng jsdom: FeedUnit không có role feed/article; chữ Thích với nhãn React; lớp bao sâu; permalink ảnh; bài không permalink nhưng có tác giả và nội dung rõ; thông báo nguyên nhân loại bài. Các test thất bại trước sửa và đạt sau sửa.
- Thêm kiểm thử vòng chạy dùng cả core.js, facebook.js và content.js trên DOM fixture: nút Like phát sinh một click, DOM xác nhận đã like, bộ đếm lên 1, phiên vẫn chạy. Chrome runtime được mô phỏng trong test này.
- Tổng cộng 31/31 kiểm thử logic/DOM đạt. `npm test` cần jsdom 26.1.0 trong devDependencies.
- Không test trên tài khoản Facebook thật. Không tuyên bố tương thích mọi giao diện Facebook. Chromium đầu cuối chưa chạy được do giới hạn thực thi trình duyệt đã ghi nhận ở phiên trước.
- Chẩn đoán chỉ lưu số lượng và lý do loại bài; không lưu nội dung DOM, bài viết hay tên tác giả.

- Kiểm tra thêm: giữ định danh khi mở rộng nội dung hoặc xuất hiện permalink muộn; nhận diện DOM tái sử dụng có permalink khác; không click nếu nội dung thay đổi trong lúc chờ lưu trạng thái. Lỗi đổi định danh khi mở rộng nội dung đã được tái hiện bằng test thất bại trước sửa.
