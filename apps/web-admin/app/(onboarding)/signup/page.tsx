'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Label,
  ProgressBar,
} from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';

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
/** `/api/auth/session` forwards `/auth/me`, whose memberships nest the tenant
 *  rather than flattening its name and slug. Accept both shapes. */
type SessionMembership = {
  tenantId: string;
  role: string;
  tenantName?: string;
  tenantSlug?: string;
  tenant?: { name?: string; slug?: string };
};
type SessionResult = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    platformRole: string | null;
    mfaEnabled: boolean;
  };
  memberships: SessionMembership[];
  activeTenantId: string | null;
  activeRole: string | null;
  mfaRequired?: boolean;
};
const MIN_PASSWORD_LENGTH = 12;
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

export default function SignupPage() {
  const [step, setStep] = useState<
    'account' | 'business' | 'documents' | 'policies' | 'pending'
  >('account');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [password, setPassword] = useState('');
  /** `register` creates the account; `signin` is offered once the email turns
   *  out to already have one, so an owner can resume an application. */
  const [accountMode, setAccountMode] = useState<'register' | 'signin'>(
    'register',
  );
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
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const headers = useMemo(() => {
    const value: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (accessToken) value.authorization = `Bearer ${accessToken}`;
    return value;
  }, [accessToken]);
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

  /**
   * The console's own session route rather than the API directly: it is what
   * sets the httpOnly `vg_refresh` cookie the console middleware looks for,
   * so an owner who finishes onboarding is already signed in.
   */
  const openSession = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json();
    if (!response.ok)
      throw new Error(errorMessage(data, 'We could not sign you in.'));
    return data as SessionResult;
  }, []);

  const storeSession = useCallback(
    (session: SessionResult) => {
      const memberships = session.memberships.map((membership) => ({
        tenantId: membership.tenantId,
        tenantName: membership.tenantName ?? membership.tenant?.name ?? '',
        tenantSlug: membership.tenantSlug ?? membership.tenant?.slug ?? '',
        role: membership.role as 'owner' | 'operator' | 'viewer' | 'oem',
      }));
      const active = memberships[0];
      setAuth({
        accessToken: session.accessToken,
        user: session.user,
        memberships,
        activeTenantId: session.activeTenantId ?? active?.tenantId ?? '',
        activeRole: session.activeRole ?? active?.role ?? 'owner',
      });
      return memberships;
    },
    [setAuth],
  );

  /**
   * Sends an owner to wherever their application actually is. A brand that
   * support has already activated belongs in the console, not in this
   * wizard; one still in review resumes at the pending step.
   */
  const resumeExistingApplication = useCallback(
    async (session: SessionResult, memberships: { tenantId: string }[]) => {
      const membership = memberships[0];
      if (!membership) {
        setStep('business');
        return;
      }
      const response = await fetch(
        `${API_URL}/tenants/${membership.tenantId}`,
        { headers: { authorization: `Bearer ${session.accessToken}` } },
      );
      if (!response.ok) {
        setStep('business');
        return;
      }
      const existing = (await response.json()) as Tenant;
      if (existing.status === 'active') {
        window.location.assign('/');
        return;
      }
      setTenant(existing);
      setRejectedReason(existing.statusReason ?? null);
      setStep('pending');
    },
    [],
  );

  const createAccount = async () => {
    if (!email.trim() || !email.includes('@')) {
      setMessage('Enter a valid work email to continue.');
      return;
    }
    if (accountMode === 'register' && !contactName.trim()) {
      setMessage('Enter your name so we know who to reply to.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(
        `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (accountMode === 'register') {
        const registration = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            displayName: contactName.trim(),
          }),
        });
        if (registration.status === 409) {
          setAccountMode('signin');
          setMessage(
            'That email already has an account. Enter its password to pick up where you left off.',
          );
          return;
        }
        if (!registration.ok) throw new Error(await readError(registration));
      }
      const session = await openSession({
        action: 'login',
        email: email.trim(),
        password,
      });
      if (session.mfaRequired) {
        setMessage(
          'This account uses two-factor authentication. Sign in from the login page, then return here.',
        );
        return;
      }
      const memberships = storeSession(session);
      await resumeExistingApplication(session, memberships);
    } catch (error) {
      setMessage(
        errorMessage(
          error,
          accountMode === 'register'
            ? 'We could not create your account.'
            : 'We could not sign you in.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

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
      // The access token was minted before this membership existed, so it
      // still carries an empty tenant claim — TenantContextGuard would 404
      // every /tenants/:id call below on its tenant-match rule. Rotating the
      // session now picks the new membership up.
      storeSession(await openSession({ action: 'refresh' }));
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
    if (tenant?.id) localStorage.setItem('verifyng.tenantId', tenant.id);
  }, [tenant?.id]);

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
        // Approved while this page was open — the owner has a console now.
        if (latest.status === 'active') window.location.assign('/');
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
  const stepLabel = step === 'pending' ? 'Under review' : step;

  return (
    <main className="bg-bg px-s4 py-s10 sm:px-s6 min-h-screen">
      <div className="border-border bg-surface mx-auto max-w-2xl overflow-hidden rounded-md border shadow-md">
        <div className="border-border bg-surface-sunken px-s6 py-s8 sm:px-s10 border-b">
          <p className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
            VerifyNG / New brand
          </p>
          <h1 className="text-fg mt-s4 max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
            Build trust before your first scan.
          </h1>
          <p className="text-fg-muted mt-s3 max-w-md text-sm leading-6">
            Tell us about your business and prove the mark is yours. Our team
            will review your application.
          </p>
        </div>
        <div className="px-s6 py-s8 sm:px-s10">
          <div className="mb-s8 space-y-s2">
            <div className="text-fg-muted flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
              <span>Step {stepNumber} of 5</span>
              <span>{stepLabel}</span>
            </div>
            <ProgressBar
              value={stepNumber}
              max={5}
              label={`Step ${stepNumber} of 5`}
              className="[&>div:first-child]:hidden"
            />
          </div>
          {step === 'account' && (
            <section className="space-y-s6">
              <div className="space-y-s2">
                <h2 className="text-fg text-2xl font-semibold tracking-tight">
                  {accountMode === 'register'
                    ? 'Create your account'
                    : 'Sign in to continue'}
                </h2>
                <p className="text-fg-muted text-sm">
                  {accountMode === 'register'
                    ? 'Use the email your team should use for review updates.'
                    : 'This email already has an account. Sign in to pick your application back up.'}
                </p>
              </div>
              {accountMode === 'register' && (
                <FormField label="Your name" htmlFor="signup-contact" required>
                  <Input
                    id="signup-contact"
                    value={contactName}
                    onChange={(event) =>
                      setContactName(fieldValue(event.target))
                    }
                    placeholder="Ada Obi"
                    autoComplete="name"
                  />
                </FormField>
              )}
              <FormField label="Work email" htmlFor="signup-email" required>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(fieldValue(event.target))}
                  placeholder="you@yourbrand.com"
                  autoComplete="email"
                />
              </FormField>
              <FormField
                label="Password"
                htmlFor="signup-password"
                required
                description={
                  accountMode === 'register'
                    ? `At least ${MIN_PASSWORD_LENGTH} characters.`
                    : undefined
                }
              >
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(fieldValue(event.target))}
                  autoComplete={
                    accountMode === 'register'
                      ? 'new-password'
                      : 'current-password'
                  }
                />
              </FormField>
              <div className="border-border pt-s5 border-t">
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={createAccount}
                >
                  {busy
                    ? 'Just a moment\u2026'
                    : accountMode === 'register'
                      ? 'Create account and continue'
                      : 'Sign in and continue'}
                </Button>
              </div>
            </section>
          )}
          {step === 'business' && (
            <section className="space-y-s6">
              <div className="space-y-s2">
                <h2 className="text-fg text-2xl font-semibold tracking-tight">
                  Business details
                </h2>
                <p className="text-fg-muted text-sm">
                  Use the legal business name that appears on your registration
                  documents.
                </p>
              </div>
              <FormField label="Business name" htmlFor="signup-name" required>
                <Input
                  id="signup-name"
                  value={name}
                  onChange={(event) => setName(fieldValue(event.target))}
                  placeholder="Test Brand Ltd"
                />
              </FormField>
              <FormField label="Country" htmlFor="signup-country" required>
                <select
                  id="signup-country"
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-11 w-full rounded-sm border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  value={country}
                  onChange={(event) => setCountry(fieldValue(event.target))}
                >
                  <option value="NG">Nigeria</option>
                  <option value="GH">Ghana</option>
                  <option value="ZA">South Africa</option>
                </select>
              </FormField>
              <div className="border-border pt-s5 border-t">
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={createTenant}
                >
                  {busy
                    ? 'Creating application\u2026'
                    : 'Continue to documents'}
                </Button>
              </div>
            </section>
          )}
          {step === 'documents' && (
            <section className="space-y-s6">
              <div className="space-y-s2">
                <h2 className="text-fg text-2xl font-semibold tracking-tight">
                  Prove your business
                </h2>
                <p className="text-fg-muted text-sm">
                  PDF, PNG, and JPEG files up to 10 MB. Uploads go directly to
                  our secure storage.
                </p>
              </div>
              {documents.map((document) => (
                <div
                  key={document.kind}
                  className="border-border p-s4 space-y-s3 rounded-sm border"
                >
                  <div className="gap-s4 flex items-start justify-between">
                    <Label
                      htmlFor={`signup-doc-${document.kind}`}
                      className="text-fg"
                    >
                      {document.label}
                    </Label>
                    <span className="text-fg-faint text-xs font-semibold tracking-wide uppercase">
                      {document.state === 'uploaded'
                        ? 'Ready'
                        : (document.file?.name ?? 'Required')}
                    </span>
                  </div>
                  <input
                    id={`signup-doc-${document.kind}`}
                    className="text-fg-muted file:bg-surface-sunken file:text-fg focus-visible:ring-ring block w-full rounded-sm text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={(event) =>
                      chooseFile(document.kind, selectedFile(event.target))
                    }
                  />
                  {document.state === 'error' && document.error && (
                    <p className="bg-v-flag-tint text-v-flag p-s3 rounded-sm text-sm">
                      {document.error}
                    </p>
                  )}
                  {(document.state === 'uploading' ||
                    document.state === 'uploaded') && (
                    <ProgressBar
                      value={document.progress}
                      label={
                        document.state === 'uploaded'
                          ? 'Uploaded and verified.'
                          : `${document.progress}% uploaded`
                      }
                    />
                  )}
                </div>
              ))}
              <div className="border-border gap-s3 pt-s5 flex flex-col border-t sm:flex-row-reverse">
                <Button
                  className="flex-1"
                  disabled={busy}
                  onClick={uploadDocuments}
                >
                  {busy ? 'Uploading\u2026' : 'Upload and continue'}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep('business')}
                >
                  Back
                </Button>
              </div>
            </section>
          )}
          {step === 'policies' && (
            <section className="space-y-s6">
              <div className="space-y-s2">
                <h2 className="text-fg text-2xl font-semibold tracking-tight">
                  The trust agreement
                </h2>
                <p className="text-fg-muted text-sm">
                  Review and accept both policies before your documents can
                  enter review.
                </p>
              </div>
              <div className="border-border p-s4 gap-s3 flex items-start rounded-sm border">
                <Checkbox
                  id="accept-aup"
                  className="mt-s1"
                  checked={acceptAup}
                  onCheckedChange={(value) => setAcceptAup(value === true)}
                />
                <Label htmlFor="accept-aup" className="text-fg leading-6">
                  I accept the Acceptable Use Policy, version{' '}
                  {policyVersions?.aup ?? 'current'}.
                </Label>
              </div>
              <div className="border-border p-s4 gap-s3 flex items-start rounded-sm border">
                <Checkbox
                  id="accept-tos"
                  className="mt-s1"
                  checked={acceptTos}
                  onCheckedChange={(value) => setAcceptTos(value === true)}
                />
                <Label htmlFor="accept-tos" className="text-fg leading-6">
                  I accept the Terms of Service, version{' '}
                  {policyVersions?.tos ?? 'current'}.
                </Label>
              </div>
              <div className="border-border gap-s3 pt-s5 flex flex-col border-t sm:flex-row-reverse">
                <Button
                  className="flex-1"
                  disabled={busy}
                  onClick={acceptPoliciesAndSubmit}
                >
                  {busy ? 'Submitting\u2026' : 'Submit for review'}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep('documents')}
                >
                  Back
                </Button>
              </div>
            </section>
          )}
          {step === 'pending' && (
            <section className="space-y-s6">
              <div
                className={`p-s6 space-y-s3 rounded-sm ${
                  showRejected
                    ? 'bg-v-susp-tint text-v-susp'
                    : 'bg-surface-sunken text-fg'
                }`}
              >
                <p className="text-xs font-semibold tracking-wider uppercase">
                  {showRejected ? 'Changes requested' : 'Application received'}
                </p>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {showRejected
                    ? 'A little more proof.'
                    : 'You are in the review queue.'}
                </h2>
                <p className="text-sm leading-6">
                  {showRejected
                    ? (rejectedReason ??
                      'Support has requested changes to your application.')
                    : 'We will email you when support has reviewed your business. This page checks for updates automatically.'}
                </p>
              </div>
              {showRejected && (
                <div className="border-border pt-s5 border-t">
                  <Button className="w-full" onClick={replaceRejectedDocuments}>
                    Replace documents and resubmit
                  </Button>
                </div>
              )}
              {tenant?.status === 'active' && (
                <div className="border-border pt-s5 border-t">
                  <Button
                    className="w-full"
                    onClick={() => window.location.assign('/')}
                  >
                    Open your console
                  </Button>
                </div>
              )}
              <p className="text-fg-faint text-center text-xs">
                Current status: {tenant?.status ?? 'pending'}
              </p>
            </section>
          )}
          {message && (
            <p
              role="alert"
              data-testid="signup-error"
              className="bg-v-flag-tint text-v-flag mt-s6 p-s4 rounded-sm text-sm font-medium"
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
