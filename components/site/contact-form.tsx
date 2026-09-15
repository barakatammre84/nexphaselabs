'use client';

import { useState, type FormEvent } from 'react';
import { CONTACT_TOPICS, SUPPORT, contactSubject } from '@/lib/support';

type State =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'sent'; reference: string }
  | { phase: 'error'; message: string };

/**
 * Contact form. Posts into the feedback queue (the same record staff already
 * work from) instead of opening a mail client: the message gets a reference
 * number the moment it is saved, staff see it in /manage/feedback with the
 * topic and order or lot number in the subject, and the visitor keeps the
 * thread in this browser through the feedback cookie the API sets.
 */
export function ContactForm() {
  const [state, setState] = useState<State>({ phase: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const topic = String(data.get('topic') ?? 'other');
    const reference = String(data.get('reference') ?? '');
    setState({ phase: 'sending' });
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          message: String(data.get('message') ?? ''),
          kind: 'comment',
          title: contactSubject(topic, reference),
          page: '/contact',
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { conversation?: { id?: string }; error?: string }
        | null;
      if (!response.ok || !payload?.conversation?.id) {
        setState({ phase: 'error', message: payload?.error ?? 'Your message could not be saved. Try again.' });
        return;
      }
      form.reset();
      setState({ phase: 'sent', reference: payload.conversation.id });
    } catch {
      setState({ phase: 'error', message: 'Your message could not be sent. Check your connection and try again.' });
    }
  }

  if (state.phase === 'sent') {
    return (
      <div className="rounded-[1.6rem] border border-white/15 bg-white/10 p-6 backdrop-blur" role="status">
        <p className="text-sm font-bold text-white/60">Message received</p>
        <p className="mt-2 font-display text-2xl font-extrabold text-white">Reference {state.reference}</p>
        <p className="mt-4 text-sm leading-6 text-white/70">
          Keep this reference. A person replies {SUPPORT.firstReply} during our hours ({SUPPORT.hours}). Replies go to the email address you gave, and the conversation stays open in this browser.
        </p>
        <button type="button" onClick={() => setState({ phase: 'idle' })} className="mt-5 text-sm font-extrabold text-aqua-soft underline-offset-4 hover:underline">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[1.6rem] border border-white/15 bg-white/10 p-6 backdrop-blur" aria-describedby="contact-commitment">
      <p className="text-sm font-bold text-white/60">Write to the team</p>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-xs font-bold text-white/70">
          Name
          <input name="name" required maxLength={80} autoComplete="name" className="rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-sm font-normal text-navy" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-white/70">
          Email for the reply
          <input name="email" type="email" required maxLength={120} autoComplete="email" className="rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-sm font-normal text-navy" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-white/70">
          What is this about?
          <select name="topic" required defaultValue="order" className="rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-sm font-normal text-navy">
            {CONTACT_TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-white/70">
          Order, lot or catalog number (if you have one)
          <input name="reference" maxLength={40} placeholder="e.g. NX-260912-0007 or GHKCU50-2605-01" className="rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-sm font-normal text-navy" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-white/70">
          Message
          <textarea name="message" required minLength={1} maxLength={2000} rows={5} className="rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-sm font-normal text-navy" />
        </label>
      </div>
      {state.phase === 'error' ? (
        <p className="mt-3 text-sm font-bold text-amber-200" role="alert">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={state.phase === 'sending'} className="mt-5 inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-[var(--ion-navy)] disabled:opacity-60">
        {state.phase === 'sending' ? 'Sending…' : 'Send message'}
      </button>
      <p id="contact-commitment" className="mt-4 text-xs leading-5 text-white/60">
        Hours: {SUPPORT.hours}. First reply {SUPPORT.firstReply}; order and shipping questions {SUPPORT.orderReply}. {SUPPORT.outOfScope}
      </p>
    </form>
  );
}
