import { apiClient } from './api-client';

export type OemStatus = 'active' | 'suspended';

export interface Oem {
  id: string;
  tenantId: string;
  name: string;
  country: string | null;
  status: OemStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OemInput {
  name: string;
  country?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  notes?: string;
}

export function listOems(tenantPath: (path: string) => string) {
  return apiClient.get<Oem[]>(tenantPath('/oems'));
}

export function createOem(
  tenantPath: (path: string) => string,
  input: OemInput,
) {
  return apiClient.post<Oem>(tenantPath('/oems'), input);
}

export function updateOem(
  tenantPath: (path: string) => string,
  oemId: string,
  input: Partial<OemInput>,
) {
  return apiClient.patch<Oem>(tenantPath(`/oems/${oemId}`), input);
}

export function setOemStatus(
  tenantPath: (path: string) => string,
  oemId: string,
  status: OemStatus,
) {
  return apiClient.post<Oem>(tenantPath(`/oems/${oemId}/status`), { status });
}
