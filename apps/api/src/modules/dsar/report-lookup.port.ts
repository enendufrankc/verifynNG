/**
 * E08 (Consumer Reporting) hasn't shipped a `Report` model yet — this is the
 * published interface E19's consumer DSAR flow needs from it
 * (`Report.referenceNumber` + `contactEmail` lookup, per CROSS-EPIC-REQUESTS.md
 * "To E08 Consumer Reporting"). Until E08 lands, `NullReportLookupAdapter`
 * always reports "no match", which is also the *safe* default: consumer DSAR
 * must never enumerate whether a reference/email pair exists, so "no report
 * system yet" and "no match" look identical to the caller.
 */
export const REPORT_LOOKUP_PORT = 'REPORT_LOOKUP_PORT';

export interface ReportLookupResult {
  tenantId: string;
  contactEmail: string;
}

export interface ReportLookupPort {
  findByReference(referenceNumber: string): Promise<ReportLookupResult | null>;
}

export class NullReportLookupAdapter implements ReportLookupPort {
  async findByReference(): Promise<ReportLookupResult | null> {
    return null;
  }
}
