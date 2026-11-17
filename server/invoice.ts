import nodemailer from 'nodemailer';
import {
  resolveEffectiveWhatsappCredentials,
  type DatabaseSchema,
  type StoredUser,
} from './db.ts';
import type { Order, PortalSettings } from '../src/types/lms.ts';
import {
  buildWhatsAppBillText,
  buildWhatsAppUrl,
  money,
  normalizeWhatsAppDigits,
} from '../src/utils/lms.ts';

function escHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getNextInvoiceMeta(orders: Order[]): {
  serial: number;
  invoiceNumber: string;
} {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  let paidInvoicedCount = 0;
  for (const o of orders) {
    if (o.status !== 'PAID') continue;
    if (o.invoiceSerial && o.invoiceSerial > maxSeq) {
      maxSeq = o.invoiceSerial;
    }
    if (o.invoiceNumber) {
      paidInvoicedCount += 1;
      const match = o.invoiceNumber.match(/(\d+)$/);
      if (match) {
        maxSeq = Math.max(maxSeq, Number(match[1]) || 0);
      }
    }
  }
  const nextSeq = Math.max(maxSeq + 1, paidInvoicedCount + 1);
  return {
    serial: nextSeq,
    invoiceNumber: `ATP-${year}-${String(nextSeq).padStart(4, '0')}`,
  };
}

export function generateInvoiceNumber(orders: Order[]): string {
  return getNextInvoiceMeta(orders).invoiceNumber;
}

export function buildTaxInvoiceHtml(
  order: Order,
  settings: PortalSettings,
  methodName: string
): string {
  const brand = escHtml(settings.brand || 'ARYA TAX PATHSHALA');
  const invNo = escHtml(order.invoiceNumber || order.id);
  const serialBadge = order.invoiceSerial ? ` · Sl. #${order.invoiceSerial}` : '';
  const gstNo = escHtml(order.gstNumber || settings.gstNumber || 'Not Registered / Unregistered');
  const sacCode = escHtml(order.sacCode || settings.sacCode || '999293');
  const gstSection = escHtml(
    order.gstSection ||
      settings.gstSection ||
      'Section 9(1) CGST/SGST Act · Educational & Tax Training'
  );
  const buyerName = escHtml(order.buyerName || 'Student');
  const buyerEmail = escHtml(order.buyerEmail || '—');
  const buyerPhone = escHtml(order.buyerPhone || '—');
  const buyerState = escHtml(order.buyerState || '');
  const sellerState = escHtml(order.sellerState || settings.gstState || '');
  const itemName = escHtml(order.itemName);
  const dateStr = escHtml(
    new Date(order.paidAt || order.created).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
  const gstRate = order.gstRate ?? settings.gst ?? 0;
  const taxable = order.taxable ?? Math.max(0, order.base - order.discount);
  const isIgst = order.gstSplit === 'igst';
  const cgst = order.cgst ?? (isIgst ? 0 : Math.round((order.gst / 2) * 100) / 100);
  const sgst = order.sgst ?? (isIgst ? 0 : Math.round((order.gst - cgst) * 100) / 100);
  const igst = order.igst ?? (isIgst ? order.gst : 0);
  const supplyLabel = isIgst ? 'Inter-State Supply (IGST)' : 'Intra-State Supply (CGST + SGST)';
  const billingMonth = escHtml(
    new Date(order.paidAt || order.created).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    })
  );

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;border:1px solid #d7e1ef;border-radius:14px;overflow:hidden;background:#ffffff;color:#1d2940;">
    <div style="background:#142746;color:#ffffff;padding:22px 24px;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d7a84b;font-weight:700;">GST TAX INVOICE &amp; BILL OF SUPPLY</div>
      <div style="font-size:20px;font-weight:800;margin-top:6px;">${brand}</div>
      <div style="font-size:12px;color:#cbd7ea;margin-top:4px;">Invoice No: <strong>${invNo}</strong>${serialBadge} &middot; Month: ${billingMonth} &middot; Date: ${dateStr}</div>
    </div>
    <div style="padding:22px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
        <tr>
          <td style="vertical-align:top;width:50%;padding-right:10px;">
            <div style="font-size:10px;text-transform:uppercase;color:#718096;font-weight:700;">Billed To Student (Bill Of)</div>
            <div style="font-weight:700;font-size:14px;color:#142746;margin-top:4px;">${buyerName}</div>
            <div style="color:#59677d;margin-top:2px;">Gmail / Login ID: ${buyerEmail}</div>
            <div style="color:#59677d;margin-top:2px;">Mobile / WhatsApp No: ${buyerPhone}</div>
            ${buyerState ? `<div style="color:#142746;font-weight:600;margin-top:2px;">Place of Supply (Student State): ${buyerState}</div>` : ''}
          </td>
          <td style="vertical-align:top;width:50%;text-align:right;">
            <div style="font-size:10px;text-transform:uppercase;color:#718096;font-weight:700;">Supplier GST &amp; Tax Details</div>
            <div style="color:#142746;font-weight:700;margin-top:4px;">Supplier GSTIN: ${gstNo}</div>
            ${sellerState ? `<div style="color:#142746;font-weight:600;margin-top:2px;">GST Payable From State: ${sellerState}</div>` : ''}
            <div style="color:#59677d;margin-top:2px;">SAC Code: ${sacCode} &middot; ${supplyLabel}</div>
            <div style="color:#59677d;margin-top:2px;">${gstSection}</div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e3e9f2;">
        <thead>
          <tr style="background:#f4f7fc;color:#142746;">
            <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e3e9f2;">Description</th>
            <th style="text-align:right;padding:10px 12px;border-bottom:1px solid #e3e9f2;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #edf2fa;">
              <strong>${itemName}</strong><br/>
              <span style="font-size:11px;color:#718096;">Method: ${escHtml(methodName)} &middot; Ref/UTR: ${escHtml(order.reference || 'Direct')}</span>
            </td>
            <td style="text-align:right;padding:10px 12px;border-bottom:1px solid #edf2fa;font-weight:700;">${escHtml(money(order.base))}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #edf2fa;color:${order.discount > 0 ? '#13845b' : '#59677d'};">Discount ${order.couponCode ? `(${escHtml(order.couponCode)})` : ''}</td>
            <td style="text-align:right;padding:8px 12px;border-bottom:1px solid #edf2fa;color:${order.discount > 0 ? '#13845b' : '#59677d'};font-weight:700;">${order.discount > 0 ? `-${escHtml(money(order.discount))}` : escHtml(money(0))}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #edf2fa;color:#59677d;">Taxable Value</td>
            <td style="text-align:right;padding:8px 12px;border-bottom:1px solid #edf2fa;">${escHtml(money(taxable))}</td>
          </tr>
          ${
            isIgst
              ? `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #edf2fa;color:#59677d;">IGST (${gstRate}%) · Inter-State</td>
            <td style="text-align:right;padding:8px 12px;border-bottom:1px solid #edf2fa;">${escHtml(money(igst))}</td>
          </tr>`
              : `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #edf2fa;color:#59677d;">CGST (${gstRate / 2}%)</td>
            <td style="text-align:right;padding:8px 12px;border-bottom:1px solid #edf2fa;">${escHtml(money(cgst))}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #edf2fa;color:#59677d;">SGST (${gstRate / 2}%)</td>
            <td style="text-align:right;padding:8px 12px;border-bottom:1px solid #edf2fa;">${escHtml(money(sgst))}</td>
          </tr>`
          }
          <tr style="background:#edf7f2;">
            <td style="padding:12px;font-weight:800;color:#142746;font-size:14px;">Total Amount Paid (${escHtml(order.status)})</td>
            <td style="text-align:right;padding:12px;font-weight:800;color:#13845b;font-size:16px;">${escHtml(money(order.total))}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:16px;padding:12px 14px;border-radius:10px;background:#f8fafd;border:1px solid #e3e9f2;font-size:12px;color:#59677d;">
        <strong style="color:#142746;">Course Access Status:</strong> Your enrollment is <strong style="color:#13845b;">ACTIVE</strong>. Sign in to ${brand} with your registered email/ID (${buyerEmail}) to start watching all lessons immediately.
      </div>
    </div>
  </div>`;
}

export async function sendOrderEmailInvoice(params: {
  db: DatabaseSchema;
  order: Order;
  methodName: string;
}): Promise<{
  status: 'sent' | 'not_configured' | 'failed';
  note: string;
}> {
  const { db, order, methodName } = params;
  const adminLoginEmail =
    db.admin?.email && db.admin.email.includes('@') ? db.admin.email.trim() : '';
  const smtpUser = (db.notifications.smtpUser || adminLoginEmail).trim();
  const { smtpPass, senderName } = db.notifications;
  const recipient = (order.buyerEmail || '').trim();
  const adminCopy =
    adminLoginEmail && adminLoginEmail.toLowerCase() !== recipient.toLowerCase()
      ? adminLoginEmail
      : smtpUser && smtpUser.toLowerCase() !== recipient.toLowerCase()
        ? smtpUser
        : '';

  if (!smtpUser || !smtpPass) {
    return {
      status: 'not_configured',
      note: `Tax Invoice ${order.invoiceNumber || order.id} ready for ${recipient || 'student'}${adminCopy ? ` (Admin copy: ${adminCopy})` : ''}. Save Gmail App Password in Admin Settings for automatic background delivery.`,
    };
  }
  if (!recipient.includes('@')) {
    return {
      status: 'not_configured',
      note: 'Student account uses a non-email login ID, so automatic Gmail delivery was skipped.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const html = buildTaxInvoiceHtml(order, db.settings, methodName);
    const text = buildWhatsAppBillText(order, db.settings, order.buyerName);

    await transporter.sendMail({
      from: `"${senderName || db.settings.brand}" <${smtpUser}>`,
      to: recipient,
      ...(adminCopy ? { cc: adminCopy } : {}),
      subject: `Tax Invoice ${order.invoiceNumber || order.id} · ${order.itemName} (${money(order.total)})`,
      text,
      html,
    });

    order.lastDispatchedAt = new Date().toISOString();

    return {
      status: 'sent',
      note: `GST Tax Invoice automatically sent to ${recipient}${adminCopy ? ` & CC'd to Admin (${adminCopy})` : ''}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'SMTP delivery failed';
    return {
      status: 'failed',
      note: `Gmail SMTP error: ${msg}`,
    };
  }
}

export async function dispatchOrderNotifications(params: {
  db: DatabaseSchema;
  order: Order;
  student: StoredUser;
  methodName: string;
}): Promise<void> {
  const { db, order, student, methodName } = params;

  const billText = buildWhatsAppBillText(order, db.settings, student.name);
  const targetPhone = order.buyerPhone || student.phone || db.notifications.adminWhatsapp;
  order.whatsappMessage = billText;
  order.whatsappUrl = buildWhatsAppUrl(targetPhone, billText);

  // 1. Real Gmail SMTP dispatch if configured (auto-locked student + admin copy)
  const emailRes = await sendOrderEmailInvoice({ db, order, methodName });
  order.emailDispatchStatus = emailRes.status;
  order.emailDispatchNote = emailRes.note;

  // 2. Real WhatsApp Cloud API / Webhook dispatch if configured
  const digits = normalizeWhatsAppDigits(order.buyerPhone || student.phone);
  const waCreds = resolveEffectiveWhatsappCredentials(db);

  if (waCreds.cloudApiReady && digits.length >= 10) {
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(
          waCreds.phoneNumberId
        )}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${waCreds.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: digits,
            type: 'text',
            text: { body: billText },
          }),
        }
      );
      order.whatsappDispatchStatus = resp.ok ? 'sent' : 'failed';
    } catch {
      order.whatsappDispatchStatus = 'failed';
    }
  } else if (waCreds.webhookUrl) {
    try {
      const resp = await fetch(waCreds.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: digits || targetPhone,
          message: billText,
          invoiceNumber: order.invoiceNumber,
          orderId: order.id,
          total: order.total,
          buyerEmail: order.buyerEmail,
          course: order.itemName,
        }),
      });
      order.whatsappDispatchStatus = resp.ok ? 'sent' : 'failed';
    } catch {
      order.whatsappDispatchStatus = 'failed';
    }
  } else {
    order.whatsappDispatchStatus = 'manual_ready';
  }
}
