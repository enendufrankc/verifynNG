export interface RetentionPolicyResult {
  matched: number;
  affected: number;
  cutoff: Date;
}

export interface RetentionPolicy {
  name: string;
  /** Whether a LegalHold on the affected subject blocks this policy — the
   * caller (RetentionRunner) is responsible for filtering held subjects
   * before calling run() for policies where this is true. */
  legalHoldAware: boolean;
  run(dryRun: boolean): Promise<RetentionPolicyResult>;
}
