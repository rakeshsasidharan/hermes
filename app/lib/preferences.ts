export const PREFERRED_ADDRESS_COOKIE = 'hermes_preferred_address';
export const SIDEBAR_STATE_COOKIE = 'sidebar_state';
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function setPreferenceCookie(name: string, value: string, maxAge = PREFERENCE_COOKIE_MAX_AGE) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function getPreferenceCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}
