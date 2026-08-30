import { Global, Module } from '@nestjs/common';
import { prisma } from '@verifynng/db';

@Global()
@Module({
  providers: [
    {
      provide: 'PRISMA',
      useValue: prisma,
    },
  ],
  exports: ['PRISMA'],
})
export class PrismaModule {}
