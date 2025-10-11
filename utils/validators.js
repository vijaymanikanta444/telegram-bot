export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function isValidPhone(phone) {
  const re = /^\d{7,15}$/;
  return re.test(phone);
}

export function isValidBirthday(day, month) {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}
