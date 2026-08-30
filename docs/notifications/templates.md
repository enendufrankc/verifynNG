# Notification templates

The API owns the typed template catalog in `apps/api/src/modules/notifications/templates`.
Every template has HTML, plain-text, and SMS output. Template data is deliberately
redacted: tier-2 codes and encrypted manifest material must never be passed to the
registry.

| Template                | Required data                                                              | Owner |
| ----------------------- | -------------------------------------------------------------------------- | ----- |
| `tenant.welcome`        | `tenantName`, `loginUrl`                                                   | E03   |
| `verification.approved` | `productName`, `tier1Code`, `verifiedAt`                                   | E06   |
| `verification.rejected` | `productName`, `tier1Code`, `reason`                                       | E06   |
| `batch.minted`          | `productName`, `batchSku`, `unitCount`, `dashboardUrl`                     | E04   |
| `manifest.delivered`    | `oemName`, `batchSku`, `unitCount`, `dashboardUrl`                         | E05   |
| `receipt.mismatch`      | `oemName`, `batchSku`, `expectedCount`, `receivedCount`, `dashboardUrl`    | E05   |
| `anomaly.alert`         | `tier1Code`, `productName`, `anomalyType`, `detectedAt`, `dashboardUrl`    | E07   |
| `report.received`       | `reportReference`, `tier1Code`, `reportType`, `reportedAt`, `dashboardUrl` | E08   |
| `invoice.issued`        | `invoiceNumber`, `amount`, `dueDate`, `dashboardUrl`                       | E15   |
| `invoice.paid`          | `invoiceNumber`, `amount`, `paidAt`                                        | E15   |
| `invoice.failed`        | `invoiceNumber`, `amount`, `reason`, `retryUrl`                            | E15   |
| `password.reset`        | `resetUrl`, `expiresIn`                                                    | E02   |
| `mfa.recovery`          | `recoveryUrl`, `expiresIn`                                                 | E02   |
| `notification.test`     | `message`, `timestamp`                                                     | E14   |

To add a template, extend `TemplateId`, add its `TemplateData` shape, register the
renderer, and add a sample to `registry.spec.ts`. Run the snapshot suite before
opening the PR.
