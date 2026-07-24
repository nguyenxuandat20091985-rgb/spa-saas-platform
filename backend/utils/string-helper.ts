/**
 * Hàm tiện ích xử lý chuỗi dùng chung
 */

/**
 * Chuyển chuỗi sang dạng slug (không dấu, viết thường, nối bằng dấu -)
 */
export function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Viết hoa chữ cái đầu tiên của mỗi từ
 */
export function capitalizeWords(text: string): string {
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Rút gọn chuỗi nếu quá dài và thêm dấu ...
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}