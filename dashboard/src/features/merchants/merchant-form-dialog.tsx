import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { MerchantDto } from '@shared/dto/merchant';

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
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

interface FormState {
  name: string;
  email: string;
  phoneNumber: string;
  mpesaPaybillNumber: string;
  sasapayTillNumber: string;
  mpesaBalance: string;
  sasapayBalance: string;
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
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchant?: MerchantDto;
}

export function MerchantFormDialog({ open, onOpenChange, merchant }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted fresh each open, so the form resets without an effect. */}
        {open && <MerchantForm merchant={merchant} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MerchantForm({ merchant, onClose }: { merchant?: MerchantDto; onClose: () => void }) {
  const isEdit = Boolean(merchant);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(merchant));

  const mutation = useMutation({
    mutationFn: async () => {
      if (merchant) {
        return api.updateMerchant(merchant.id, {
          name: form.name,
          email: form.email || null,
          phoneNumber: form.phoneNumber || null,
          mpesaBalance: form.mpesaBalance || undefined,
          sasapayBalance: form.sasapayBalance || undefined,
        });
      }
      return api.createMerchant({
        name: form.name,
        email: form.email || undefined,
        phoneNumber: form.phoneNumber || undefined,
        mpesaPaybillNumber: form.mpesaPaybillNumber,
        sasapayTillNumber: form.sasapayTillNumber,
        mpesaBalance: form.mpesaBalance || undefined,
        sasapayBalance: form.sasapayBalance || undefined,
      });
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

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit merchant' : 'New merchant'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Update merchant details and balances.'
            : 'Create a merchant with its M-Pesa paybill and SasaPay till.'}
        </DialogDescription>
      </DialogHeader>

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
            disabled={isEdit}
            value={form.mpesaPaybillNumber}
            onChange={update('mpesaPaybillNumber')}
          />
        </Field>
        <Field label="SasaPay till" htmlFor="till">
          <Input
            id="till"
            required
            disabled={isEdit}
            value={form.sasapayTillNumber}
            onChange={update('sasapayTillNumber')}
          />
        </Field>
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

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="merchant-form" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? 'Save changes' : 'Create merchant'}
        </Button>
      </DialogFooter>
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
