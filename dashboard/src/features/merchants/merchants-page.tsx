import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';

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
import { formatMoney } from '@/lib/utils';
import { MerchantFormDialog } from '@/features/merchants/merchant-form-dialog';

const PAGE_SIZE = 20;

export function MerchantsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['merchants', page, query],
    queryFn: () => api.listMerchants({ page, pageSize: PAGE_SIZE, q: query || undefined }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merchants</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} total` : 'Manage merchants and their gateway credentials'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New merchant
        </Button>
      </div>

      <form
        className="flex max-w-sm items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, email, paybill, till…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Paybill</TableHead>
              <TableHead>Till</TableHead>
              <TableHead className="text-right">M-Pesa</TableHead>
              <TableHead className="text-right">SasaPay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isError && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            )}

            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No merchants found.
                </TableCell>
              </TableRow>
            )}

            {data?.data.map((merchant) => (
              <TableRow
                key={merchant.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({ to: '/merchants/$merchantId', params: { merchantId: merchant.id } })
                }
              >
                <TableCell className="font-medium">
                  {merchant.name}
                  {merchant.email && (
                    <div className="text-xs text-muted-foreground">{merchant.email}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{merchant.mpesaPaybillNumber}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{merchant.sasapayTillNumber}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(merchant.mpesaBalance)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(merchant.sasapayBalance)}
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

      <MerchantFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
