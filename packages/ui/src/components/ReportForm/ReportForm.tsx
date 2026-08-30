'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { ProgressBar } from '../ui/progress-bar';
import { downscaleImage } from './downscale';
import type { FormStep, PurchaseChannel, ReportFormProps } from './types';

const CHANNELS: { value: PurchaseChannel; label: string }[] = [
  { value: 'open_market', label: 'Open market' },
  { value: 'street_vendor', label: 'Street vendor' },
  { value: 'online_marketplace', label: 'Online marketplace' },
  { value: 'social_media', label: 'Social media' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'brand_store', label: 'Brand store' },
  { value: 'other', label: 'Other' },
];

export function ReportForm({
  tenantSlug,
  scanEventId,
  apiBaseUrl,
  captchaSiteKey,
  onSubmitted,
}: ReportFormProps) {
  const [step, setStep] = useState<FormStep>('details');
  const [sellerName, setSellerName] = useState('');
  const [sellerLocation, setSellerLocation] = useState('');
  const [purchaseChannel, setPurchaseChannel] =
    useState<PurchaseChannel>('open_market');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<
    { id: string; name: string; progress: number }[]
  >([]);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function uploadPhoto(file: File) {
    const blob = await downscaleImage(file);
    const contentType = file.type || 'image/jpeg';
    const upRes = await fetch(
      `${apiBaseUrl}/v1/public/${tenantSlug}/reports/upload-url`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType,
          sizeBytes: blob.size,
          captchaToken,
        }),
      },
    );
    if (!upRes.ok) throw new Error('upload_url_failed');
    const { photoId, uploadUrl } = await upRes.json();
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    setPhotos((prev) => [
      ...prev,
      { id: photoId, name: file.name, progress: 100 },
    ]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/v1/public/${tenantSlug}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanEventId,
          sellerName: sellerName || undefined,
          sellerLocation: sellerLocation || undefined,
          purchaseChannel,
          description: description || undefined,
          photoIds: photos.map((p) => p.id),
          contact: email ? { email, consent } : undefined,
          captchaToken,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `submit_failed_${res.status}`);
      }
      const body = await res.json();
      setReference(body.reference);
      setStep('done');
      onSubmitted?.(body.reference);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done' && reference) {
    return (
      <div className="space-y-4 rounded-lg border p-6">
        <h3 className="text-lg font-medium">Report submitted</h3>
        <p className="text-muted-foreground text-sm">Reference</p>
        <div className="flex items-center gap-2">
          <code className="bg-muted rounded px-2 py-1 text-sm">
            {reference}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(reference)}
          >
            Copy
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-lg border p-6" data-testid="report-form">
      <ProgressBar
        value={['details', 'photos', 'contact'].indexOf(step) + 1}
        max={3}
        showValue={false}
      />

      {step === 'details' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="sellerName">Seller name (optional)</Label>
            <Input
              id="sellerName"
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sellerLocation">
              Where did you buy this? (optional)
            </Label>
            <Input
              id="sellerLocation"
              value={sellerLocation}
              onChange={(e) => setSellerLocation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="purchaseChannel">Purchase channel</Label>
            <Select
              value={purchaseChannel}
              onValueChange={(v) => setPurchaseChannel(v as PurchaseChannel)}
            >
              <SelectTrigger id="purchaseChannel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="description">
              What made you suspicious? (optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>
          <Button onClick={() => setStep('photos')}>Continue</Button>
        </div>
      )}

      {step === 'photos' && (
        <div className="space-y-4">
          <Label htmlFor="photoInput">Photos (up to 5)</Label>
          <input
            id="photoInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            disabled={photos.length >= 5}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(
                0,
                5 - photos.length,
              );
              for (const file of files) {
                try {
                  await uploadPhoto(file);
                } catch {
                  setError('photo_upload_failed');
                }
              }
            }}
          />
          <ul className="space-y-1 text-sm">
            {photos.map((p) => (
              <li key={p.id}>{p.name} — uploaded</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('details')}>
              Back
            </Button>
            <Button onClick={() => setStep('contact')}>Continue</Button>
          </div>
        </div>
      )}

      {step === 'contact' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email (optional — to receive updates)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {email && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(c) => setConsent(Boolean(c))}
              />
              <Label htmlFor="consent">
                I consent to being contacted about this report (v1)
              </Label>
            </div>
          )}
          <div>
            <Label htmlFor="captchaToken">Verification</Label>
            {captchaSiteKey ? (
              <div
                data-testid="turnstile-widget-slot"
                data-sitekey={captchaSiteKey}
              />
            ) : (
              <Input
                id="captchaToken"
                placeholder="ok-demo (dev captcha token)"
                value={captchaToken}
                onChange={(e) => setCaptchaToken(e.target.value)}
              />
            )}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('photos')}>
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                submitting || !captchaToken || (Boolean(email) && !consent)
              }
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
