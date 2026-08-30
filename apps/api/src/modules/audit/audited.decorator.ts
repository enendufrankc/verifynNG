/**
 * @Audited() decorator — marks a controller method for automatic audit recording.
 *
 * The AuditInterceptor reads this metadata and calls AuditService.record()
 * after the handler completes with a 2xx status.
 */

import { SetMetadata } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';

export const AUDITED_KEY = 'audited';

export interface AuditedOptions {
  action: string;
  /** Custom target resolver. Defaults to { type: controllerName, id: req.params.id } */
  target?: (
    req: AuthenticatedRequest,
    res: Response,
  ) => { type: string; id: string };
  /** Additional keys to redact from the payload */
  redact?: string[];
}

export const Audited = (
  action: string,
  opts?: Omit<AuditedOptions, 'action'>,
) =>
  SetMetadata(AUDITED_KEY, {
    action,
    ...opts,
  } as AuditedOptions);
