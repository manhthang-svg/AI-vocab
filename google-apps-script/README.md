# Kết nối email nhắc học Milim

1. Trong Milim, mở **Cài đặt → Email giữ chuỗi** và chọn **Sao chép mã Apps Script**.
2. Mở [Google Apps Script](https://script.google.com/home/start), tạo project mới, dán mã vào `Code.gs` và lưu.
3. Chạy hàm `setupMilimReminder`, cấp quyền Gmail, rồi sao chép **Mã kết nối Milim** trong Execution log.
4. Chọn **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Dán Web app URL, mã kết nối và email vào Milim, sau đó chọn **Lưu kết nối**.

Apps Script kiểm tra mỗi 5 phút. Google có thể chạy trigger trễ vài phút so với giờ đã chọn. Milim chỉ gửi ngày đã học, không gửi từ vựng hoặc nội dung Writing.
