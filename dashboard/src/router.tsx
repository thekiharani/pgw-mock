import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { AppShell } from '@/components/app-shell';
import { authClient } from '@/lib/auth-client';
import { AdminOverviewPage } from '@/features/admin/admin-overview-page';
import { AdminUserDetailPage } from '@/features/admin/admin-user-detail-page';
import { AdminUsersPage } from '@/features/admin/admin-users-page';
import { LoginPage } from '@/features/auth/login-page';
import { InvitePage } from '@/features/invitations/invite-page';
import { MerchantDetailPage } from '@/features/merchants/merchant-detail-page';
import { MerchantsPage } from '@/features/merchants/merchants-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';

async function hasSession(): Promise<boolean> {
  const { data } = await authClient.getSession();
  return Boolean(data);
}

// Admin routes redirect non-admins back to the merchants list.
async function requireAdmin(): Promise<void> {
  const { data } = await authClient.getSession();
  if (!data) throw redirect({ to: '/login' });
  if ((data.user as { role?: string }).role !== 'admin') throw redirect({ to: '/merchants' });
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async () => {
    if (await hasSession()) throw redirect({ to: '/merchants' });
  },
  component: LoginPage,
});

// Public route: the page itself drives sign-in (the invited email may not have
// an account yet) and then acceptance.
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  component: InvitePage,
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  beforeLoad: async () => {
    if (!(await hasSession())) throw redirect({ to: '/login' });
  },
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/merchants' });
  },
});

const merchantsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/merchants',
  component: MerchantsPage,
});

const merchantDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/merchants/$merchantId',
  component: MerchantDetailPage,
});

const transactionsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/transactions',
  component: TransactionsPage,
});

const adminOverviewRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin',
  beforeLoad: requireAdmin,
  component: AdminOverviewPage,
});

const adminUsersRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/users',
  beforeLoad: requireAdmin,
  component: AdminUsersPage,
});

const adminUserDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/admin/users/$userId',
  beforeLoad: requireAdmin,
  component: AdminUserDetailPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  inviteRoute,
  authedRoute.addChildren([
    indexRoute,
    merchantsRoute,
    merchantDetailRoute,
    transactionsRoute,
    adminOverviewRoute,
    adminUsersRoute,
    adminUserDetailRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
