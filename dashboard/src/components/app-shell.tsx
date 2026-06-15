import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Building2, LogOut, Receipt } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { signOut, useSession } from '@/lib/auth-client';

const NAV = [
  { to: '/merchants', label: 'Merchants', icon: Building2 },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
];

export function AppShell() {
  const { data } = useSession();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: '/login' });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/40 p-4 md:flex">
        <div className="mb-6 px-2">
          <div className="text-sm font-semibold">Noria Payments</div>
          <div className="text-xs text-muted-foreground">Mock Console</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: 'bg-accent text-foreground font-medium' }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t pt-4">
          <div
            className="truncate px-2 pb-2 text-xs text-muted-foreground"
            title={data?.user?.email}
          >
            {data?.user?.email ?? 'Signed in'}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
