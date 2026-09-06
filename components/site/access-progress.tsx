const steps = [
  'Create login',
  'Confirm email',
  'Organization details',
  'Review & approval',
];
export function AccessProgress({
  current,
  complete = false,
}: {
  current: number;
  complete?: boolean;
}) {
  return (
    <nav aria-label="Research access progress" className="my-8">
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={!complete && current === i ? 'step' : undefined}
            className={`border-t-2 pt-3 text-sm ${complete || i <= current ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}
          >
            <span className="mb-1 block text-xs text-muted-foreground">
              {complete || i < current ? 'Complete' : `Step ${i + 1}`}
            </span>
            <span className={current === i ? 'font-semibold' : ''}>
              {label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
