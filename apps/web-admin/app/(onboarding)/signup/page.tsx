'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
type DocumentKind = 'cac_certificate' | 'director_id';
type TenantStatus =
  | 'pending'
  | 'in_review'
  | 'rejected'
  | 'active'
  | 'suspended'
  | 'offboarded';
type SelectedDocument = {
  kind: DocumentKind;
  label: string;
  file?: File;
  progress: number;
  state: 'empty' | 'uploading' | 'uploaded' | 'error';
  error?: string;
};
type Tenant = {
  id: string;
  name: string;
  status: TenantStatus;
  statusReason?: string | null;
};
type PolicyVersions = { aup: string; tos: string };
const initialDocuments: SelectedDocument[] = [
  {
    kind: 'cac_certificate',
    label: 'CAC certificate',
    progress: 0,
    state: 'empty',
  },
  { kind: 'director_id', label: 'Director ID', progress: 0, state: 'empty' },
];

function errorMessage(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  if (value && typeof value === 'object' && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'string') return error.replaceAll('_', ' ');
  }
  return fallback;
}

async function readError(response: Response) {
  try {
    return errorMessage(
      await response.json(),
      `Request failed (${response.status})`,
    );
  } catch {
    return `Request failed (${response.status})`;
  }
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    type UploadEvent = {
      lengthComputable: boolean;
      loaded: number;
      total: number;
    };
    type UploadRequest = {
      open: (method: string, target: string) => void;
      setRequestHeader: (name: string, value: string) => void;
      send: (body: File) => void;
      status: number;
      upload: { onprogress: ((event: UploadEvent) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
    };
    const RequestConstructor = (
      globalThis as unknown as { XMLHttpRequest: new () => UploadRequest }
    ).XMLHttpRequest;
    const request = new RequestConstructor();
    request.open('PUT', url);
    request.setRequestHeader('content-type', file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? (onProgress(100), resolve())
        : reject(new Error(`Upload failed (${request.status})`));
    request.onerror = () =>
      reject(new Error('Upload failed. Check your connection and try again.'));
    request.send(file);
  });
}

function fieldValue(target: unknown) {
  return (target as { value: string }).value;
}
function selectedFile(target: unknown) {
  return (target as { files?: { 0?: File } }).files?.[0];
}
function checkedValue(target: unknown) {
  return (target as { checked: boolean }).checked;
}

export default function SignupPage() {
  const [step, setStep] = useState<
    'account' | 'business' | 'documents' | 'policies' | 'pending'
  >('account');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('NG');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [policyVersions, setPolicyVersions] = useState<PolicyVersions | null>(
    null,
  );
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [acceptAup, setAcceptAup] = useState(false);
  const [acceptTos, setAcceptTos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const headers = useMemo(
    () => ({
      'content-type': 'application/json',
      'x-user-id': 'development-user',
      'x-user-email': email || 'owner@local.verifyng',
      ...(tenant ? { 'x-tenant-id': tenant.id } : {}),
    }),
    [email, tenant?.id],
  );
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers ?? {}) },
      });
      if (!response.ok) throw new Error(await readError(response));
      return response;
    },
    [headers],
  );

  const createTenant = async () => {
    if (!name.trim()) {
      setMessage('Enter your business name to continue.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const [aupResponse, tosResponse] = await Promise.all([
        request('/policies/aup/current'),
        request('/policies/tos/current'),
      ]);
      const currentPolicies = {
        aup: ((await aupResponse.json()) as { version: string }).version,
        tos: ((await tosResponse.json()) as { version: string }).version,
      };
      setPolicyVersions(currentPolicies);
      const response = await request('/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          country,
          acceptPolicies: currentPolicies,
        }),
      });
      const result = (await response.json()) as { tenant: Tenant };
      setTenant(result.tenant);
      setRejectedReason(null);
      setStep('documents');
    } catch (error) {
      setMessage(errorMessage(error, 'We could not create your application.'));
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = (kind: DocumentKind, file?: File) => {
    if (!file) return;
    const error = !['application/pdf', 'image/png', 'image/jpeg'].includes(
      file.type,
    )
      ? 'Use a PDF, PNG, or JPEG file.'
      : file.size > MAX_FILE_SIZE
        ? 'Files must be 10 MB or smaller.'
        : undefined;
    setDocuments((current) =>
      current.map((document) =>
        document.kind === kind
          ? {
              ...document,
              file: error ? undefined : file,
              progress: 0,
              state: error ? 'error' : 'empty',
              error,
            }
          : document,
      ),
    );
  };

  const uploadDocuments = async () => {
    if (!tenant) return;
    const missing = documents.find((document) => !document.file);
    if (missing) {
      setMessage(`Select a ${missing.label.toLowerCase()} first.`);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      for (const document of documents) {
        if (!document.file) continue;
        setDocuments((current) =>
          current.map((item) =>
            item.kind === document.kind
              ? { ...item, state: 'uploading', progress: 0, error: undefined }
              : item,
          ),
        );
        const presignResponse = await request(
          `/tenants/${tenant.id}/verification/documents`,
          {
            method: 'POST',
            body: JSON.stringify({
              kind: document.kind,
              fileName: document.file.name,
              contentType: document.file.type,
              size: document.file.size,
            }),
          },
        );
        const presigned = (await presignResponse.json()) as {
          documentId: string;
          uploadUrl: string;
        };
        await uploadWithProgress(
          presigned.uploadUrl,
          document.file,
          (progress) =>
            setDocuments((current) =>
              current.map((item) =>
                item.kind === document.kind ? { ...item, progress } : item,
              ),
            ),
        );
        await request(
          `/tenants/${tenant.id}/verification/documents/${presigned.documentId}/complete`,
          { method: 'POST' },
        );
        setDocuments((current) =>
          current.map((item) =>
            item.kind === document.kind
              ? { ...item, state: 'uploaded', progress: 100 }
              : item,
          ),
        );
      }
      setStep('policies');
    } catch (error) {
      setMessage(
        errorMessage(error, 'One of the documents could not be uploaded.'),
      );
      setDocuments((current) =>
        current.map((item) =>
          item.state === 'uploading'
            ? { ...item, state: 'error', error: 'Upload did not complete.' }
            : item,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const acceptPoliciesAndSubmit = async () => {
    if (!tenant) return;
    if (!policyVersions) {
      setMessage('Policy versions are still loading. Try again in a moment.');
      return;
    }
    if (!acceptAup || !acceptTos) {
      setMessage('Accept both policies to submit your application.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await request(`/tenants/${tenant.id}/policies/accept`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'aup', version: policyVersions.aup }),
      });
      await request(`/tenants/${tenant.id}/policies/accept`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'tos', version: policyVersions.tos }),
      });
      const response = await request(
        `/tenants/${tenant.id}/verification/submit`,
        { method: 'POST' },
      );
      const submitted = (await response.json()) as Tenant;
      setTenant((current) =>
        current ? { ...current, ...submitted } : current,
      );
      setRejectedReason(null);
      setStep('pending');
    } catch (error) {
      setMessage(errorMessage(error, 'We could not submit your application.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const tenantId = tenant?.id;
    if (step !== 'pending' || !tenantId) return undefined;
    const poll = globalThis.setInterval(async () => {
      try {
        const response = await request(`/tenants/${tenantId}`);
        const latest = (await response.json()) as Tenant;
        setTenant(latest);
        if (
          latest.statusReason &&
          (latest.status === 'rejected' || latest.status === 'pending')
        ) {
          setRejectedReason(latest.statusReason);
        }
      } catch {
        /* transient poll failures are harmless */
      }
    }, 5000);
    return () => globalThis.clearInterval(poll);
  }, [request, step, tenant?.id, tenant?.status]);

  const replaceRejectedDocuments = () => {
    setDocuments(initialDocuments.map((document) => ({ ...document })));
    setMessage(
      'Replace the documents requested by support, then submit again.',
    );
    setStep('documents');
  };
  const stepNumber =
    step === 'account'
      ? 1
      : step === 'business'
        ? 2
        : step === 'documents'
          ? 3
          : step === 'policies'
            ? 4
            : 5;
  const showRejected = Boolean(
    rejectedReason &&
      (tenant?.status === 'rejected' || tenant?.status === 'pending'),
  );
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/30">
        <div className="bg-amber-300 px-7 py-8 sm:px-12">
          <p className="text-xs font-bold tracking-[0.24em] text-slate-700 uppercase">
            VerifyNG / New brand
          </p>
          <h1 className="mt-5 max-w-lg text-4xl font-black tracking-tight sm:text-5xl">
            Build trust before your first scan.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-800">
            Tell us about your business and prove the mark is yours. Our team
            will review your application.
          </p>
        </div>
        <div className="px-7 py-8 sm:px-12 sm:py-10">
          <div className="mb-8 flex items-center justify-between text-xs font-bold tracking-[0.18em] text-slate-400 uppercase">
            <span>Step {stepNumber} of 5</span>
            <span>{step === 'pending' ? 'Under review' : step}</span>
          </div>
          {step === 'account' && (
            <section className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Create your account</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Use the email your team should use for review updates.
                </p>
              </div>
              <label className="block text-sm font-semibold">
                Work email
                <input
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-950 focus:ring-4 focus:ring-amber-200"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(fieldValue(event.target))}
                  placeholder="you@yourbrand.com"
                  autoComplete="email"
                />
              </label>
              <button
                disabled={busy}
                className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-60"
                onClick={() => {
                  if (!email.trim() || !email.includes('@')) {
                    setMessage('Enter a valid work email to continue.');
                    return;
                  }
                  setMessage('');
                  setStep('business');
                }}
              >
                Continue to business details
              </button>
            </section>
          )}
          {step === 'business' && (
            <section className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Business details</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Use the legal business name that appears on your registration
                  documents.
                </p>
              </div>
              <label className="block text-sm font-semibold">
                Business name
                <input
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-950 focus:ring-4 focus:ring-amber-200"
                  value={name}
                  onChange={(event) => setName(fieldValue(event.target))}
                  placeholder="Test Brand Ltd"
                />
              </label>
              <label className="block text-sm font-semibold">
                Country
                <select
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  value={country}
                  onChange={(event) => setCountry(fieldValue(event.target))}
                >
                  <option value="NG">Nigeria</option>
                  <option value="GH">Ghana</option>
                  <option value="ZA">South Africa</option>
                </select>
              </label>
              <button
                disabled={busy}
                className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-60"
                onClick={createTenant}
              >
                {busy ? 'Creating application…' : 'Continue to documents'}
              </button>
            </section>
          )}
          {step === 'documents' && (
            <section className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Prove your business</h2>
                <p className="mt-2 text-sm text-slate-500">
                  PDF, PNG, and JPEG files up to 10 MB. Uploads go directly to
                  our secure storage.
                </p>
              </div>
              {documents.map((document) => (
                <div
                  key={document.kind}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm font-bold">
                      {document.label}
                      <input
                        className="mt-3 block w-full text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold"
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        onChange={(event) =>
                          chooseFile(document.kind, selectedFile(event.target))
                        }
                      />
                    </label>
                    <span className="text-xs font-bold text-slate-400 uppercase">
                      {document.state === 'uploaded'
                        ? 'Ready'
                        : (document.file?.name ?? 'Required')}
                    </span>
                  </div>
                  {document.state !== 'empty' && (
                    <div className="mt-4">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${document.state === 'error' ? 'bg-red-500' : 'bg-amber-400'}`}
                          style={{ width: `${document.progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {document.error ??
                          (document.state === 'uploaded'
                            ? 'Uploaded and verified.'
                            : `${document.progress}% uploaded`)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-3">
                <button
                  disabled={busy}
                  className="rounded-xl border border-slate-300 px-4 py-3 font-bold"
                  onClick={() => setStep('business')}
                >
                  Back
                </button>
                <button
                  disabled={busy}
                  className="flex-1 rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-60"
                  onClick={uploadDocuments}
                >
                  {busy ? 'Uploading…' : 'Upload and continue'}
                </button>
              </div>
            </section>
          )}
          {step === 'policies' && (
            <section className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">The trust agreement</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Review and accept both policies before your documents can
                  enter review.
                </p>
              </div>
              <label className="flex gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-6">
                <input
                  className="mt-1 size-4 accent-slate-950"
                  type="checkbox"
                  checked={acceptAup}
                  onChange={(event) => setAcceptAup(checkedValue(event.target))}
                />
                I accept the Acceptable Use Policy, version{' '}
                {policyVersions?.aup ?? 'current'}.
              </label>
              <label className="flex gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-6">
                <input
                  className="mt-1 size-4 accent-slate-950"
                  type="checkbox"
                  checked={acceptTos}
                  onChange={(event) => setAcceptTos(checkedValue(event.target))}
                />
                I accept the Terms of Service, version{' '}
                {policyVersions?.tos ?? 'current'}.
              </label>
              <div className="flex gap-3">
                <button
                  disabled={busy}
                  className="rounded-xl border border-slate-300 px-4 py-3 font-bold"
                  onClick={() => setStep('documents')}
                >
                  Back
                </button>
                <button
                  disabled={busy}
                  className="flex-1 rounded-xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-60"
                  onClick={acceptPoliciesAndSubmit}
                >
                  {busy ? 'Submitting…' : 'Submit for review'}
                </button>
              </div>
            </section>
          )}
          {step === 'pending' && (
            <section className="space-y-6">
              <div className="rounded-2xl bg-amber-100 p-6">
                <p className="text-xs font-bold tracking-[0.18em] text-amber-900 uppercase">
                  {showRejected ? 'Changes requested' : 'Application received'}
                </p>
                <h2 className="mt-3 text-3xl font-black">
                  {showRejected
                    ? 'A little more proof.'
                    : 'You are in the review queue.'}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {showRejected
                    ? (rejectedReason ??
                      'Support has requested changes to your application.')
                    : 'We will email you when support has reviewed your business. This page checks for updates automatically.'}
                </p>
              </div>
              {showRejected && (
                <button
                  className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white"
                  onClick={replaceRejectedDocuments}
                >
                  Replace documents and resubmit
                </button>
              )}
              <p className="text-center text-xs text-slate-400">
                Current status: {tenant?.status ?? 'pending'}
              </p>
            </section>
          )}
          {message && (
            <p
              role="alert"
              className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800"
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
