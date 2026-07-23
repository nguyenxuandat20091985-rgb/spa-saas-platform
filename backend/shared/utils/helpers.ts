import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// ==========================================
// ID & MÃ SỐ
// ==========================================

export function generateId(): string {
  return uuidv4();
}

export function generateShortId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateOrderNumber(prefix: string = 'ORD'): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

export function generateInvoiceNumber(prefix: string = 'INV'): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

export function generateBookingCode(prefix: string = 'BK'): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = generateShortId(4).toUpperCase();
  return `${prefix}-${dateStr}-${random}`;
}

export function generateCardNumber(): string {
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    parts.push(Math.floor(Math.random() * 10000).toString().padStart(4, '0'));
  }
  return parts.join('-');
}

export function generateVoucherCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateOTP(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return otp;
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==========================================
// SLUG & CHUỖI
// ==========================================

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Xóa dấu tiếng Việt
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

export function truncate(text: string, length: number = 100, suffix: string = '...'): string {
  if (text.length <= length) return text;
  return text.substring(0, length) + suffix;
}

export function capitalizeFirstLetter(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function capitalizeWords(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => capitalizeFirstLetter(word))
    .join(' ');
}

// ==========================================
// CHUYỂN ĐỔI CASE (SNAKE ↔ CAMEL)
// ==========================================

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function rowToCamelCase<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result as T;
}

export function rowsToCamelCase<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => rowToCamelCase<T>(row));
}

export function camelToSnakeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}

// ==========================================
// THỜI GIAN & NGÀY THÁNG
// ==========================================

export function parseDateRange(period: string): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { startDate, endDate };
}

export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(date: Date = new Date()): Date {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getMonthStart(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getMonthEnd(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function isBusinessHours(date: Date, openTime: string, closeTime: string): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

// ==========================================
// TIỀN TỆ, THUẾ, TÍNH TOÁN
// ==========================================

export function formatCurrency(amount: number, currency: string = 'VND'): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount);
}

export function calculateTax(amount: number, taxRate: number = 0.1): number {
  return Math.round(amount * taxRate * 100) / 100;
}

export function calculateDiscount(amount: number, discount: number, isPercent: boolean = true): {
  discountAmount: number;
  finalAmount: number;
} {
  const discountAmount = isPercent ? amount * (discount / 100) : discount;
  const finalAmount = Math.max(0, amount - discountAmount);
  return {
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalAmount: Math.round(finalAmount * 100) / 100,
  };
}

export function calculateLoyaltyPoints(amount: number, rate: number = 1): number {
  return Math.floor(amount * rate / 1000);
}

// ==========================================
// MÃ HÓA & BẢO MẬT
// ==========================================

export function hashString(str: string, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(str).digest('hex');
}

export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// ==========================================
// XỬ LÝ SỐ ĐIỆN THOẠI VIỆT NAM
// ==========================================

export function isValidVietnamesePhone(phone: string): boolean {
  const clean = phone.replace(/[+\s()-]/g, '');
  // 10 số, bắt đầu bằng 03,05,07,08,09 hoặc 86,89,90,91,92,93,94,95,96,97,98,99
  const regex = /^(0|84)(3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])([0-9]{7})$/;
  return regex.test(clean);
}

export function formatVietnamesePhone(phone: string): string {
  const clean = phone.replace(/[+\s()-]/g, '');
  if (clean.startsWith('84')) {
    return `0${clean.slice(2)}`;
  }
  if (clean.startsWith('0')) {
    return clean;
  }
  return `0${clean}`;
}

// ==========================================
// TOẠ ĐỘ & KHOẢNG CÁCH
// ==========================================

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'km' | 'm' = 'km'
): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return unit === 'm' ? distance * 1000 : distance;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

// ==========================================
// NHỊP & THỜI GIAN CHỜ
// ==========================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function delay<T>(fn: () => T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(fn()), ms);
  });
}

// ==========================================
// XỬ LÝ MẢNG & ĐỐI TƯỢNG
// ==========================================

export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const group = String(item[key]);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  generateId,
  generateShortId,
  generateOrderNumber,
  generateInvoiceNumber,
  generateBookingCode,
  generateCardNumber,
  generateVoucherCode,
  generateOTP,
  generateReferralCode,
  slugify,
  truncate,
  capitalizeFirstLetter,
  capitalizeWords,
  snakeToCamel,
  camelToSnake,
  rowToCamelCase,
  rowsToCamelCase,
  camelToSnakeObject,
  parseDateRange,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  isBusinessHours,
  formatCurrency,
  calculateTax,
  calculateDiscount,
  calculateLoyaltyPoints,
  hashString,
  generateRandomToken,
  isValidVietnamesePhone,
  formatVietnamesePhone,
  calculateDistance,
  sleep,
  delay,
  groupBy,
  pick,
  omit,
};