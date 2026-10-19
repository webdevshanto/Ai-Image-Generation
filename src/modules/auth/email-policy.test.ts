import { describe, expect, it } from 'vitest';
import { isAllowedEmailProvider, isDisposableEmail } from './email-policy.js';

describe('email provider policy', () => {
  it('allows supported Gmail, Outlook, and Yahoo domains', () => {
    for (const email of [
      'user@gmail.com',
      'user@googlemail.com',
      'user@outlook.com',
      'user@hotmail.com',
      'user@live.com',
      'user@yahoo.com',
      'user@yahoo.co.uk',
      'user@ymail.com',
      'user@rocketmail.com',
    ]) {
      expect(isAllowedEmailProvider(email)).toBe(true);
    }
  });

  it('rejects unsupported and known disposable domains', () => {
    expect(isAllowedEmailProvider('user@proton.me')).toBe(false);
    expect(isAllowedEmailProvider('user@mailinator.com')).toBe(false);
    expect(isDisposableEmail('user@yopmail.com')).toBe(true);
  });

  it('matches disposable wildcard subdomains', () => {
    expect(isDisposableEmail('user@sub.33mail.com')).toBe(true);
  });
});
