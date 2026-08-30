/**
 * CPF Utilities - Validation and Formatting
 */

/**
 * Validates a Brazilian CPF number using the Modulo 11 algorithm
 */
export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  
  // Must have exactly 11 digits
  if (digits.length !== 11) return false;
  
  // Reject repeated sequences (111.111.111-11, etc)
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;
  
  return true;
}

/**
 * Formats a CPF string with mask: 000.000.000-00
 */
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Extracts only digits from a CPF string
 */
export function cleanCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/**
 * Generates a password from CPF (first 4 digits)
 */
export function generatePasswordFromCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  return digits.substring(0, 4);
}

/**
 * Masks CPF for display (shows only first 3 and last 2 digits)
 */
export function maskCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}
