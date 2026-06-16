import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AdminUserDto, PlatformRole } from '@shared/dto/admin';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Omit to create a new user; pass a user to edit it.
  user?: AdminUserDto;
  onSaved?: (user: AdminUserDto) => void;
}

export function UserFormSheet({ open, onOpenChange, user, onSaved }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className="p-0">
        {open && <UserForm user={user} onClose={() => onOpenChange(false)} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  );
}

function UserForm({
  user,
  onClose,
  onSaved,
}: {
  user?: AdminUserDto;
  onClose: () => void;
  onSaved?: (user: AdminUserDto) => void;
}) {
  const isEdit = Boolean(user);
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<PlatformRole>(user?.role ?? 'user');

  const save = useMutation({
    mutationFn: async (): Promise<AdminUserDto> => {
      if (user) {
        await api.adminUpdateUser(user.id, { name: name.trim(), email: email.trim() });
        return { ...user, name: name.trim(), email: email.trim() };
      }
      return api.adminCreateUser({ name: name.trim(), email: email.trim(), role });
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? 'User updated' : 'User created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['admin', 'user', saved.id] });
      onClose();
      onSaved?.(saved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && !save.isPending;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Edit user' : 'New user'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Update this user’s name and email.'
            : 'Creates a console account. They sign in with an email one-time code — no password.'}
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <form
          id="user-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label>Platform role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as PlatformRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Platform admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </form>
      </SheetBody>

      <SheetFooter>
        <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="user-form" disabled={!canSubmit}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? 'Save changes' : 'Create user'}
        </Button>
      </SheetFooter>
    </>
  );
}
