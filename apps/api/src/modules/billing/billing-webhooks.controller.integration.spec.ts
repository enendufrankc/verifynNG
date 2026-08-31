import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { loadEnv } from '@verifynng/config';
import { prisma } from '@verifynng/db';
import { AppModule } from '../../app.module';

describe('POST /v1/billing/webhooks/paystack (integration, real Postgres + Redis)', () => {
  let app: INestApplication;
  const secret = loadEnv().FAKE_PAY_SECRET;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  function signedBody(dataId: number) {
    const body = JSON.stringify({
      event: 'charge.success',
      data: {
        id: dataId,
        reference: `wh-test-${dataId}`,
        status: 'success',
        amount: 100,
        currency: 'NGN',
      },
    });
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    return { body, signature };
  }

  it('rejects a request with no/bad signature', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/v1/billing/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .send('{}')
      .expect(401);

    await request(server)
      .post('/v1/billing/webhooks/paystack')
      .set('x-paystack-signature', 'bad')
      .set('Content-Type', 'application/json')
      .send('{}')
      .expect(401);
  });

  it('accepts a validly-signed webhook and dedupes a replay (AC7)', async () => {
    const server = app.getHttpServer();
    const dataId = Math.floor(Math.random() * 1_000_000_000);
    const { body, signature } = signedBody(dataId);

    await request(server)
      .post('/v1/billing/webhooks/paystack')
      .set('x-paystack-signature', signature)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const eventId = `${dataId}-charge.success`;
    const firstCount = await prisma.gatewayWebhookEvent.count({
      where: { id: eventId },
    });
    expect(firstCount).toBe(1);

    // Replay the exact same (already-signed) payload.
    await request(server)
      .post('/v1/billing/webhooks/paystack')
      .set('x-paystack-signature', signature)
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);

    const secondCount = await prisma.gatewayWebhookEvent.count({
      where: { id: eventId },
    });
    expect(secondCount).toBe(1); // no duplicate row created
  });
});
