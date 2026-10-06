import type { ActivityEvent } from '@/shared/types';

export function countEvents(events: ActivityEvent[], eventType: string): number { return events.filter((event) => event.event_type === eventType).length; }
export function sortEventsByTime(events: ActivityEvent[]): ActivityEvent[] { return [...events].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); }
