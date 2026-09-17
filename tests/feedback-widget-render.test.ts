import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeedbackChat } from '@/components/site/feedback-chat';

describe('public feedback widget', () => {
  it('renders its launcher in the initial server response', () => {
    const html = renderToStaticMarkup(createElement(FeedbackChat));

    expect(html).toContain('feedback-launcher');
    expect(html).toContain('Questions? Chat with us');
  });
});
