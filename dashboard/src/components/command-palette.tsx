import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Building2, LayoutDashboard, LogOut, Receipt, Users } from 'lucide-react';
import { useEffect } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { api } from '@/lib/api';
import { signOut, usePlatformAdmin } from '@/lib/auth-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGES = [
  { to: '/merchants', label: 'Merchants', icon: Building2, adminOnly: false },
  { to: '/transactions', label: 'Transactions', icon: Receipt, adminOnly: false },
  { to: '/admin', label: 'Admin overview', icon: LayoutDashboard, adminOnly: true },
  { to: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
] as const;

export function CommandPalette({
  open,
  onOpenChange,
  input,
  onInputChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: string;
  onInputChange: (value: string) => void;
}) {
  const navigate = useNavigate();
  const isAdmin = usePlatformAdmin();
  const q = useDebouncedValue(input.trim(), 200);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const searching = open && q.length > 0;

  const { data: merchants } = useQuery({
    queryKey: ['command', 'merchants', q],
    queryFn: () => api.listMerchants({ pageSize: 6, q }),
    enabled: searching,
  });

  const { data: users } = useQuery({
    queryKey: ['command', 'users', q],
    queryFn: () => api.adminListUsers({ pageSize: 6, q }),
    enabled: searching && isAdmin,
  });

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  const lower = q.toLowerCase();
  const pages = PAGES.filter((p) => (p.adminOnly ? isAdmin : true)).filter(
    (p) => !lower || p.label.toLowerCase().includes(lower),
  );
  const showSignOut = !lower || 'sign out logout'.includes(lower);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search merchants, users, pages…"
        value={input}
        onValueChange={onInputChange}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem
                key={p.to}
                value={`page:${p.to}`}
                onSelect={() => run(() => navigate({ to: p.to }))}
              >
                <p.icon className="size-4 text-muted-foreground" />
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {merchants && merchants.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Merchants">
              {merchants.data.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`merchant:${m.id}`}
                  onSelect={() =>
                    run(() =>
                      navigate({ to: '/merchants/$merchantId', params: { merchantId: m.id } }),
                    )
                  }
                >
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.mpesaPaybillNumber}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {isAdmin && users && users.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Users">
              {users.data.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`user:${u.id}`}
                  onSelect={() =>
                    run(() => navigate({ to: '/admin/users/$userId', params: { userId: u.id } }))
                  }
                >
                  <Users className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{u.name || u.email}</span>
                  <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {showSignOut && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem
                value="action:sign-out"
                onSelect={() => run(() => void signOut().then(() => navigate({ to: '/login' })))}
              >
                <LogOut className="size-4 text-muted-foreground" />
                Sign out
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
