import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BatchExportsProcessor } from './jobs/batch-exports.processor';
import { MintProcessor } from './jobs/mint.processor';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('registers queue processors without HTTP controllers', () => {
    const metadata = Reflect.getMetadata(
      'providers',
      WorkerModule,
    ) as unknown[];
    const controllers = Reflect.getMetadata('controllers', WorkerModule);

    expect(metadata).toEqual(
      expect.arrayContaining([MintProcessor, BatchExportsProcessor]),
    );
    expect(controllers).toBeUndefined();
  });
});
