// Client-safe alert vocabulary (no DB imports — this module is bundled for the browser).

export type AlertKind =
  | 'arrived_pickup'
  | 'arrived_drop'
  | 'load_delivered'
  | 'ping_flagged'
  | 'load_created';

export const ALERT_LABELS: Record<string, string> = {
  arrived_pickup: 'Arrived at pickup',
  arrived_drop: 'Arrived at drop-off',
  load_delivered: 'Load delivered',
  ping_flagged: 'Ping flagged',
  load_created: 'Load created',
};
