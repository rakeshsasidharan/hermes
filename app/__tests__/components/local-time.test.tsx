import { act } from 'react';
// The node build: under jsdom, 'react-dom/server' resolves to the browser
// build, which needs MessageChannel.
import { renderToString } from 'react-dom/server.node';
import { hydrateRoot } from 'react-dom/client';
import { render, screen } from '@testing-library/react';
import { LocalTime, formatLocalTime } from '@/components/local-time';

// Late evening UTC: a different calendar day and hour in Asia/Kolkata (+05:30).
const ISO = '2026-11-13T22:45:00.000Z';

const LOCALE_METHODS = ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'] as const;
const originalLocaleMethods = LOCALE_METHODS.map((name) => Date.prototype[name]);

/**
 * Jest sandboxes process.env, so assigning TZ does not reach the runtime.
 * Pin the timezone by defaulting the timeZone option of the locale methods.
 */
function pinTimeZone(timeZone: string) {
  LOCALE_METHODS.forEach((name, i) => {
    const original = originalLocaleMethods[i];
    Date.prototype[name] = function (
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) {
      return original.call(this, locales, { timeZone, ...options });
    };
  });
}

afterEach(() => {
  LOCALE_METHODS.forEach((name, i) => {
    Date.prototype[name] = originalLocaleMethods[i];
  });
});

/**
 * Server-renders in UTC (as the Lambda does), then hydrates in another
 * timezone (as a viewer's browser would) and returns any recoverable errors
 * React reported — hydration mismatches surface there.
 */
async function serverRenderThenHydrate(element: React.ReactElement) {
  pinTimeZone('UTC');
  const html = renderToString(element);

  pinTimeZone('Asia/Kolkata');
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const errors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) => errors.push(error),
    });
  });

  const text = container.textContent;
  act(() => root.unmount());
  container.remove();
  return { errors, text };
}

function InlineFormattedDate({ iso }: { iso: string }) {
  return <span>{new Date(iso).toLocaleString()}</span>;
}

describe('LocalTime hydration', () => {
  test('control: formatting during render mismatches across timezones (#267)', async () => {
    const { errors } = await serverRenderThenHydrate(<InlineFormattedDate iso={ISO} />);
    expect(errors.length).toBeGreaterThan(0);
  });

  test.each(['mailbox', 'datetime', 'date', 'relative'] as const)(
    'hydrates without mismatch for the %s format',
    async (format) => {
      const { errors } = await serverRenderThenHydrate(<LocalTime iso={ISO} format={format} />);
      expect(errors).toEqual([]);
    },
  );

  test('shows the viewer-local value once hydrated', async () => {
    const { text } = await serverRenderThenHydrate(<LocalTime iso={ISO} format="datetime" />);
    expect(text).toBe(new Date(ISO).toLocaleString([], { timeZone: 'Asia/Kolkata' }));
    expect(text).not.toBe(new Date(ISO).toLocaleString([], { timeZone: 'UTC' }));
  });

  test('server render leaves the text empty but keeps the machine-readable timestamp', () => {
    const html = renderToString(<LocalTime iso={ISO} format="datetime" />);
    expect(html).toBe(`<time dateTime="${ISO}"></time>`);
  });
});

describe('LocalTime client render', () => {
  test('renders the formatted value with a dateTime attribute', () => {
    render(<LocalTime iso={ISO} format="date" className="text-xs" />);
    const time = screen.getByText(formatLocalTime(ISO, 'date'));
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', ISO);
    expect(time).toHaveClass('text-xs');
  });
});

describe('formatLocalTime', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');

  test('mailbox format shows the time for a timestamp from today', () => {
    const iso = '2026-11-14T09:30:00.000Z';
    expect(formatLocalTime(iso, 'mailbox', now)).toBe(
      new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    );
  });

  test('mailbox format shows month and day for an earlier timestamp', () => {
    const iso = '2026-10-02T09:30:00.000Z';
    expect(formatLocalTime(iso, 'mailbox', now)).toBe(
      new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    );
  });

  test('datetime format uses the full locale date and time', () => {
    expect(formatLocalTime(ISO, 'datetime', now)).toBe(new Date(ISO).toLocaleString());
  });

  test('date format uses the locale date', () => {
    expect(formatLocalTime(ISO, 'date', now)).toBe(new Date(ISO).toLocaleDateString());
  });

  test.each([
    ['2026-11-14T11:55:00.000Z', '5m ago'],
    ['2026-11-14T09:00:00.000Z', '3h ago'],
    ['2026-11-11T12:00:00.000Z', '3d ago'],
  ])('relative format renders %s as %s', (iso, expected) => {
    expect(formatLocalTime(iso, 'relative', now)).toBe(expected);
  });

  test('relative format never goes negative for a timestamp slightly in the future', () => {
    expect(formatLocalTime('2026-11-14T12:01:00.000Z', 'relative', now)).toBe('0m ago');
  });

  test('returns an empty string for an invalid timestamp', () => {
    expect(formatLocalTime('not-a-date', 'datetime', now)).toBe('');
  });
});
