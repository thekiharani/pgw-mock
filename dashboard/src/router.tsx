import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { AppShell } from '@/components/app-shell';
import { authClient } from '@/lib/auth-client';
import { LoginPage } from '@/features/auth/login-page';
import { MerchantDetailPage } from '@/features/merchants/merchant-detail-page';
import { MerchantsPage } from '@/features/merchants/merchants-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';

async function hasSession(): Promise<boolean> {
  const { data } = await authClient.getSession();
  return Boolean(data);
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

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([indexRoute, merchantsRoute, merchantDetailRoute, transactionsRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
