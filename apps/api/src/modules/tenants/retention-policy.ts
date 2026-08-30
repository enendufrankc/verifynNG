export const RETENTION_POLICY = 'RETENTION_POLICY';

export interface RetentionPolicy {
  scanEventsDays: number;
  consumerPiiDays: number;
  tenantDataAfterOffboardDays: number;
}

export const defaultRetentionPolicy: RetentionPolicy = {
  scanEventsDays: 3650,
  consumerPiiDays: 30,
  tenantDataAfterOffboardDays: 30,
};
