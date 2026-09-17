import { googleSignInEnabled } from '@/lib/google-signin';

/**
 * "Continue with Google". Renders nothing until both halves of the OAuth client are configured,
 * so a half-finished deploy never shows a button that cannot work.
 *
 * The label is deliberately plain. The reference site attaches a research-use confirmation to
 * this button, which records nothing; a visitor new to us goes on to a form that does.
 */
export function GoogleButton({ returnTo, label }: { returnTo: string; label: string }) {
  if (!googleSignInEnabled()) return null;
  return (
    <div className="mt-6">
      <a
        href={`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`}
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-foreground/20 bg-background px-5 text-sm font-bold transition-colors hover:border-primary"
      >
        <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
        {label}
      </a>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Google confirms your email address. It does not confirm your age, so a new account still
        asks for a date of birth and the research-use acknowledgement.
      </p>
    </div>
  );
}
