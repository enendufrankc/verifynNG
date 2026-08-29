import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { Writable } from 'node:stream';
import crypto from 'node:crypto';
import { toBuffer as qrToBuffer } from 'qrcode';
import { ZipArchive } from 'archiver';
import PDFDocument from 'pdfkit';
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

    // 1. QR ZIP — both tier-1 and tier-2 PNGs per unit
    const qrZipBuffer = await this.generateQrZip(units);
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
    const pdfBuffer = await this.generateSheetPdf(batch, units, tenantName);
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

  private async generateQrZip(units: ManifestUnit[]): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(sink);

    for (const unit of units) {
      const tier1Png = await qrToBuffer(unit.tier1Url, QR_OPTIONS);
      archive.append(tier1Png, { name: `qr/${unit.serial}-tier1.png` });

      const tier2Png = await qrToBuffer(unit.tier2Url, QR_OPTIONS);
      archive.append(tier2Png, { name: `qr/${unit.serial}-tier2.png` });
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
    units: ManifestUnit[],
    tenantName: string,
  ): Promise<Buffer> {
    // Pre-generate all QR PNGs so the PDF build is synchronous.
    const cards: ManifestArtefact[] = [];
    for (const unit of units) {
      const [tier1, tier2] = await Promise.all([
        qrToBuffer(unit.tier1Url, QR_OPTIONS),
        qrToBuffer(unit.tier2Url, QR_OPTIONS),
      ]);
      cards.push({ serial: unit.serial, tier1, tier2 });
    }

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margin: 24,
        info: { Title: `${tenantName} — QR Application Sheet` },
      });
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Warm background page colour.
      doc
        .rect(0, 0, doc.page.width, doc.page.height)
        .fillColor(PALETTE.background)
        .fill();

      // Header
      doc
        .fontSize(16)
        .fillColor(PALETTE.dark)
        .text(`${tenantName} — QR Application Sheet`, 24, 24);
      doc
        .fontSize(10)
        .fillColor(PALETTE.muted)
        .text(
          `Batch ${batch.id.substring(0, 8)} · ${batch.product?.name || ''} · ${units.length} units · OEM: ${batch.oem?.name || 'N/A'}`,
          24,
          46,
        );
      doc.y = 70;

      const pageWidth = doc.page.width - 48; // accounting for 24pt side margins
      const cardHeight = 130;
      const cardGap = 12;

      for (const card of cards) {
        // Start a fresh page (with header) if the next card won't fit.
        if (doc.y > doc.page.height - 24 - cardHeight - 8) {
          doc.addPage({ size: 'A4', margin: 24 });
          doc
            .rect(0, 0, doc.page.width, doc.page.height)
            .fillColor(PALETTE.background)
            .fill();
          doc
            .fontSize(10)
            .fillColor(PALETTE.muted)
            .text(`${tenantName} — continued`, 24, 24);
          doc.y = 48;
        }

        const startY = doc.y;

        // Card border
        doc
          .save()
          .roundedRect(24, startY, pageWidth, cardHeight, 6)
          .lineWidth(1)
          .strokeColor(PALETTE.gold)
          .stroke()
          .restore();

        // Serial badge (top-left)
        doc
          .fontSize(9)
          .fillColor(PALETTE.muted)
          .text(`#${card.serial}`, 32, startY + 6);

        const qrSize = 88;
        const leftQrX = 40;
        const rightQrX = 24 + pageWidth - qrSize - 56;
        const qrY = startY + 18;

        // Tier 1 QR — PUBLIC · print on bottle
        doc.image(card.tier1, leftQrX, qrY, {
          width: qrSize,
          height: qrSize,
        });
        doc
          .fontSize(7)
          .fillColor(PALETTE.dark)
          .text('TIER 1 · PUBLIC', leftQrX, qrY + qrSize + 2, {
            width: qrSize,
            align: 'center',
          });
        doc
          .fontSize(6)
          .fillColor(PALETTE.sub)
          .text('print on bottle', leftQrX, qrY + qrSize + 12, {
            width: qrSize,
            align: 'center',
          });

        // Tier 2 QR — HIDDEN · scratch-off label
        doc.image(card.tier2, rightQrX, qrY, {
          width: qrSize,
          height: qrSize,
        });
        doc
          .fontSize(7)
          .fillColor(PALETTE.dark)
          .text('TIER 2 · HIDDEN', rightQrX, qrY + qrSize + 2, {
            width: qrSize,
            align: 'center',
          });
        doc
          .fontSize(6)
          .fillColor(PALETTE.sub)
          .text('scratch-off label', rightQrX, qrY + qrSize + 12, {
            width: qrSize,
            align: 'center',
          });

        // Dashed gold separator between the two QR codes.
        const sepX = leftQrX + qrSize + (rightQrX - (leftQrX + qrSize)) / 2;
        doc
          .save()
          .dash(3, { space: 3 })
          .moveTo(sepX, startY + 12)
          .lineTo(sepX, startY + cardHeight - 12)
          .lineWidth(1)
          .strokeColor(PALETTE.gold)
          .stroke()
          .restore();

        doc.y = startY + cardHeight + cardGap;
      }

      doc.end();
    });
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
