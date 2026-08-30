export type TemplateId =
  | 'tenant.welcome'
  | 'verification.approved'
  | 'verification.rejected'
  | 'batch.minted'
  | 'manifest.delivered'
  | 'receipt.mismatch'
  | 'anomaly.alert'
  | 'report.received'
  | 'invoice.issued'
  | 'invoice.paid'
  | 'invoice.failed'
  | 'password.reset'
  | 'mfa.recovery'
  | 'notification.test';

// Branded types to reject keys named 'code' or 'tier2Code' at type level
type NoCodeKeys<T> = {
  [K in keyof T]: K extends 'code' | 'tier2Code' ? never : T[K];
};

export interface BrandingData {
  tenantName: string;
  logoUrl?: string;
  primaryColor?: string;
  footerAddress?: string;
  unsubscribeLine?: string;
}

// Data per template — each epic that owns a template defines the shape
export interface TemplateData {
  'tenant.welcome': NoCodeKeys<{ tenantName: string; loginUrl: string }>;
  'verification.approved': NoCodeKeys<{
    productName: string;
    tier1Code: string;
    verifiedAt: string;
  }>;
  'verification.rejected': NoCodeKeys<{
    productName: string;
    tier1Code: string;
    reason: string;
  }>;
  'batch.minted': NoCodeKeys<{
    productName: string;
    batchSku: string;
    unitCount: number;
    dashboardUrl: string;
  }>;
  'manifest.delivered': NoCodeKeys<{
    oemName: string;
    batchSku: string;
    unitCount: number;
    dashboardUrl: string;
  }>;
  'receipt.mismatch': NoCodeKeys<{
    oemName: string;
    batchSku: string;
    expectedCount: number;
    receivedCount: number;
    dashboardUrl: string;
  }>;
  // Contract owned by E07 (docs/epics/E07-anomaly-detection.md, "Interfaces
  // exposed"): { tenantName, rule, score, unitRef?, batchRef?, summary,
  // cities[], adminUrl }.
  'anomaly.alert': NoCodeKeys<{
    tenantName: string;
    rule: string;
    score: number;
    unitRef?: string;
    batchRef?: string;
    summary: string;
    cities: string[];
    adminUrl: string;
  }>;
  'report.received': NoCodeKeys<{
    reportReference: string;
    tier1Code: string;
    reportType: string;
    reportedAt: string;
    dashboardUrl: string;
  }>;
  'invoice.issued': NoCodeKeys<{
    invoiceNumber: string;
    amount: string;
    dueDate: string;
    dashboardUrl: string;
  }>;
  'invoice.paid': NoCodeKeys<{
    invoiceNumber: string;
    amount: string;
    paidAt: string;
  }>;
  'invoice.failed': NoCodeKeys<{
    invoiceNumber: string;
    amount: string;
    reason: string;
    retryUrl: string;
  }>;
  'password.reset': NoCodeKeys<{
    resetUrl: string;
    expiresIn: string;
  }>;
  'mfa.recovery': NoCodeKeys<{
    recoveryUrl: string;
    expiresIn: string;
  }>;
  'notification.test': NoCodeKeys<{
    message: string;
    timestamp: string;
  }>;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
  sms: string;
  whatsapp?: { template: string; params: Record<string, string> };
}
