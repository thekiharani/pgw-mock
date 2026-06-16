import { MoreHorizontal, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  // Draw a divider above this item (e.g. before a destructive action).
  separatorBefore?: boolean;
  // Omit the action entirely (e.g. when the caller lacks permission).
  hidden?: boolean;
}

interface Props {
  actions: RowAction[];
  label?: string;
  align?: 'start' | 'end';
}

// The "⋯" overflow menu used on every table row. Stops click propagation so
// it works inside rows that are themselves clickable (e.g. navigate-on-row).
export function RowActions({ actions, label = 'Actions', align = 'end' }: Props) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} onClick={(e) => e.stopPropagation()}>
        {visible.map((action, i) => (
          <div key={action.label}>
            {action.separatorBefore && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={action.disabled}
              className={cn(action.destructive && 'text-destructive focus:text-destructive')}
              onSelect={action.onSelect}
            >
              {action.icon && <action.icon className="size-4" />}
              {action.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
