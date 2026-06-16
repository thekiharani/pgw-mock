import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signOut } = authClient;

// The global platform role rides along on the session user (better-auth
// additionalFields). Admins see and manage every merchant.
export function usePlatformAdmin(): boolean {
  const { data } = useSession();
  return (data?.user as { role?: string } | undefined)?.role === 'admin';
}
