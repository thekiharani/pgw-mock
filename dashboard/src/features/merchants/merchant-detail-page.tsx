import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { MerchantDto } from '@shared/dto/merchant';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { MerchantFormDialog } from '@/features/merchants/merchant-form-dialog';

export function MerchantDetailPage() {
  const { merchantId } = useParams({ strict: false }) as { merchantId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: merchant,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['merchant', merchantId],
    queryFn: () => api.getMerchant(merchantId),
  });

  const rotateMpesa = useMutation({
    mutationFn: () => api.rotateMpesa(merchantId),
    onSuccess: () => {
      toast.success('M-Pesa credentials rotated');
      queryClient.invalidateQueries({ queryKey: ['merchant', merchantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotateSasapay = useMutation({
    mutationFn: () => api.rotateSasapay(merchantId),
    onSuccess: () => {
      toast.success('SasaPay credentials rotated');
      queryClient.invalidateQueries({ queryKey: ['merchant', merchantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteMerchant(merchantId),
    onSuccess: () => {
      toast.success('Merchant deleted');
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      navigate({ to: '/merchants' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <DetailSkeleton />;
  if (isError || !merchant) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-sm text-destructive">{(error as Error)?.message ?? 'Not found'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{merchant.name}</h1>
          <p className="text-sm text-muted-foreground">
            {merchant.email ?? 'No email'} · {merchant.phoneNumber ?? 'No phone'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BalanceCard
          title="M-Pesa balance"
          badge={merchant.mpesaPaybillNumber}
          value={merchant.mpesaBalance}
        />
        <BalanceCard
          title="SasaPay balance"
          badge={merchant.sasapayTillNumber}
          value={merchant.sasapayBalance}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">M-Pesa (Daraja) credentials</CardTitle>
          <RotateButton pending={rotateMpesa.isPending} onClick={() => rotateMpesa.mutate()} />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CredentialField label="Consumer key" value={merchant.mpesaConsumerKey} />
          <CredentialField label="Consumer secret" value={merchant.mpesaConsumerSecret} secret />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">SasaPay credentials</CardTitle>
          <RotateButton pending={rotateSasapay.isPending} onClick={() => rotateSasapay.mutate()} />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CredentialField label="Client ID" value={merchant.sasapayClientId} />
          <CredentialField label="Client secret" value={merchant.sasapayClientSecret} secret />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Created {formatDateTime(merchant.createdAt)} · Updated {formatDateTime(merchant.updatedAt)}
      </p>

      <MerchantFormDialog open={editOpen} onOpenChange={setEditOpen} merchant={merchant} />
      <ConfirmDelete
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        merchant={merchant}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/merchants"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to merchants
    </Link>
  );
}

function BalanceCard({ title, badge, value }: { title: string; badge: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Badge variant="secondary">{badge}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">KES {formatMoney(value)}</div>
      </CardContent>
    </Card>
  );
}

function RotateButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      Rotate
    </Button>
  );
}

function CredentialField({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string | null;
  secret?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(false), 1200);
  }

  const display = !value
    ? '—'
    : secret && !revealed
      ? '•'.repeat(Math.min(24, value.length))
      : value;

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <code className="block truncate font-mono text-sm">{display}</code>
      </div>
      {secret && value && (
        <Button variant="ghost" size="icon" onClick={() => setRevealed((r) => !r)}>
          {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={copy} disabled={!value}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

function ConfirmDelete({
  open,
  onOpenChange,
  merchant,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchant: MerchantDto;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete merchant</DialogTitle>
          <DialogDescription>
            Soft-delete <span className="font-medium text-foreground">{merchant.name}</span>? It
            will no longer appear in the console.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
