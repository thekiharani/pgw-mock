import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { MerchantCapability, MerchantDto, ShortcodeKind } from '@shared/dto/merchant';

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
import { cn } from '@/lib/utils';

const ALL_CAPABILITIES: { value: MerchantCapability; label: string; hint: string }[] = [
  { value: 'c2b', label: 'C2B', hint: 'Customer → business (STK, paybill, QR)' },
  { value: 'b2c', label: 'B2C', hint: 'Business → customer payouts' },
  { value: 'b2b', label: 'B2B', hint: 'Business → business transfers' },
];

interface FormState {
  name: string;
  email: string;
  phoneNumber: string;
  mpesaPaybillNumber: string;
  sasapayTillNumber: string;
  mpesaBalance: string;
  sasapayBalance: string;
  shortcodeKind: ShortcodeKind;
  capabilities: MerchantCapability[];
}

function initialState(merchant?: MerchantDto): FormState {
  return {
    name: merchant?.name ?? '',
    email: merchant?.email ?? '',
    phoneNumber: merchant?.phoneNumber ?? '',
    mpesaPaybillNumber: merchant?.mpesaPaybillNumber ?? '',
    sasapayTillNumber: merchant?.sasapayTillNumber ?? '',
    mpesaBalance: merchant?.mpesaBalance ?? '',
    sasapayBalance: merchant?.sasapayBalance ?? '',
    shortcodeKind: merchant?.shortcodeKind ?? 'PAYBILL',
    capabilities: merchant?.capabilities ?? ['c2b', 'b2c', 'b2b'],
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchant?: MerchantDto;
}

export function MerchantFormSheet({ open, onOpenChange, merchant }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0">
        {/* Mounted fresh each open, so the form resets without an effect. */}
        {open && <MerchantForm merchant={merchant} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function MerchantForm({ merchant, onClose }: { merchant?: MerchantDto; onClose: () => void }) {
  const isEdit = Boolean(merchant);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(merchant));

  const mutation = useMutation({
    mutationFn: async () => {
      const common = {
        name: form.name,
        email: form.email || null,
        phoneNumber: form.phoneNumber || null,
        mpesaPaybillNumber: form.mpesaPaybillNumber,
        sasapayTillNumber: form.sasapayTillNumber,
        mpesaBalance: form.mpesaBalance || undefined,
        sasapayBalance: form.sasapayBalance || undefined,
        shortcodeKind: form.shortcodeKind,
        capabilities: form.capabilities,
      };
      if (merchant) return api.updateMerchant(merchant.id, common);
      return api.createMerchant(common);
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Merchant updated' : 'Merchant created');
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      queryClient.invalidateQueries({ queryKey: ['merchant', saved.id] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function update(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function toggleCapability(value: MerchantCapability) {
    setForm((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(value)
        ? prev.capabilities.filter((c) => c !== value)
        : [...prev.capabilities, value],
    }));
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Edit merchant' : 'New merchant'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Update merchant details, shortcode, capabilities, and balances.'
            : 'Create a merchant with its M-Pesa paybill and SasaPay till.'}
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <form
          id="merchant-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <Field className="sm:col-span-2" label="Name" htmlFor="name">
            <Input id="name" required value={form.name} onChange={update('name')} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={form.email} onChange={update('email')} />
          </Field>
          <Field label="Phone number" htmlFor="phone">
            <Input id="phone" value={form.phoneNumber} onChange={update('phoneNumber')} />
          </Field>
          <Field label="M-Pesa paybill" htmlFor="paybill">
            <Input
              id="paybill"
              required
              value={form.mpesaPaybillNumber}
              onChange={update('mpesaPaybillNumber')}
            />
          </Field>
          <Field label="SasaPay till" htmlFor="till">
            <Input
              id="till"
              required
              value={form.sasapayTillNumber}
              onChange={update('sasapayTillNumber')}
            />
          </Field>

          <Field className="sm:col-span-2" label="Shortcode type" htmlFor="kind">
            <Select
              value={form.shortcodeKind}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, shortcodeKind: v as ShortcodeKind }))
              }
            >
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PAYBILL">Paybill (CustomerPayBillOnline)</SelectItem>
                <SelectItem value="TILL">Till / Buy Goods (CustomerBuyGoodsOnline)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Capabilities</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {ALL_CAPABILITIES.map((cap) => {
                const on = form.capabilities.includes(cap.value);
                return (
                  <button
                    key={cap.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCapability(cap.value)}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-lg border p-3 text-left text-sm transition-colors',
                      on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
                    )}
                  >
                    <span className="font-medium">{cap.label}</span>
                    <span className="text-xs text-muted-foreground">{cap.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="M-Pesa balance" htmlFor="mbal">
            <Input
              id="mbal"
              inputMode="decimal"
              value={form.mpesaBalance}
              onChange={update('mpesaBalance')}
            />
          </Field>
          <Field label="SasaPay balance" htmlFor="sbal">
            <Input
              id="sbal"
              inputMode="decimal"
              value={form.sasapayBalance}
              onChange={update('sasapayBalance')}
            />
          </Field>
        </form>
      </SheetBody>

      <SheetFooter>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="merchant-form" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? 'Save changes' : 'Create merchant'}
        </Button>
      </SheetFooter>
    </>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
