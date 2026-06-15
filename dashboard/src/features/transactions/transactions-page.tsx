import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { TransactionDto } from '@shared/dto/transaction';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/utils';

const PAGE_SIZE = 25;

function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  const s = status.toUpperCase();
  if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'PAID'].includes(s)) return 'success';
  if (['PENDING', 'PROCESSING', 'STAGED'].includes(s)) return 'warning';
  if (['FAILED', 'CANCELLED', 'CANCELED', 'REVERSED', 'DECLINED'].includes(s)) return 'destructive';
  return 'secondary';
}

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: '', gateway: '', status: '' });
  const [filters, setFilters] = useState({ q: '', gateway: '', status: '' });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['transactions', page, filters],
    queryFn: () =>
      api.listTransactions({
        page,
        pageSize: PAGE_SIZE,
        q: filters.q || undefined,
        gateway: filters.gateway || undefined,
        status: filters.status || undefined,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} total` : 'Mock gateway transaction ledger'}
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilters({ ...draft });
        }}
      >
        <Input
          className="w-56"
          placeholder="Code or reference…"
          value={draft.q}
          onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
        />
        <Input
          className="w-36"
          placeholder="Gateway"
          value={draft.gateway}
          onChange={(e) => setDraft((d) => ({ ...d, gateway: e.target.value }))}
        />
        <Input
          className="w-36"
          placeholder="Status"
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Gateway</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isError && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            )}

            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            )}

            {data?.data.map((tx: TransactionDto) => (
              <TableRow key={tx.id}>
                <TableCell className="font-mono text-xs">{tx.transactionCode}</TableCell>
                <TableCell>
                  <Badge variant="outline">{tx.gateway}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{tx.category}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(tx.amount)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(tx.status)}>{tx.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(tx.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
