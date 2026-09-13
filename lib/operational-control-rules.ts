export const CONTROL_STATUSES = [
  'not_started',
  'in_progress',
  'blocked',
  'awaiting_review',
  'ready',
  'not_applicable',
] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

export const CONTROL_STATUS_LABEL: Record<ControlStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  awaiting_review: 'Awaiting review',
  ready: 'Ready',
  not_applicable: 'Not applicable',
};
