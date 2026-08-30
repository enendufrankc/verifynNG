import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { notFound } from 'next/navigation';

export const revalidate = 3600;

const VALID_KINDS = [
  'privacy',
  'terms',
  'aup',
  'cookie',
  'subprocessors',
] as const;
type Kind = (typeof VALID_KINDS)[number];

interface LegalDocument {
  kind: Kind;
  version: string;
  locale: string;
  bodyMd: string;
  changeSummary: string | null;
  publishedAt: string;
}

const TITLES: Record<Kind, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  aup: 'Acceptable Use Policy',
  cookie: 'Cookie Policy',
  subprocessors: 'Subprocessors',
};

function isValidKind(kind: string): kind is Kind {
  return (VALID_KINDS as readonly string[]).includes(kind);
}

async function getDocument(kind: Kind): Promise<LegalDocument | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/v1/legal/${kind}`, {
    next: { revalidate },
  });
  if (!res.ok) return null;
  return (await res.json()) as LegalDocument;
}

async function getVersions(kind: Kind): Promise<LegalDocument[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/v1/legal/${kind}/versions`, {
    next: { revalidate },
  });
  if (!res.ok) return [];
  return (await res.json()) as LegalDocument[];
}

export function generateStaticParams() {
  return VALID_KINDS.map((kind) => ({ kind }));
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: rawKind } = await params;
  if (!isValidKind(rawKind)) notFound();
  const kind = rawKind;

  const [doc, versions] = await Promise.all([
    getDocument(kind),
    getVersions(kind),
  ]);
  if (!doc) notFound();

  const html = sanitizeHtml(await marked.parse(doc.bodyMd), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2']),
  });
  const previous = versions.filter((v) => v.version !== doc.version);

  return (
    <main className="mx-auto max-w-3xl p-8 print:p-0">
      <h1 className="text-3xl font-bold">{TITLES[kind]}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Version {doc.version} — published{' '}
        {new Date(doc.publishedAt).toLocaleDateString('en-GB')}
      </p>
      <article
        className="prose mt-6 max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {previous.length > 0 && (
        <section className="mt-10 border-t border-gray-200 pt-6">
          <h2 className="text-lg font-semibold">Previous versions</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-500">
            {previous.map((v) => (
              <li key={v.version}>
                Version {v.version} —{' '}
                {new Date(v.publishedAt).toLocaleDateString('en-GB')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
