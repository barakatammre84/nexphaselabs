import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
import { AccountServiceForms } from '@/components/manage/account-service-forms';

/** The manual email confirmation is offered only to an account still waiting for one. */
const confirmForm = (status: string) => {
  const html = renderToStaticMarkup(
    React.createElement(AccountServiceForms, { action: async (state) => state, status, liveSessions: 0 }),
  );
  return html.split('<form').find((form) => form.includes('value="confirm_email"')) ?? '';
};

describe('confirming an email address by hand', () => {
  it('is available, with a required note, while the address is unconfirmed', () => {
    const form = confirmForm('pending_email');
    expect(form).toContain('How the address was confirmed');
    expect(form).toContain('required=""');
    expect(form).not.toContain('disabled=""');
  });

  it('is unavailable once the address is confirmed', () => {
    expect(confirmForm('active')).toContain('disabled=""');
  });
});
