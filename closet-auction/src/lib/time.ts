export function formatRemaining(endsAt: string | Date): string {
  const end = typeof endsAt === 'string' ? new Date(endsAt) : endsAt;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 'Ended';

  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function isEnded(endsAt: string | Date): boolean {
  const end = typeof endsAt === 'string' ? new Date(endsAt) : endsAt;
  return end.getTime() <= Date.now();
}

export const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '6 hours', minutes: 360 },
  { label: '1 day', minutes: 1440 },
  { label: '3 days', minutes: 4320 },
];
