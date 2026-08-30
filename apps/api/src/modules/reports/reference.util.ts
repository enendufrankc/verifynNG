const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateReferenceCandidate(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)];
  }
  return `RPT-${suffix}`;
}

export async function generateUniqueReference(
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 5,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateReferenceCandidate();
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('reference_generation_exhausted');
}
