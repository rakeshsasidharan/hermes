'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface DefaultAddressRedirectProps {
  href: string;
  children: React.ReactNode;
}

/**
 * Client-side replacement for a server `redirect()` fired inside a streamed
 * Suspense boundary. Next's built-in RedirectBoundary renders `null` while it
 * navigates, blanking the content area. This keeps `children` (a loading
 * state) mounted instead; `router.replace` runs in a transition, so it stays
 * on screen until the target route commits its own loading UI.
 */
export function DefaultAddressRedirect({ href, children }: DefaultAddressRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return <>{children}</>;
}
