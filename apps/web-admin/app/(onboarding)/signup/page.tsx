'use client';

import { useState } from 'react';

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const submit = async () => {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/tenants`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          country: 'NG',
          acceptPolicies: { aup: '2026-08-01', tos: '2026-08-01' },
        }),
      },
    );
    setMessage(response.ok ? 'Pending review' : await response.text());
  };
  return (
    <main className="mx-auto max-w-xl p-8">
      <p className="text-sm text-slate-500">Step {step} of 4</p>
      <h1 className="mt-3 text-3xl font-semibold">Verify your business</h1>
      {step === 1 && (
        <section className="mt-8 space-y-4">
          <label className="block">
            Business name
            <input
              className="mt-2 w-full rounded border p-3"
              value={name}
              onChange={(e) =>
                setName((e.target as unknown as { value: string }).value)
              }
              placeholder="Test Brand Ltd"
            />
          </label>
          <button
            className="rounded bg-slate-900 px-4 py-3 text-white"
            onClick={() => setStep(2)}
          >
            Continue
          </button>
        </section>
      )}
      {step === 2 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-xl">Business documents</h2>
          <p>
            Upload a CAC certificate and director ID. PDF, PNG and JPEG files up
            to 10 MB are accepted.
          </p>
          <input type="file" />
          <input type="file" />
          <button
            className="rounded bg-slate-900 px-4 py-3 text-white"
            onClick={() => setStep(3)}
          >
            Continue
          </button>
        </section>
      )}
      {step === 3 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-xl">Policies</h2>
          <label className="block">
            <input type="checkbox" /> I accept the AUP v2026-08-01
          </label>
          <label className="block">
            <input type="checkbox" /> I accept the ToS v2026-08-01
          </label>
          <button
            className="rounded bg-slate-900 px-4 py-3 text-white"
            onClick={submit}
          >
            Submit for review
          </button>
        </section>
      )}
      {message && (
        <p className="mt-8 rounded bg-emerald-50 p-4 font-medium">{message}</p>
      )}
    </main>
  );
}
