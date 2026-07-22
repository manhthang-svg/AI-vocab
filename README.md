# milim

Ứng dụng desktop học từ vựng tiếng Anh với bộ từ theo ngày, spaced repetition và nhận xét bài làm bằng Gemini.

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

## Gemini

Trong **Cài đặt → Gemini chấm bài**, nhập API key được tạo từ Google AI Studio. Key được mã hóa bằng `safeStorage` của Electron, lưu tách khỏi dữ liệu từ vựng và không xuất hiện trong tệp sao lưu. Milim dùng model `gemini-2.5-flash` qua API `generateContent` để kiểm tra nghĩa và câu ví dụ.
