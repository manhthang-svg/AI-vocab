# milim

## Phát hành bản cập nhật tự động

Milim dùng GitHub Releases và `electron-updater`. Khi mã nguồn đã được đẩy lên
`manhthang-svg/AI-vocab`, tạo một tag trùng với phiên bản trong `package.json`:

```powershell
git tag v3.7.0
git push origin v3.7.0
```

GitHub Actions sẽ tự đóng gói Windows và đưa bộ cài, blockmap cùng `latest.yml`
vào một Release công khai. Các bản milim đã cài sẽ kiểm tra cập nhật khi khởi
động và mỗi 6 giờ. Mỗi phiên bản mới phải tăng trường `version` trước khi tạo tag.

Ứng dụng desktop học từ vựng tiếng Anh với bộ từ theo ngày, active recall, lịch ôn FSRS-6, cây hoa phát triển theo chuỗi ngày học và AI cục bộ hoạt động offline.

## Chạy ứng dụng

```powershell
npm install
npm start
```

## Đóng gói bản cài đặt Windows

```powershell
npm run dist
```

Dữ liệu được lưu local trong thư mục `userData` của Electron và có thể sao lưu/khôi phục từ màn hình Cài đặt.

## AI cục bộ

Trong **Cài đặt → AI cục bộ**, milim tải riêng Qwen3 4B Q4_K_M và llama.cpp
Vulkan vào thư mục `userData`. Model không nằm trong bộ cài, được kiểm tra
SHA-256 trước khi chạy và được giữ nguyên qua các lần cập nhật ứng dụng. App
chỉ nạp model khi cần chấm bài và tự giải phóng RAM/VRAM sau thời gian không dùng.

## Gemini (tùy chọn)

Trong **Cài đặt → Gemini**, có thể nhập API key được tạo từ Google AI Studio làm
lớp dự phòng. Key được mã hóa bằng `safeStorage`, lưu tách khỏi dữ liệu từ vựng
và không xuất hiện trong tệp sao lưu. Nếu cả AI cục bộ lẫn Gemini không khả dụng,
phiên ôn vẫn tiếp tục bằng chế độ tự đánh giá.
