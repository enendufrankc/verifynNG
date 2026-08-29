import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { StaticKeyRing } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const env = loadEnv();
    const keyRing = new StaticKeyRing(env.JWT_KEYS, env.JWT_ACTIVE_KID);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (
        _request: any,
        rawJwtToken: string,
        done: (err: any, secret?: string | Buffer) => void,
      ) => {
        try {
          const decoded = JSON.parse(
            Buffer.from(rawJwtToken.split('.')[0], 'base64url').toString(),
          );
          const secret = keyRing.get(decoded.kid);
          if (!secret) {
            return done(
              new UnauthorizedException('Unknown signing key'),
              undefined as any,
            );
          }
          done(null, Buffer.from(secret));
        } catch {
          done(
            new UnauthorizedException('Invalid token'),
            undefined as any,
          );
        }
      },
    } as any);
  }

  async validate(payload: any) {
    // Skip MFA tokens — they're not general-purpose auth tokens
    if (payload.mfa) return null;

    return {
      userId: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
      platformRole: payload.prole,
      sessionId: payload.sid,
    };
  }
}
