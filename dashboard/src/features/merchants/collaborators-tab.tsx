import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, LogOut, Mail, MoreVertical, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { InvitationDto, MemberDto, MerchantRole } from '@shared/dto/member';

import { Avatar, AvatarFallback, initials } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RoleBadge } from '@/components/role-badge';
import { api } from '@/lib/api';
import { ROLE_OPTIONS, ROLE_RANK as RANK } from '@/lib/roles';
import { formatDateTime } from '@/lib/utils';

export function CollaboratorsTab({ merchantId }: { merchantId: string }) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['members', merchantId],
    queryFn: () => api.getMembers(merchantId),
  });

  const myRole = data?.myRole;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const canManageOwners = myRole === 'owner';

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['members', merchantId] });
  }

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MerchantRole }) =>
      api.updateMemberRole(merchantId, userId, role),
    onSuccess: () => {
      toast.success('Role updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.removeMember(merchantId, userId),
    onSuccess: (_r, userId) => {
      toast.success(
        data?.members.find((m) => m.userId === userId)?.isYou ? 'You left' : 'Member removed',
      );
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInvite = useMutation({
    mutationFn: (invitationId: string) => api.revokeInvitation(merchantId, invitationId),
    onSuccess: () => {
      toast.success('Invitation revoked');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">{(error as Error)?.message ?? 'Failed to load'}</p>
    );
  }

  // Whether the current user may act on a given member's role.
  function canActOn(member: MemberDto): boolean {
    if (!canManage) return false;
    if (member.role === 'owner' || member.role === 'admin') return canManageOwners;
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Collaborators</h2>
          <p className="text-sm text-muted-foreground">
            People with access to this merchant’s paybill &amp; till.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" />
            Invite
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <ul className="divide-y">
          {data.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 p-3">
              <Avatar>
                <AvatarFallback>{initials(member.name || member.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{member.name || member.email}</span>
                  {member.isYou && <span className="text-xs text-muted-foreground">(you)</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{member.email}</div>
              </div>
              <RoleBadge role={member.role} />
              <MemberActions
                member={member}
                canActOn={canActOn(member)}
                canManageOwners={canManageOwners}
                onChangeRole={(role) => updateRole.mutate({ userId: member.userId, role })}
                onRemove={() => removeMember.mutate(member.userId)}
              />
            </li>
          ))}
        </ul>
      </div>

      {data.invitations.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">Pending invitations</h3>
          <div className="overflow-hidden rounded-xl border">
            <ul className="divide-y">
              {data.invitations.map((inv) => (
                <PendingInvite
                  key={inv.id}
                  invite={inv}
                  canManage={canManage}
                  onRevoke={() => revokeInvite.mutate(inv.id)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        merchantId={merchantId}
        canInviteElevated={canManageOwners}
        onInvited={invalidate}
      />
    </div>
  );
}

function MemberActions({
  member,
  canActOn,
  canManageOwners,
  onChangeRole,
  onRemove,
}: {
  member: MemberDto;
  canActOn: boolean;
  canManageOwners: boolean;
  onChangeRole: (role: MerchantRole) => void;
  onRemove: () => void;
}) {
  // Always allow leaving for yourself, even without management rights.
  if (!canActOn && !member.isYou) return <div className="w-9" />;

  const assignable = ROLE_OPTIONS.filter((o) => canManageOwners || RANK[o.value] <= RANK['member']);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Member actions">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canActOn && (
          <>
            <DropdownMenuLabel>Change role</DropdownMenuLabel>
            {assignable.map((o) => (
              <DropdownMenuItem
                key={o.value}
                disabled={o.value === member.role}
                onSelect={() => onChangeRole(o.value)}
              >
                <RoleBadge role={o.value} showIcon={false} />
                <span className="text-xs text-muted-foreground">{o.hint}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onRemove}>
          {member.isYou ? <LogOut className="size-4" /> : <Trash2 className="size-4" />}
          {member.isYou ? 'Leave merchant' : 'Remove'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PendingInvite({
  invite,
  canManage,
  onRevoke,
}: {
  invite: InvitationDto;
  canManage: boolean;
  onRevoke: () => void;
}) {
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Mail className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{invite.email}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          Invited {formatDateTime(invite.createdAt)}
          {invite.invitedByName ? ` by ${invite.invitedByName}` : ''}
        </div>
      </div>
      <RoleBadge role={invite.role} />
      {canManage && (
        <Button variant="ghost" size="sm" onClick={onRevoke}>
          Revoke
        </Button>
      )}
    </li>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  merchantId,
  canInviteElevated,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantId: string;
  canInviteElevated: boolean;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MerchantRole>('member');

  const options = ROLE_OPTIONS.filter((o) => canInviteElevated || RANK[o.value] <= RANK['member']);

  const invite = useMutation({
    mutationFn: () => api.invite(merchantId, { email: email.trim(), role }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email.trim()}`);
      setEmail('');
      setRole('member');
      onOpenChange(false);
      onInvited();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a collaborator</DialogTitle>
          <DialogDescription>
            They’ll get an email link to join this merchant. New users can sign in with a one-time
            code.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              autoFocus
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MerchantRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="font-medium">{o.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={invite.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
