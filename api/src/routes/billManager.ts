import type { FastifyInstance, FastifyRequest } from 'fastify';

import { invoices, optIns } from '@/routes/stores.js';

type Body = Record<string, unknown>;

function jsonBody(request: FastifyRequest): Body {
  const ct = request.headers['content-type'] ?? '';
  if (ct.includes('application/json') && request.body && typeof request.body === 'object') {
    return request.body as Body;
  }
  return {};
}

function invoiceNumberOf(body: Body): string | null {
  const value =
    body.invoiceNumber || body.InvoiceNumber || body.billReferenceNumber || body.externalReference;
  return value ? String(value).trim() : null;
}

function amountOf(body: Body): unknown {
  return body.amount ?? body.Amount ?? body.invoiceAmount ?? null;
}

function shortcodeOf(body: Body): string | null {
  const value = body.shortcode || body.ShortCode || body.shortCode;
  return value ? String(value).trim() : null;
}

export async function billManagerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/optin', async (request) => {
    const body = jsonBody(request);
    const sc = shortcodeOf(body);
    if (!sc) {
      return { app_status_code: 400, rescode: '400', resmsg: 'shortcode is required' };
    }
    optIns.set(sc, { ...body, status: 'OPTED_IN' });
    return { app_status_code: 200, rescode: '200', resmsg: 'Success', shortcode: sc };
  });

  app.post('/change-optin-details', async (request) => {
    const body = jsonBody(request);
    const sc = shortcodeOf(body);
    if (!sc || !optIns.has(sc)) {
      return { app_status_code: 404, rescode: '404', resmsg: 'Shortcode not opted-in' };
    }
    optIns.set(sc, { ...optIns.get(sc), ...body });
    return { app_status_code: 200, rescode: '200', resmsg: 'Success' };
  });

  app.post('/single-invoicing', async (request) => {
    const body = jsonBody(request);
    const invoiceNumber = invoiceNumberOf(body);
    if (!invoiceNumber || amountOf(body) === null) {
      return {
        Status_Code: 400,
        Status: 'Failed',
        Message: 'externalReference and amount are required.',
      };
    }
    invoices.set(invoiceNumber, { ...body, invoiceNumber, status: 'ISSUED' });
    return {
      Status_Code: 200,
      Status: 'Success',
      Message: 'Invoice sent successfully.',
      rescode: '200',
      resmsg: 'Invoice sent successfully.',
      invoiceNumber,
    };
  });

  app.post('/bulk-invoicing', async (request) => {
    const body = jsonBody(request);
    const list: unknown[] = Array.isArray(body.invoices) ? body.invoices : [];
    if (list.length === 0) {
      return { Status_Code: 400, Status: 'Failed', Message: 'invoices array is required.' };
    }
    const accepted: string[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const inv = item as Body;
      const invoiceNumber = invoiceNumberOf(inv);
      if (!invoiceNumber || amountOf(inv) === null) continue;
      invoices.set(invoiceNumber, { ...inv, invoiceNumber, status: 'ISSUED' });
      accepted.push(invoiceNumber);
    }
    return {
      Status_Code: accepted.length ? 200 : 400,
      Status: accepted.length ? 'Success' : 'Failed',
      Message: `${accepted.length} invoices accepted.`,
      acceptedInvoices: accepted,
    };
  });

  app.post('/change-invoice', async (request) => {
    const body = jsonBody(request);
    const invoiceNumber = invoiceNumberOf(body);
    if (!invoiceNumber || !invoices.has(invoiceNumber)) {
      return { rescode: '404', resmsg: 'Invoice not found.', invoiceNumber };
    }
    const invoice = invoices.get(invoiceNumber)!;
    if (invoice.status === 'CANCELLED') {
      return { rescode: '409', resmsg: 'Cancelled invoice cannot be updated.', invoiceNumber };
    }
    Object.assign(invoice, body);
    invoice.status = 'UPDATED';
    return { rescode: '0', resmsg: 'Invoice updated successfully.', invoiceNumber };
  });

  app.post('/change-invoices', async (request) => {
    const body = jsonBody(request);
    const list: unknown[] = Array.isArray(body.invoices) ? body.invoices : [];
    if (list.length === 0) {
      return { Status_Code: 400, Status: 'Failed', Message: 'invoices array is required.' };
    }
    const updated: string[] = [];
    const notFound: string[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const inv = item as Body;
      const invoiceNumber = invoiceNumberOf(inv);
      if (!invoiceNumber || !invoices.has(invoiceNumber)) {
        if (invoiceNumber) notFound.push(invoiceNumber);
        continue;
      }
      const invoice = invoices.get(invoiceNumber)!;
      if (invoice.status === 'CANCELLED') continue;
      Object.assign(invoice, inv);
      invoice.status = 'UPDATED';
      updated.push(invoiceNumber);
    }
    return {
      Status_Code: updated.length ? 200 : 400,
      Status: updated.length ? 'Success' : 'Failed',
      Message: `${updated.length} invoices updated.`,
      updatedInvoices: updated,
      notFound,
    };
  });

  app.post('/cancel-single-invoice', async (request) => {
    const body = jsonBody(request);
    const invoiceNumber = invoiceNumberOf(body);
    if (!invoiceNumber || !invoices.has(invoiceNumber)) {
      return { rescode: '404', resmsg: 'Invoice not found.', invoiceNumber };
    }
    const invoice = invoices.get(invoiceNumber)!;
    if (invoice.status === 'CANCELLED') {
      return { rescode: '409', resmsg: 'Invoice already cancelled.', invoiceNumber };
    }
    invoice.status = 'CANCELLED';
    return { rescode: '0', resmsg: 'Invoice cancelled successfully.', invoiceNumber };
  });

  app.post('/cancel-bulk-invoice', async (request) => {
    const body = jsonBody(request);
    const source = body.invoices ?? body.externalReferences;
    const list: unknown[] = Array.isArray(source) ? source : [];
    const cancelled: string[] = [];
    const notFound: string[] = [];
    for (const raw of list) {
      const ref =
        raw && typeof raw === 'object'
          ? String((raw as Body).externalReference ?? (raw as Body).invoiceNumber ?? '').trim()
          : String(raw).trim();
      if (!ref) continue;
      if (invoices.has(ref)) {
        invoices.get(ref)!.status = 'CANCELLED';
        cancelled.push(ref);
      } else {
        notFound.push(ref);
      }
    }
    return {
      Status_Code: cancelled.length ? 200 : 404,
      Status: cancelled.length ? 'Success' : 'Failed',
      cancelled,
      notFound,
    };
  });

  app.post('/reconciliation', async (request) => {
    const body = jsonBody(request);
    return {
      Status_Code: 200,
      Status: 'Success',
      Message: 'Reconciliation acknowledged.',
      echo: body,
    };
  });
}
