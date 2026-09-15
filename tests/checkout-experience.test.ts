import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CheckoutExperience, invalidatesQuote } from '@/components/site/checkout-experience';

describe('delivery quote invalidation', () => {
  it('keeps the quote when a rate is chosen or a field the quote does not use changes', () => {
    for (const name of [
      'delivery_choice',
      'save_address',
      'research_setting',
      'note',
      'confirm_age',
      'confirm_ruo',
      'checkout_quote',
    ]) {
      expect(invalidatesQuote(name), name).toBe(false);
    }
  });

  it('drops the quote when the address, the contact email or the saved-address picker changes', () => {
    for (const name of ['email', 'name', 'company', 'line1', 'line2', 'city', 'region', 'postalCode', 'phone', 'country']) {
      expect(invalidatesQuote(name), name).toBe(true);
    }
    // The saved-address picker is an unnamed select that refills every address field.
    expect(invalidatesQuote(''), 'saved-address picker').toBe(true);
  });
});

describe('checkout destination', () => {
  const base = {
    subtotalCents: 200,
    token: 'a'.repeat(32),
    acknowledgement: 'Synthetic acknowledgement',
    ageStatement: 'Synthetic age statement',
    quoteRequired: true,
    orderable: true,
    researchSettings: ['Synthetic setting'],
  };

  it('asks a guest for the delivery address', () => {
    const html = renderToStaticMarkup(createElement(CheckoutExperience, base));
    expect(html).toContain('Where should the order go?');
    expect(html).toContain('name="line1"');
    expect(html).toContain('name="research_setting"');
  });

  it('shows a wholesale order its fixed destination instead of address fields', () => {
    const html = renderToStaticMarkup(
      createElement(CheckoutExperience, {
        ...base,
        destination: {
          heading: 'Ships to your organization',
          intro: 'Wholesale orders ship only to the approved address on record.',
          body: createElement('p', null, 'Synthetic institution, 1 Receiving Dock'),
        },
      }),
    );
    expect(html).toContain('Ships to your organization');
    expect(html).toContain('Synthetic institution, 1 Receiving Dock');
    expect(html).not.toContain('name="line1"');
    expect(html).not.toContain('No account or email verification is required');
    expect(html).toContain('name="research_setting"');
    expect(html).toContain('Compare delivery services');
  });
});
