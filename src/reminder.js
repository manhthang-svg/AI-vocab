const GOOGLE_APPS_SCRIPT_HOSTS = new Set(['script.google.com']);

function validateReminderUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('URL Apps Script không hợp lệ.');
  }
  if (url.protocol !== 'https:' || !GOOGLE_APPS_SCRIPT_HOSTS.has(url.hostname) || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
    throw new Error('Hãy dùng URL Web app dạng https://script.google.com/macros/s/.../exec.');
  }
  return url.toString();
}

function validateReminderEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Email nhận lời nhắc không hợp lệ.');
  return email;
}

function validateReminderTime(value) {
  const time = String(value || '').trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Giờ nhắc không hợp lệ.');
  return time;
}

function normalizeReminderDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ngày học không hợp lệ.');
  return date;
}

module.exports = { validateReminderUrl, validateReminderEmail, validateReminderTime, normalizeReminderDate };
