import { Body, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import { Scopes } from '../decorators/scopes.decorator.js';
import { ApiPublicCommonResponses } from '../decorators/api-common-responses.decorator.js';
import { ErrorResponseDto } from '../dto/responses/error.response.dto.js';
import { WebhookEndpointService } from '../../webhooks/webhook-endpoint.service.js';
import { CreateWebhookEndpointDto } from '../../webhooks/dto/create-webhook-endpoint.dto.js';

@ApiTags('webhook-endpoints')
@ApiBearerAuth('apiKey')
@ApiPublicCommonResponses()
@PublicApiController('api/v1/webhook-endpoints')
export class PublicWebhookEndpointsController {
  constructor(private readonly webhookEndpoints: WebhookEndpointService) {}

  @Get()
  @ApiOperation({
    summary: "List the authenticated tenant's webhook endpoints",
  })
  @ApiResponse({ status: 200 })
  list(@Req() req: Request) {
    return this.webhookEndpoints.list(req.apiKey!.tenantId);
  }

  @Post()
  @HttpCode(201)
  @Scopes('write:batches')
  @ApiOperation({
    summary: 'Create a webhook endpoint — the secret is shown once',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  create(@Req() req: Request, @Body() dto: CreateWebhookEndpointDto) {
    return this.webhookEndpoints.create(req.apiKey!.tenantId, dto);
  }

  @Delete(':id')
  @Scopes('write:batches')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  delete(@Req() req: Request, @Param('id') id: string) {
    return this.webhookEndpoints.delete(req.apiKey!.tenantId, id);
  }
}
