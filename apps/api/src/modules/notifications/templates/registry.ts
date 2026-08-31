import { Injectable } from '@nestjs/common';
import {
  TemplateId,
  TemplateData,
  BrandingData,
  RenderedTemplate,
} from './template-data';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baseHtml(
  branding: BrandingData,
  subject: string,
  bodyHtml: string,
): string {
  const bg = branding.primaryColor ?? '#1a1a2e';
  const logo = branding.logoUrl
    ? `<img src="${esc(branding.logoUrl)}" alt="${esc(branding.tenantName)}" style="max-height:48px;margin-bottom:16px" />`
    : '';
  const footer =
    branding.footerAddress ?? 'VerifyN — Product Authenticity Platform';
  const unsub = branding.unsubscribeLine
    ? `<p style="font-size:12px;color:#999;margin-top:24px">${esc(branding.unsubscribeLine)}</p>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:${bg};padding:24px 32px;color:#ffffff">
${logo}
<h1 style="margin:0;font-size:20px;color:#ffffff">${esc(branding.tenantName)}</h1>
</td></tr>
<tr><td style="padding:32px">${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #eee">
<p style="margin:0;font-size:12px;color:#999">${esc(footer)}</p>
${unsub}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Template renderers — each returns { subject, bodyHtml, text, sms }
const renderers: Record<
  TemplateId,
  (
    data: never,
    branding: BrandingData,
  ) => Omit<RenderedTemplate, 'html'> & { bodyHtml: string }
> = {
  'notification.test': (
    data: TemplateData['notification.test'],
    branding: BrandingData,
  ) => ({
    subject: `Test notification from ${branding.tenantName}`,
    bodyHtml: `<p style="margin:0 0 12px">This is a test notification.</p><p style="margin:0"><strong>Message:</strong> ${esc(data.message)}</p><p style="margin:8px 0 0;color:#999;font-size:13px">Sent at ${esc(data.timestamp)}</p>`,
    text: `Test notification from ${branding.tenantName}\n\nMessage: ${data.message}\nSent at ${data.timestamp}`,
    sms: `Test: ${data.message}`,
  }),

  'tenant.welcome': (
    data: TemplateData['tenant.welcome'],
    branding: BrandingData,
  ) => ({
    subject: `Welcome to ${branding.tenantName}`,
    bodyHtml: `<p style="margin:0 0 12px">Your account has been set up on the ${esc(branding.tenantName)} verification platform.</p><p style="margin:0"><a href="${esc(data.loginUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Log in</a></p>`,
    text: `Welcome to ${branding.tenantName}\n\nYour account has been set up.\nLog in: ${data.loginUrl}`,
    sms: `Welcome to ${branding.tenantName}. Log in: ${data.loginUrl}`,
  }),

  'verification.approved': (
    data: TemplateData['verification.approved'],
    _branding: BrandingData,
  ) => ({
    subject: `Verification approved — ${data.productName}`,
    bodyHtml: `<p style="margin:0 0 12px">The product <strong>${esc(data.productName)}</strong> with code <strong>${esc(data.tier1Code)}</strong> has been verified as authentic.</p><p style="margin:0;color:#999;font-size:13px">Verified at ${esc(data.verifiedAt)}</p>`,
    text: `Verification approved — ${data.productName}\nCode: ${data.tier1Code}\nVerified at ${data.verifiedAt}`,
    sms: `Verified: ${data.productName} (${data.tier1Code}) is authentic.`,
  }),

  'verification.rejected': (
    data: TemplateData['verification.rejected'],
    _branding: BrandingData,
  ) => ({
    subject: `Verification rejected — ${data.productName}`,
    bodyHtml: `<p style="margin:0 0 12px">The product <strong>${esc(data.productName)}</strong> with code <strong>${esc(data.tier1Code)}</strong> could not be verified.</p><p style="margin:0;color:#c00"><strong>Reason:</strong> ${esc(data.reason)}</p>`,
    text: `Verification rejected — ${data.productName}\nCode: ${data.tier1Code}\nReason: ${data.reason}`,
    sms: `Rejected: ${data.productName} (${data.tier1Code}). Reason: ${data.reason}`,
  }),

  'batch.minted': (
    data: TemplateData['batch.minted'],
    branding: BrandingData,
  ) => ({
    subject: `Batch minted — ${data.batchSku}`,
    bodyHtml: `<p style="margin:0 0 12px"><strong>${esc(data.productName)}</strong> batch <strong>${esc(data.batchSku)}</strong> has been minted with ${data.unitCount} units.</p><p style="margin:0"><a href="${esc(data.dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View batch</a></p>`,
    text: `Batch minted — ${data.batchSku}\nProduct: ${data.productName}\nUnits: ${data.unitCount}\nView: ${data.dashboardUrl}`,
    sms: `Batch ${data.batchSku} minted: ${data.unitCount} units of ${data.productName}`,
  }),

  'manifest.delivered': (
    data: TemplateData['manifest.delivered'],
    branding: BrandingData,
  ) => ({
    subject: `Manifest delivered — ${data.batchSku}`,
    bodyHtml: `<p style="margin:0 0 12px">The manifest for batch <strong>${esc(data.batchSku)}</strong> has been delivered to <strong>${esc(data.oemName)}</strong> (${data.unitCount} units).</p><p style="margin:0"><a href="${esc(data.dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View details</a></p>`,
    text: `Manifest delivered — ${data.batchSku}\nOEM: ${data.oemName}\nUnits: ${data.unitCount}\nView: ${data.dashboardUrl}`,
    sms: `Manifest for batch ${data.batchSku} delivered to ${data.oemName}`,
  }),

  'receipt.mismatch': (
    data: TemplateData['receipt.mismatch'],
    _branding: BrandingData,
  ) => ({
    subject: `Receipt mismatch — ${data.batchSku}`,
    bodyHtml: `<p style="margin:0 0 12px;color:#c00"><strong>⚠ Receipt mismatch for batch ${esc(data.batchSku)}</strong></p><p style="margin:0 0 8px">OEM: ${esc(data.oemName)}</p><p style="margin:0 0 8px">Expected: ${data.expectedCount} units — Received: ${data.receivedCount} units</p><p style="margin:0"><a href="${esc(data.dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:#c00;color:#fff;border-radius:4px;text-decoration:none">Investigate</a></p>`,
    text: `Receipt mismatch — ${data.batchSku}\nOEM: ${data.oemName}\nExpected: ${data.expectedCount}, Received: ${data.receivedCount}\nView: ${data.dashboardUrl}`,
    sms: `MISMATCH: Batch ${data.batchSku} — expected ${data.expectedCount}, got ${data.receivedCount}`,
  }),

  'anomaly.alert': (
    data: TemplateData['anomaly.alert'],
    _branding: BrandingData,
  ) => {
    const ref = data.unitRef ?? data.batchRef;
    const refLine = ref
      ? `<p style="margin:0 0 8px">Ref: <strong>${esc(ref)}</strong></p>`
      : '';
    const citiesLine = data.cities.length
      ? `<p style="margin:0 0 8px;color:#999;font-size:13px">Cities: ${esc(data.cities.join(', '))}</p>`
      : '';
    return {
      subject: `Anomaly detected — ${data.rule} (${data.tenantName})`,
      bodyHtml: `<p style="margin:0 0 12px;color:#c00"><strong>⚠ Anomaly detected — score ${data.score}</strong></p><p style="margin:0 0 8px">${esc(data.summary)}</p>${refLine}${citiesLine}<p style="margin:12px 0 0"><a href="${esc(data.adminUrl)}" style="display:inline-block;padding:12px 24px;background:#c00;color:#fff;border-radius:4px;text-decoration:none">View details</a></p>`,
      text: `Anomaly detected — ${data.rule} (score ${data.score})\n${data.summary}\n${ref ? `Ref: ${ref}\n` : ''}View: ${data.adminUrl}`,
      sms: `ALERT: ${data.rule} anomaly (score ${data.score}) — ${data.tenantName}`,
    };
  },

  'report.received': (data: TemplateData['report.received'], branding) => ({
    subject: `Consumer report — ${data.reportReference}`,
    bodyHtml: `<p style="margin:0 0 12px">A consumer report has been received.</p><p style="margin:0 0 8px">Reference: <strong>${esc(data.reportReference)}</strong></p><p style="margin:0 0 8px">Code: ${esc(data.tier1Code)} — Type: ${esc(data.reportType)}</p><p style="margin:0 0 8px;color:#999;font-size:13px">Reported at ${esc(data.reportedAt)}</p><p style="margin:12px 0 0"><a href="${esc(data.dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View report</a></p>`,
    text: `Consumer report — ${data.reportReference}\nCode: ${data.tier1Code}\nType: ${data.reportType}\nReported: ${data.reportedAt}\nView: ${data.dashboardUrl}`,
    sms: `Report ${data.reportReference}: ${data.reportType} on ${data.tier1Code}`,
  }),

  'report.consumer_ack': (
    data: TemplateData['report.consumer_ack'],
    branding,
  ) => ({
    subject: `We received your report — ${data.reference}`,
    bodyHtml: `<p style="margin:0 0 12px">Thanks for reporting a suspected fake ${esc(data.productName)}.</p><p style="margin:0 0 8px">Your reference: <strong>${esc(data.reference)}</strong></p><p style="margin:0 0 8px">We'll review it and let you know if we need anything else.</p><p style="margin:12px 0 0"><a href="${esc(data.statusUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Check status</a></p>`,
    text: `Thanks for reporting ${data.productName}.\nReference: ${data.reference}\nStatus: ${data.statusUrl}`,
    sms: `Report received: ${data.reference}. We'll be in touch.`,
  }),

  'report.consumer_update': (
    data: TemplateData['report.consumer_update'],
    branding,
  ) => ({
    subject: `Update on your report — ${data.reference}`,
    bodyHtml: `<p style="margin:0 0 12px">Your report on ${esc(data.productName)} has been updated.</p><p style="margin:0 0 8px">Status: <strong>${esc(data.status)}</strong>${data.outcome ? ` — ${esc(data.outcome)}` : ''}</p><p style="margin:12px 0 0"><a href="${esc(data.statusUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View details</a></p>`,
    text: `Report ${data.reference} update.\nStatus: ${data.status}${data.outcome ? ` — ${data.outcome}` : ''}\n${data.statusUrl}`,
    sms: `Report ${data.reference}: now ${data.status}.`,
  }),

  'invoice.issued': (data: TemplateData['invoice.issued'], branding) => ({
    subject: `Invoice ${data.invoiceNumber} issued`,
    bodyHtml: `<p style="margin:0 0 12px">Invoice <strong>${esc(data.invoiceNumber)}</strong> has been issued for <strong>${esc(data.amount)}</strong>.</p><p style="margin:0 0 8px">Due date: ${esc(data.dueDate)}</p><p style="margin:0"><a href="${esc(data.dashboardUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View invoice</a></p>`,
    text: `Invoice ${data.invoiceNumber} issued\nAmount: ${data.amount}\nDue: ${data.dueDate}\nView: ${data.dashboardUrl}`,
    sms: `Invoice ${data.invoiceNumber}: ${data.amount} due ${data.dueDate}`,
  }),

  'invoice.paid': (
    data: TemplateData['invoice.paid'],
    _branding: BrandingData,
  ) => ({
    subject: `Invoice ${data.invoiceNumber} paid`,
    bodyHtml: `<p style="margin:0 0 12px">Invoice <strong>${esc(data.invoiceNumber)}</strong> of <strong>${esc(data.amount)}</strong> has been paid.</p><p style="margin:0;color:#999;font-size:13px">Paid at ${esc(data.paidAt)}</p>`,
    text: `Invoice ${data.invoiceNumber} paid\nAmount: ${data.amount}\nPaid at: ${data.paidAt}`,
    sms: `Invoice ${data.invoiceNumber} (${data.amount}) paid`,
  }),

  'invoice.failed': (
    data: TemplateData['invoice.failed'],
    _branding: BrandingData,
  ) => ({
    subject: `Invoice ${data.invoiceNumber} payment failed`,
    bodyHtml: `<p style="margin:0 0 12px;color:#c00"><strong>⚠ Payment failed</strong></p><p style="margin:0 0 8px">Invoice <strong>${esc(data.invoiceNumber)}</strong> for <strong>${esc(data.amount)}</strong> — ${esc(data.reason)}</p><p style="margin:12px 0 0"><a href="${esc(data.retryUrl)}" style="display:inline-block;padding:12px 24px;background:#c00;color:#fff;border-radius:4px;text-decoration:none">Retry payment</a></p>`,
    text: `Invoice ${data.invoiceNumber} payment failed\nAmount: ${data.amount}\nReason: ${data.reason}\nRetry: ${data.retryUrl}`,
    sms: `FAILED: Invoice ${data.invoiceNumber} (${data.amount}). ${data.reason}`,
  }),

  'password.reset': (data: TemplateData['password.reset'], branding) => ({
    subject: `Password reset — ${branding.tenantName}`,
    bodyHtml: `<p style="margin:0 0 12px">A password reset was requested for your ${esc(branding.tenantName)} account.</p><p style="margin:0 0 8px">This link expires in ${esc(data.expiresIn)}.</p><p style="margin:0"><a href="${esc(data.resetUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Reset password</a></p>`,
    text: `Password reset — ${branding.tenantName}\n\nReset your password: ${data.resetUrl}\nExpires in ${data.expiresIn}`,
    sms: `Reset your ${branding.tenantName} password: ${data.resetUrl} (expires ${data.expiresIn})`,
  }),

  'mfa.recovery': (data: TemplateData['mfa.recovery'], branding) => ({
    subject: `MFA recovery — ${branding.tenantName}`,
    bodyHtml: `<p style="margin:0 0 12px">An MFA recovery was requested for your ${esc(branding.tenantName)} account.</p><p style="margin:0 0 8px">This link expires in ${esc(data.expiresIn)}.</p><p style="margin:0"><a href="${esc(data.recoveryUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Recover account</a></p>`,
    text: `MFA recovery — ${branding.tenantName}\n\nRecover your account: ${data.recoveryUrl}\nExpires in ${data.expiresIn}`,
    sms: `MFA recovery for ${branding.tenantName}: ${data.recoveryUrl} (expires ${data.expiresIn})`,
  }),

  // ── E19 Compliance & Data Governance ──────────────────────────
  'dsar.verify': (data: TemplateData['dsar.verify'], branding) => ({
    subject: `Confirm your data request — ${branding.tenantName}`,
    bodyHtml: `<p style="margin:0 0 12px">We received a request to access or delete data linked to a report you submitted. Confirm it's you within ${esc(data.expiresIn)}.</p><p style="margin:0"><a href="${esc(data.verifyUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Confirm request</a></p>`,
    text: `Confirm your data request\n\n${data.verifyUrl}\nExpires in ${data.expiresIn}`,
    sms: `Confirm your data request: ${data.verifyUrl} (expires ${data.expiresIn})`,
  }),

  'dsar.ready': (data: TemplateData['dsar.ready'], branding) => ({
    subject: `Your data export is ready — ${branding.tenantName}`,
    bodyHtml: `<p style="margin:0 0 12px">Your requested data export is ready to download. This link expires in ${esc(data.expiresIn)}.</p><p style="margin:0"><a href="${esc(data.downloadUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Download</a></p>`,
    text: `Your data export is ready\n\n${data.downloadUrl}\nExpires in ${data.expiresIn}`,
    sms: `Your data export is ready: ${data.downloadUrl} (expires ${data.expiresIn})`,
  }),

  'dsar.erased': (
    data: TemplateData['dsar.erased'],
    _branding: BrandingData,
  ) => ({
    subject: `Your data has been erased`,
    bodyHtml: `<p style="margin:0 0 12px">The data linked to your report has been erased, as requested on ${esc(data.requestedAt)}.</p>`,
    text: `Your data has been erased, as requested on ${data.requestedAt}.`,
    sms: `Your data has been erased as requested.`,
  }),

  'legal.reaccept': (data: TemplateData['legal.reaccept'], branding) => ({
    subject: `Action needed: updated ${data.documentTitle}`,
    bodyHtml: `<p style="margin:0 0 12px">We've published a new version (${esc(data.version)}) of our <strong>${esc(data.documentTitle)}</strong>. Your account owner must accept it to keep using the console.</p><p style="margin:0"><a href="${esc(data.reacceptUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">Review and accept</a></p>`,
    text: `We've published a new version (${data.version}) of our ${data.documentTitle}.\n\nReview and accept: ${data.reacceptUrl}`,
    sms: `Action needed: review and accept the updated ${data.documentTitle} at ${data.reacceptUrl}`,
  }),

  // ── E18 Support Tooling ────────────────────────────────────────
  'impersonation.started': (
    data: TemplateData['impersonation.started'],
    _branding: BrandingData,
  ) => ({
    subject: `Platform support viewed your account`,
    bodyHtml: `<p style="margin:0 0 12px">A member of platform support opened your ${esc(data.tenantName)} console in <strong>${esc(data.mode)}</strong> mode at ${esc(data.startedAt)}.</p><p style="margin:0;color:#999;font-size:13px">This is logged in your audit trail. You can turn this notice off in Settings.</p>`,
    text: `A member of platform support opened your ${data.tenantName} console in ${data.mode} mode at ${data.startedAt}.`,
    sms: `Platform support viewed your ${data.tenantName} account (${data.mode}).`,
  }),

  'ticket.created': (data: TemplateData['ticket.created'], branding) => ({
    subject: `We received your request — #${data.ticketNumber}`,
    bodyHtml: `<p style="margin:0 0 12px">Thanks for reaching out to ${esc(branding.tenantName)} support.</p><p style="margin:0 0 8px">Reference: <strong>#${data.ticketNumber}</strong> — ${esc(data.subject)}</p><p style="margin:12px 0 0"><a href="${esc(data.statusUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View ticket</a></p>`,
    text: `We received your request #${data.ticketNumber}: ${data.subject}\n${data.statusUrl}`,
    sms: `Ticket #${data.ticketNumber} received: ${data.subject}`,
  }),

  'ticket.replied': (data: TemplateData['ticket.replied'], branding) => ({
    subject: `Re: ${data.subject} [#${data.ticketNumber}]`,
    bodyHtml: `<p style="margin:0 0 12px">${esc(data.replyBody).replace(/\n/g, '<br/>')}</p><p style="margin:12px 0 0"><a href="${esc(data.statusUrl)}" style="display:inline-block;padding:12px 24px;background:${branding.primaryColor ?? '#1a1a2e'};color:#fff;border-radius:4px;text-decoration:none">View ticket</a></p>`,
    text: `${data.replyBody}\n\n${data.statusUrl}`,
    sms: `Reply on ticket #${data.ticketNumber}: ${data.replyBody.slice(0, 100)}`,
  }),
};

@Injectable()
export class TemplateRegistry {
  render<T extends TemplateId>(
    templateId: T,
    data: TemplateData[T],
    branding: BrandingData,
  ): RenderedTemplate {
    const renderer = renderers[templateId];
    if (!renderer) {
      throw new Error(`Unknown template id: ${templateId}`);
    }

    const rendered = renderer(data as never, branding);
    const html = baseHtml(branding, rendered.subject, rendered.bodyHtml);

    return {
      subject: rendered.subject,
      html,
      text: rendered.text,
      sms: rendered.sms,
    };
  }
}
