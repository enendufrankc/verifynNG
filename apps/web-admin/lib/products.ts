import { apiClient } from './api-client';

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  gtin: string | null;
  description: string | null;
  category: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  sku: string;
  name: string;
  gtin?: string;
  description?: string;
  category?: string;
}

export function listProducts(tenantPath: (path: string) => string) {
  return apiClient.get<Product[]>(tenantPath('/products'));
}

export function createProduct(
  tenantPath: (path: string) => string,
  input: ProductInput,
) {
  return apiClient.post<Product>(tenantPath('/products'), input);
}

export function updateProduct(
  tenantPath: (path: string) => string,
  productId: string,
  input: Partial<ProductInput>,
) {
  return apiClient.patch<Product>(tenantPath(`/products/${productId}`), input);
}

export function archiveProduct(
  tenantPath: (path: string) => string,
  productId: string,
) {
  return apiClient.post<Product>(tenantPath(`/products/${productId}/archive`));
}

/** GS1 mod-10 check digit — mirrors ProductsService.validateGtin for live form feedback. */
export function validateGtin(gtin: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(gtin)) return false;
  const len = gtin.length;
  let sum = 0;
  for (let i = 0; i < len - 1; i++) {
    const d = parseInt(gtin[i], 10);
    const weight = (len - 1 - i) % 2 === 0 ? 1 : 3;
    sum += d * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(gtin[len - 1], 10);
}
