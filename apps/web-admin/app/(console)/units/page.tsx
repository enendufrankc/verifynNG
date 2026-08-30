'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, PageHeader } from '@verifyng/ui';

export default function UnitsPage() {
  const router = useRouter();
  const [unitId, setUnitId] = useState('');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Units"
        description="Unit state, lifecycle, and scan history. Open a batch from Batches → Units & recall, or a unit from an anomaly's detail page — or jump straight to a unit id below."
      />
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (unitId.trim()) router.push(`/units/${unitId.trim()}`);
        }}
      >
        <Input
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          placeholder="Unit id"
        />
        <Button type="submit">Open</Button>
      </form>
    </div>
  );
}
