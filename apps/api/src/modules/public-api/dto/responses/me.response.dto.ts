import { ApiProperty } from '@nestjs/swagger';

class RateLimitDto {
  @ApiProperty() perMinute!: number;
}

export class MeResponseDto {
  @ApiProperty() tenantId!: string;
  @ApiProperty({ example: 'vk_live_3f9a' }) keyPrefix!: string;
  @ApiProperty({ type: [String] }) scopes!: string[];
  @ApiProperty({ type: RateLimitDto }) rateLimit!: RateLimitDto;
}
