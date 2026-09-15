import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
import { FeedbackStaffThread } from '@/components/manage/feedback-staff-thread';

/**
 * A staff reply is saved to the conversation, and emailed only when an email provider is
 * configured (lib/feedback.ts). The person replying must know which one happened.
 */
const render = (visitorEmail: string | null, repliesEmailed: boolean) =>
  renderToStaticMarkup(
    React.createElement(FeedbackStaffThread, {
      publicId: 'FB-260915-00000001',
      status: 'open',
      priority: 'normal',
      labels: [],
      issueUrl: null,
      resolutionSummary: null,
      notes: [],
      messages: [],
      visitorEmail,
      repliesEmailed,
    }),
  );

describe('replying to a website visitor', () => {
  it('warns that the reply is not emailed while the site cannot send email', () => {
    const html = render('visitor@example.org', false);
    expect(html).toContain('Not emailed');
    expect(html).toContain('visitor@example.org');
  });

  it('adds nothing when the reply will be emailed', () => {
    expect(render('visitor@example.org', true)).not.toContain('Not emailed');
  });

  it('explains where a visitor who left no address sees the reply', () => {
    expect(render(null, true)).toContain('left no email address');
  });
});
