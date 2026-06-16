import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Building2, LayoutDashboard, LogOut, Receipt, ShieldCheck, Users } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage, initials } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { signOut, usePlatformAdmin, useSession } from '@/lib/auth-client';

const NAV = [
  { to: '/merchants', label: 'Merchants', icon: Building2 },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
];

export function AppShell() {
  const { data } = useSession();
  const isAdmin = usePlatformAdmin();
  const navigate = useNavigate();

  const user = data?.user;
  const displayName = user?.name || user?.email || 'Signed in';

  async function handleSignOut() {
    await signOut();
    navigate({ to: '/login' });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card/40 p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Noria Payments</div>
            <div className="text-xs text-muted-foreground">Mock Console</div>
          </div>
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

          {isAdmin && (
            <>
              <div className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Admin
              </div>
              {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  // Overview ('/admin') must not stay active on '/admin/users'.
                  activeOptions={{ exact: to === '/admin' }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  activeProps={{ className: 'bg-accent text-foreground font-medium' }}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center gap-2.5 px-1">
            <Avatar>
              {user?.image && <AvatarImage src={user.image} alt={displayName} />}
              <AvatarFallback>{initials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{displayName}</span>
                {isAdmin && (
                  <span
                    className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                    title="Platform admin"
                  >
                    <ShieldCheck className="size-3" />
                    Admin
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground" title={user?.email}>
                {user?.email}
              </div>
            </div>
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
