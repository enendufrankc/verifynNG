import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { INTERNAL_ONLY_KEY } from '../decorators/internal-only.decorator';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
export class InternalOnlyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private apiClientService: ApiClientService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScope = this.reflector.getAllAndOverride<string | boolean>(
      INTERNAL_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredScope === undefined) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer vk_')) {
      throw new UnauthorizedException();
    }

    const rawKey = authHeader.slice(7);
    try {
      const client = await this.apiClientService.verify(rawKey);
      request.apiClient = client;
      request.user = {
        apiClientId: client.apiClientId,
        tenantId: client.tenantId,
        scopes: client.scopes,
      };

      // If scope is specified, check it
      if (typeof requiredScope === 'string') {
        if (!client.scopes.includes(requiredScope)) {
          throw new UnauthorizedException();
        }
      }

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException();
    }
  }
}
