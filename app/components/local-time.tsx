'use client';

import { useSyncExternalStore } from 'react';

export type LocalTimeFormat = 'mailbox' | 'datetime' | 'date' | 'relative';

/**
 * Formats an ISO timestamp in the viewer's locale and timezone.
 *
 * Only call this from the browser: on the server it would format in the
 * Lambda's UTC timezone and default locale, which is what caused the
 * hydration mismatch in #267. Render dates through <LocalTime> instead.
 */
export function formatLocalTime(iso: string, format: LocalTimeFormat, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  switch (format) {
    case 'mailbox':
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    case 'datetime':
      return date.toLocaleString();
    case 'date':
      return date.toLocaleDateString();
    case 'relative': {
      const mins = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    }
  }
}

function subscribe(): () => void {
  return () => {};
}

/**
 * True in the browser after hydration, false during the server render and the
 * hydration pass. React uses the server snapshot while hydrating, so both
 * renders agree, then immediately re-renders with the client snapshot.
 */
function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

interface LocalTimeProps {
  iso: string;
  format: LocalTimeFormat;
  className?: string;
}

export function LocalTime({ iso, format, className }: LocalTimeProps) {
  const isHydrated = useIsHydrated();
  return (
    <time dateTime={iso} className={className}>
      {isHydrated ? formatLocalTime(iso, format) : ''}
    </time>
  );
}
