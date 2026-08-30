import { Prisma } from '@prisma/client';

/**
 * Prisma client extension that enforces append-only semantics on ScanEvent.
 * Throws at the application level before the request reaches Postgres.
 * The Postgres trigger (scan_event_immutable) is the defence-in-depth layer.
 */
export function scanEventAppendOnlyExtension() {
  return Prisma.defineExtension({
    name: 'scanEventAppendOnly',
    query: {
      scanEvent: {
        async update({ query }) {
          void query; // intentionally unused — we block all updates
          throw new Error('ScanEvent is append-only: update not allowed');
        },
        async updateMany({ query }) {
          void query;
          throw new Error('ScanEvent is append-only: updateMany not allowed');
        },
        async delete({ query }) {
          void query;
          throw new Error('ScanEvent is append-only: delete not allowed');
        },
        async deleteMany({ query }) {
          void query;
          throw new Error('ScanEvent is append-only: deleteMany not allowed');
        },
      },
    },
  });
}
