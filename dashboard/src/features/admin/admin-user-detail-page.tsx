import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AdminUserDto } from '@shared/dto/admin';
import type { MerchantRole } from '@shared/dto/member';

import { Avatar, AvatarFallback, initials } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { ROLE_OPTIONS } from '@/lib/roles';

export function AdminUserDetailPage() {
  const { userId } = useParams({ strict: false }) as { userId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.adminGetUser(userId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }

  const setRole = useMutation({
    mutationFn: (role: 'user' | 'admin') => api.adminSetPlatformRole(userId, role),
    onSuccess: () => {
      toast.success('Platform role updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeAccess = useMutation({
    mutationFn: ({ merchantId, role }: { merchantId: string; role: MerchantRole }) =>
      api.adminGrantAccess(userId, merchantId, role),
    onSuccess: () => {
      toast.success('Access updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (merchantId: string) => api.adminRevokeAccess(userId, merchantId),
    onSuccess: () => {
      toast.success('Access revoked');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeUser = useMutation({
    mutationFn: () => api.adminDeleteUser(userId),
    onSuccess: () => {
      toast.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      navigate({ to: '/admin/users' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-sm text-destructive">{(error as Error)?.message ?? 'Not found'}</p>
      </div>
    );
  }

  const { user, memberships } = data;
  const isAdminRole = user.role === 'admin';

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback>{initials(user.name || user.email)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{user.name || user.email}</h1>
              {isAdminRole ? (
                <Badge className="gap-1">
                  <ShieldCheck className="size-3" />
                  Admin
                </Badge>
              ) : (
                <Badge variant="secondary">User</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button
            variant={isAdminRole ? 'outline' : 'default'}
            onClick={() => setRole.mutate(isAdminRole ? 'user' : 'admin')}
            disabled={setRole.isPending}
          >
            {setRole.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isAdminRole ? (
              <ShieldOff className="size-4" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {isAdminRole ? 'Revoke platform admin' : 'Make platform admin'}
          </Button>
          <Button variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4 text-destructive" />
            Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Merchant access</h2>
          <Button size="sm" onClick={() => setGrantOpen(true)}>
            <Plus className="size-4" />
            Grant access
          </Button>
        </div>

        {isAdminRole && (
          <p className="text-sm text-muted-foreground">
            As a platform admin this user can already see every merchant. These are explicit
            memberships.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border">
          {memberships.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No merchant memberships yet.
            </p>
          ) : (
            <ul className="divide-y">
              {memberships.map((m) => (
                <li key={m.merchantId} className="flex items-center gap-3 p-3">
                  <Link
                    to="/merchants/$merchantId"
                    params={{ merchantId: m.merchantId }}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {m.merchantName}
                  </Link>
                  <Select
                    value={m.role}
                    onValueChange={(role) =>
                      changeAccess.mutate({ merchantId: m.merchantId, role: role as MerchantRole })
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => revoke.mutate(m.merchantId)}
                    aria-label="Revoke access"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <GrantAccessDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        existingMerchantIds={new Set(memberships.map((m) => m.merchantId))}
        onGrant={(merchantId, role) => {
          changeAccess.mutate({ merchantId, role });
          setGrantOpen(false);
        }}
      />

      <EditUserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        user={user}
        onSaved={() => {
          setEditOpen(false);
          invalidate();
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              Permanently delete <span className="font-medium">{user.email}</span>. This removes
              their sessions and merchant memberships. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeUser.mutate()}
              disabled={removeUser.isPending}
            >
              {removeUser.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditUserDialog({
  open,
  onOpenChange,
  user,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUserDto;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);

  const save = useMutation({
    mutationFn: () => api.adminUpdateUser(user.id, { name: name.trim(), email: email.trim() }),
    onSuccess: () => {
      toast.success('User updated');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reset fields whenever a different user (or a fresh open) flows in.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(user.name);
      setEmail(user.email);
    }
    onOpenChange(next);
  }

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update this user’s name and email.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <DialogFooter>
            <Button type="submit" disabled={!canSubmit}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GrantAccessDialog({
  open,
  onOpenChange,
  existingMerchantIds,
  onGrant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingMerchantIds: Set<string>;
  onGrant: (merchantId: string, role: MerchantRole) => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<MerchantRole>('member');

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'grant-search', query],
    queryFn: () => api.listMerchants({ pageSize: 8, q: query || undefined }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Grant merchant access</DialogTitle>
          <DialogDescription>Search a merchant, pick a role, and grant access.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name, paybill, till…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setQuery(search.trim());
                  }
                }}
              />
            </div>
            <Select value={role} onValueChange={(v) => setRole(v as MerchantRole)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border">
            {isFetching && (
              <p className="p-4 text-center text-sm text-muted-foreground">Searching…</p>
            )}
            {!isFetching && data?.data.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No merchants found.</p>
            )}
            <ul className="divide-y">
              {data?.data.map((m) => {
                const already = existingMerchantIds.has(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-2 p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.mpesaPaybillNumber} · {m.sasapayTillNumber}
                      </div>
                    </div>
                    {already ? (
                      <span className="text-xs text-muted-foreground">Member</span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => onGrant(m.id, role)}>
                        Grant {role}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BackLink() {
  return (
    <Link
      to="/admin/users"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to users
    </Link>
  );
}
