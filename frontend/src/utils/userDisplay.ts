export function accountInitials(name: string | null | undefined): string {
  const words = (name ?? '').normalize('NFC').trim().split(/\s+/)
    .map(word => word.match(/\p{L}/u)?.[0]).filter((letter): letter is string => Boolean(letter));
  if (!words.length) return 'U';
  return (words[0] + (words.length > 1 ? words[words.length - 1] : '')).toLocaleUpperCase('vi-VN');
}

export function accountRoleLabel(role: string): string {
  switch (role.toUpperCase()) {
    case 'ADMIN': return 'Quản trị viên';
    case 'CUSTOMER': case 'USER': return 'Khách hàng';
    case 'STAFF': return 'Nhân viên';
    default: return 'Thành viên';
  }
}
