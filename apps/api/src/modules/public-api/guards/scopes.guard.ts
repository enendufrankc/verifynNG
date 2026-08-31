import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SCOPES_KEY } from '../decorators/scopes.decorator.js';

/** Runs after ApiKeyGuard — requires `request.apiKey` to already be set. */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.apiKey;
    if (!apiKey) throw new UnauthorizedException();

    const hasAllScopes = required.every((s) => apiKey.scopes.includes(s));
    if (!hasAllScopes) throw new ForbiddenException();
    return true;
  }
}
