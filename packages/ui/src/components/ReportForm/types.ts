export type PurchaseChannel =
  | 'open_market'
  | 'street_vendor'
  | 'online_marketplace'
  | 'social_media'
  | 'pharmacy'
  | 'supermarket'
  | 'brand_store'
  | 'other';

export interface ReportFormProps {
  tenantSlug: string;
  scanEventId: string;
  verdict: string;
  apiBaseUrl: string;
  captchaSiteKey?: string;
  onSubmitted?: (reference: string) => void;
  locale?: string;
}

export type FormStep = 'details' | 'photos' | 'contact' | 'done';
