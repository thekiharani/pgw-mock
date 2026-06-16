import type { MerchantRole } from '@shared/dto/member';
import { Crown, Eye, ShieldCheck, UserCog } from 'lucide-react';

import { cn } from '@/lib/utils';

const ROLE_META: Record<MerchantRole, { label: string; className: string; icon: typeof Crown }> = {
  owner: {
    label: 'Owner',
    className: 'bg-warning/15 text-warning border-warning/20',
    icon: Crown,
  },
  admin: {
    label: 'Admin',
    className: 'bg-primary/15 text-foreground border-primary/20',
    icon: ShieldCheck,
  },
  member: {
    label: 'Member',
    className: 'bg-success/15 text-success border-success/20',
    icon: UserCog,
  },
  viewer: {
    label: 'Viewer',
    className: 'bg-muted text-muted-foreground border-transparent',
    icon: Eye,
  },
};

export function RoleBadge({
  role,
  className,
  showIcon = true,
}: {
  role: MerchantRole;
  className?: string;
  showIcon?: boolean;
}) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        meta.className,
        className,
      )}
    >
      {showIcon && <Icon className="size-3" />}
      {meta.label}
    </span>
  );
}
