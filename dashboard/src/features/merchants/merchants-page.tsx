import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Building2, Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { RoleBadge } from '@/components/role-badge';
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
import { usePlatformAdmin } from '@/lib/auth-client';
import { formatMoney } from '@/lib/utils';
import { MerchantFormDialog } from '@/features/merchants/merchant-form-dialog';

const PAGE_SIZE = 20;

export function MerchantsPage() {
  const navigate = useNavigate();
  const isAdmin = usePlatformAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['merchants', page, query],
    queryFn: () => api.listMerchants({ page, pageSize: PAGE_SIZE, q: query || undefined }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const cols = isAdmin ? 5 : 6;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Merchants</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? `Viewing all merchants · platform admin${data ? ` · ${data.total} total` : ''}`
              : data
                ? `${data.total} ${data.total === 1 ? 'merchant' : 'merchants'} you can access`
                : 'Paybills & tills assigned to you'}
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
              {!isAdmin && <TableHead>Your role</TableHead>}
              <TableHead className="text-right">M-Pesa</TableHead>
              <TableHead className="text-right">SasaPay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: cols }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isError && (
              <TableRow>
                <TableCell colSpan={cols} className="py-10 text-center text-sm text-destructive">
                  {(error as Error).message}
                </TableCell>
              </TableRow>
            )}

            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols} className="py-16 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
                    <Building2 className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">
                      {query ? 'No merchants match your search' : 'No merchants yet'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {query
                        ? 'Try a different name, paybill, or till.'
                        : 'Create a merchant to get a paybill & till — you’ll be its owner.'}
                    </p>
                    {!query && (
                      <Button className="mt-1" size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="size-4" />
                        New merchant
                      </Button>
                    )}
                  </div>
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
                {!isAdmin && (
                  <TableCell>{merchant.myRole && <RoleBadge role={merchant.myRole} />}</TableCell>
                )}
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
