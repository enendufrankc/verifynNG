import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient, Shipment } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../../common/events.service';
import { BatchLifecycleService } from './batch-lifecycle.service';
import { DeliveryService } from './delivery.service';
import type { OemContext } from './guards/oem-scope.guard';

export interface ShipInput {
  carrier?: string;
  trackingRef?: string;
  shippedAt?: string;
  expectedArrivalAt?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class ShipmentService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private deliveryService: DeliveryService,
    private batchLifecycle: BatchLifecycleService,
    private auditService: AuditService,
    private events: EventsService,
  ) {}

  async ship(
    deliveryId: string,
    input: ShipInput,
    oem: OemContext,
  ): Promise<Shipment> {
    const delivery = await this.deliveryService.assertOemAccess(
      deliveryId,
      oem.oemId,
      oem.tenantId,
    );

    // Validated before the write: a repeat `ship` call 409s here rather than
    // tripping Shipment.batchId's unique constraint.
    await this.batchLifecycle.transition(
      delivery.tenantId,
      delivery.batchId,
      'shipped',
      { type: 'oem', id: oem.oemUserId },
    );

    const shipment = await this.prisma.shipment.create({
      data: {
        tenantId: delivery.tenantId,
        batchId: delivery.batchId,
        oemId: delivery.oemId,
        oemUserId: oem.oemUserId,
        carrier: input.carrier,
        trackingRef: input.trackingRef,
        shippedAt: input.shippedAt ? new Date(input.shippedAt) : new Date(),
        expectedArrivalAt: input.expectedArrivalAt
          ? new Date(input.expectedArrivalAt)
          : undefined,
        meta: input.meta as Prisma.InputJsonValue | undefined,
      },
    });

    await this.auditService.record({
      tenantId: delivery.tenantId,
      actor: { type: 'oem', id: oem.oemUserId },
      action: 'batch.ship',
      target: { type: 'batch', id: delivery.batchId },
      payload: { carrier: input.carrier, trackingRef: input.trackingRef },
    });

    await this.events.emit('batch.shipped', {
      tenantId: delivery.tenantId,
      batchId: delivery.batchId,
      oemId: delivery.oemId,
      shipmentId: shipment.id,
      shippedAt: shipment.shippedAt,
      expectedArrivalAt: shipment.expectedArrivalAt,
    });

    return shipment;
  }
}
