import { describe, it, expect } from 'vitest';
import { findSecret } from '../../src/engine/secrets.js';

describe('secret filter', () => {
  it.each([
    ['-----BEGIN RSA PRIVATE KEY-----\nabc', 'private key'],
    ['my key is AKIAIOSFODNN7EXAMPLE', 'AWS access key'],
    ['ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'GitHub token'],
    ['export KEY=sk-ant-' + 'A'.repeat(30), 'API key (sk-…)'],
    ['password: hunter2hunter2', 'password assignment'],
    ['postgres://admin:s3cret@db.example.com/app', 'connection string with credentials'],
    ['token ' + 'Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LmNbVcXz12', 'high-entropy token'],
  ])('detects %s', (text, name) => {
    expect(findSecret(text)).toBe(name);
  });

  it.each([
    'A pointer is like a note with the address of a flat',
    'int* p = &x; *p = 5; // write through the pointer',
    'SELECT name FROM users JOIN orders ON users.id = orders.user_id',
    'https://en.cppreference.com/w/cpp/language/pointer',
    'Объяснил своими словами разницу между адресом и значением',
    'for (int i = 0; i < n; ++i) { sum += a[i]; }',
  ])('allows ordinary learning text: %s', (text) => {
    expect(findSecret(text)).toBeNull();
  });
});
