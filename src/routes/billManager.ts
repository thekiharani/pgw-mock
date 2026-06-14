/** Daraja Bill Manager. Mirrors app/routes/bill_manager.py. Mounted at /v1/billmanager-invoice. */
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { invoices, optIns } from '@/routes/stores.js';

function jsonBody(request: FastifyRequest): Record<string, any> {
  const ct = request.headers['content-type'] ?? '';
  if (ct.includes('application/json') && request.body && typeof request.body === 'object') {
    return request.body as Record<string, any>;
  }
  return {};
}

function invoiceNumberOf(body: Record<string, any>): string | null {
  const value =
    body.invoiceNumber || body.InvoiceNumber || body.billReferenceNumber || body.externalReference;
  return value ? String(value).trim() : null;
}

function amountOf(body: Record<string, any>): any {
  return body.amount ?? body.Amount ?? body.invoiceAmount ?? null;
}

function shortcodeOf(body: Record<string, any>): string | null {
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

  app.post('/change-billing-info', async (request) => {
    const body = jsonBody(request);
    const sc = shortcodeOf(body);
    if (!sc || !optIns.has(sc)) {
      return { app_status_code: 404, rescode: '404', resmsg: 'Shortcode not opted-in' };
    }
    const entry = optIns.get(sc)!;
    entry.billing_info = { ...(entry.billing_info ?? {}), ...body };
    return { app_status_code: 200, rescode: '200', resmsg: 'Success' };
  });

  app.post('/invoices/create', async (request) => {
    const body = jsonBody(request);
    const invoiceNumber = invoiceNumberOf(body);
    if (!invoiceNumber || amountOf(body) === null) {
      return { rescode: '400', resmsg: 'invoiceNumber and amount are required.' };
    }
    if (invoices.has(invoiceNumber)) {
      return { rescode: '409', resmsg: 'Invoice already exists.', invoiceNumber };
    }
    invoices.set(invoiceNumber, { ...body, invoiceNumber, status: 'CREATED' });
    return { rescode: '0', resmsg: 'Invoice created successfully.', invoiceNumber };
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
    const list = body.invoices ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return { Status_Code: 400, Status: 'Failed', Message: 'invoices array is required.' };
    }
    const accepted: string[] = [];
    for (const inv of list) {
      if (!inv || typeof inv !== 'object') continue;
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

  app.post('/invoices/update', async (request) => {
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

  const cancelHandler = async (request: FastifyRequest) => {
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
  };
  app.post('/invoices/cancel', cancelHandler);
  app.post('/cancel-single-invoice', cancelHandler);

  app.post('/bulk-cancel-invoice', async (request) => {
    const body = jsonBody(request);
    const list = body.invoices ?? body.externalReferences ?? [];
    const cancelled: string[] = [];
    const notFound: string[] = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const ref =
        raw && typeof raw === 'object'
          ? raw.externalReference || raw.invoiceNumber
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

  app.post('/invoices/status', async (request) => {
    const body = jsonBody(request);
    const invoiceNumber = invoiceNumberOf(body);
    const invoice = invoices.get(invoiceNumber ?? '');
    if (!invoice) {
      return { rescode: '404', resmsg: 'Invoice not found.', invoiceNumber };
    }
    return {
      rescode: '0',
      resmsg: 'Invoice status fetched successfully.',
      invoiceNumber,
      status: invoice.status,
    };
  });

  app.post('/payments-reconciliation', async (request) => {
    const body = jsonBody(request);
    return {
      Status_Code: 200,
      Status: 'Success',
      Message: 'Reconciliation acknowledged.',
      echo: body,
    };
  });

  // Permissive fallback so undocumented Bill Manager paths don't 404 in dev.
  app.post('/*', async (request) => {
    const body = jsonBody(request);
    const path = (request.params as Record<string, string>)['*'];
    app.log.info(`Bill Manager fallback received: /${path} body=${JSON.stringify(body)}`);
    return { rescode: '0', resmsg: 'Request received successfully.' };
  });
}
