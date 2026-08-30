import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { Writable } from 'node:stream';
import crypto from 'node:crypto';
import * as React from 'react';
import { toBuffer as qrToBuffer } from 'qrcode';
import { ZipArchive } from 'archiver';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { S3Service } from '../common/s3.service';
import { ManifestService } from '../modules/batches/manifest.service';
import { EventsService } from '../common/events.service';

/**
 * Shape of a single unit inside the decrypted manifest. The SignedManifest
 * is an opaque index-signature type, so we narrow the `units` array here.
 */
interface ManifestUnit {
  serial: number;
  tier1Code: string;
  tier2Code: string;
  tier1Url: string;
  tier2Url: string;
}

interface ManifestArtefact {
  serial: number;
  tier1: Buffer;
  tier2: Buffer;
}

const QR_OPTIONS = {
  width: 300,
  margin: 1,
  errorCorrectionLevel: 'M' as const,
};

/** IVORY GLOW palette — copied from the legacy sheet. */
const PALETTE = {
  background: '#f5f1e8',
  gold: '#E3A93C',
  dark: '#231C10',
  muted: '#9A6A18',
  sub: '#5C5140',
};

type ArtefactKind = 'qr-zip' | 'tier1-csv' | 'sheet-pdf' | 'all-zip';

const sheetStyles = StyleSheet.create({
  page: {
    padding: 24,
    backgroundColor: PALETTE.background,
  },
  title: {
    fontSize: 16,
    color: PALETTE.dark,
  },
  subtitle: {
    fontSize: 10,
    color: PALETTE.muted,
    marginTop: 4,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.gold,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  serial: {
    fontSize: 8,
    color: PALETTE.muted,
    width: 16,
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  qr: {
    width: 72,
    height: 72,
  },
  label: {
    fontSize: 7,
    color: PALETTE.dark,
    marginTop: 4,
    textAlign: 'center',
  },
  sublabel: {
    fontSize: 6,
    color: PALETTE.sub,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    borderLeftWidth: 1,
    borderLeftColor: PALETTE.gold,
    borderStyle: 'dashed',
    marginHorizontal: 6,
  },
});

@Processor('batch-exports', { concurrency: 1 })
@Injectable()
export class BatchExportsProcessor extends WorkerHost {
  private readonly logger = new Logger(BatchExportsProcessor.name);

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private s3: S3Service,
    private manifestService: ManifestService,
    private events: EventsService,
  ) {
    super();
  }

  async process(
    job: Job<{ tenantId: string; batchId: string }>,
  ): Promise<void> {
    const { tenantId, batchId } = job.data;
    const baseKey = `tenants/${tenantId}/batches/${batchId}`;
    this.logger.log(`Generating exports for batch ${batchId}`);

    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { product: true, oem: true, tenant: true },
    });
    if (!batch) {
      this.logger.warn(`Batch ${batchId} not found — skipping exports`);
      return;
    }

    const tenantName = batch.tenant?.name || tenantId;

    // Open the (encrypted) manifest in memory to access raw tier-2 codes for
    // QR generation. The manifest is only held for the duration of this method.
    const manifest = await this.manifestService.open(batchId);
    const units = (manifest.units as unknown as ManifestUnit[]) ?? [];

    // Each unit's tier-1/tier-2 QR PNGs are generated once and shared by
    // both the ZIP and the PDF sheet — encoding 2×count QR codes twice over
    // (once per artefact) doesn't hold up at six- and seven-figure batch
    // sizes.
    const qrPngs = await this.generateQrPngs(units);

    // 1. QR ZIP — both tier-1 and tier-2 PNGs per unit
    const qrZipBuffer = await this.generateQrZip(qrPngs);
    await this.uploadArtefact(
      tenantId,
      batchId,
      'qr-zip',
      `${baseKey}/qr.zip`,
      qrZipBuffer,
    );

    // 2. Tier-1 CSV
    const csvBuffer = this.generateCsv(units);
    await this.uploadArtefact(
      tenantId,
      batchId,
      'tier1-csv',
      `${baseKey}/tier1-codes.csv`,
      csvBuffer,
    );

    // 3. Application Sheet PDF
    const pdfBuffer = await this.generateSheetPdf(
      batch,
      qrPngs,
      units.length,
      tenantName,
    );
    await this.uploadArtefact(
      tenantId,
      batchId,
      'sheet-pdf',
      `${baseKey}/application-sheet.pdf`,
      pdfBuffer,
    );

    // 4. All ZIP — bundles the three artefacts above
    const allZipBuffer = await this.generateAllZip(
      qrZipBuffer,
      csvBuffer,
      pdfBuffer,
    );
    await this.uploadArtefact(
      tenantId,
      batchId,
      'all-zip',
      `${baseKey}/all.zip`,
      allZipBuffer,
    );

    await this.prisma.batch.update({
      where: { id: batchId },
      data: { exportsReadyAt: new Date() },
    });

    await this.events.emit('batch.exports.ready', {
      tenantId,
      batchId,
      artefacts: ['qr-zip', 'tier1-csv', 'sheet-pdf', 'all-zip'],
      at: new Date(),
    });

    this.logger.log(`Exports ready for batch ${batchId}`);
  }

  private async uploadArtefact(
    tenantId: string,
    batchId: string,
    kind: ArtefactKind,
    objectKey: string,
    buffer: Buffer,
  ): Promise<void> {
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    await this.s3.putObject(objectKey, buffer);
    // Re-running exports for a batch should replace the artefact, not fail.
    await this.prisma.batchArtefact.upsert({
      where: { batchId_kind: { batchId, kind } },
      create: {
        tenantId,
        batchId,
        kind,
        objectKey,
        sizeBytes: buffer.length,
        sha256,
      },
      update: { objectKey, sizeBytes: buffer.length, sha256 },
    });
  }

  private async generateQrPngs(
    units: ManifestUnit[],
  ): Promise<ManifestArtefact[]> {
    const pngs: ManifestArtefact[] = [];
    for (const unit of units) {
      const [tier1, tier2] = await Promise.all([
        qrToBuffer(unit.tier1Url, QR_OPTIONS),
        qrToBuffer(unit.tier2Url, QR_OPTIONS),
      ]);
      pngs.push({ serial: unit.serial, tier1, tier2 });
    }
    return pngs;
  }

  private async generateQrZip(pngs: ManifestArtefact[]): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(sink);

    for (const png of pngs) {
      archive.append(png.tier1, { name: `qr/${png.serial}-tier1.png` });
      archive.append(png.tier2, { name: `qr/${png.serial}-tier2.png` });
    }

    await archive.finalize();
    return Buffer.concat(chunks);
  }

  private generateCsv(units: ManifestUnit[]): Buffer {
    const lines = ['serial,tier1Code,url'];
    for (const unit of units) {
      lines.push(`${unit.serial},${unit.tier1Code},${unit.tier1Url}`);
    }
    return Buffer.from(lines.join('\n'), 'utf8');
  }

  private async generateSheetPdf(
    batch: {
      id: string;
      product?: { name?: string | null; gtin?: string | null } | null;
      oem?: { name?: string | null } | null;
    },
    cards: ManifestArtefact[],
    unitCount: number,
    tenantName: string,
  ): Promise<Buffer> {
    const cardElements = cards.map((card) =>
      React.createElement(
        View,
        { key: card.serial, style: sheetStyles.card, wrap: false },
        React.createElement(
          Text,
          { style: sheetStyles.serial },
          `#${card.serial}`,
        ),
        React.createElement(
          View,
          { style: sheetStyles.col },
          React.createElement(Image, {
            src: card.tier1,
            style: sheetStyles.qr,
          }),
          React.createElement(
            Text,
            { style: sheetStyles.label },
            'TIER 1 · PUBLIC',
          ),
          React.createElement(
            Text,
            { style: sheetStyles.sublabel },
            'print on bottle',
          ),
        ),
        React.createElement(View, { style: sheetStyles.divider }),
        React.createElement(
          View,
          { style: sheetStyles.col },
          React.createElement(Image, {
            src: card.tier2,
            style: sheetStyles.qr,
          }),
          React.createElement(
            Text,
            { style: sheetStyles.label },
            'TIER 2 · HIDDEN',
          ),
          React.createElement(
            Text,
            { style: sheetStyles.sublabel },
            'scratch-off label',
          ),
        ),
      ),
    );

    const doc = React.createElement(
      Document,
      { title: `${tenantName} — QR Application Sheet` },
      React.createElement(
        Page,
        { size: 'A4', style: sheetStyles.page },
        React.createElement(
          Text,
          { style: sheetStyles.title },
          `${tenantName} — QR Application Sheet`,
        ),
        React.createElement(
          Text,
          { style: sheetStyles.subtitle },
          `Batch ${batch.id.substring(0, 8)} · ${batch.product?.name || ''} · ${unitCount} units · OEM: ${batch.oem?.name || 'N/A'}`,
        ),
        React.createElement(View, { style: sheetStyles.grid }, ...cardElements),
      ),
    );

    return renderToBuffer(doc);
  }

  private async generateAllZip(
    qrZip: Buffer,
    csv: Buffer,
    pdf: Buffer,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(sink);

    archive.append(qrZip, { name: 'qr.zip' });
    archive.append(csv, { name: 'tier1-codes.csv' });
    archive.append(pdf, { name: 'application-sheet.pdf' });

    await archive.finalize();
    return Buffer.concat(chunks);
  }
}
