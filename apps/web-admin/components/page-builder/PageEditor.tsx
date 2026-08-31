'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Input, Textarea, useToast } from '@verifyng/ui';
import Link from 'next/link';
import {
  defaultBlock,
  type Block,
  type BlockType,
  type Seo,
  type ThemeOverride,
} from '@verifynng/page-schema';
import { useAuth } from '@/lib/auth-store';
import { apiClient } from '@/lib/api-client';
import {
  getPreviewToken,
  publishProductPage,
  saveDraft,
  type ProductPage,
} from '@/lib/product-pages';
import { BlockList } from './BlockList';
import { BlockForm } from './BlockForm';
import { AddBlockMenu } from './AddBlockMenu';

const AUTOSAVE_DEBOUNCE_MS = 800;

export function PageEditor({ page: initialPage }: { page: ProductPage }) {
  const { activeTenantId, role } = useAuth();
  const canWrite = role === 'operator' || role === 'owner';
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [theme, setTheme] = useState<ThemeOverride>(initialPage.draftTheme);
  const [blocks, setBlocks] = useState<Block[]>(initialPage.draftBlocks);
  const [seo, setSeo] = useState<Seo>(initialPage.draftSeo);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(
    initialPage.draftUpdatedAt,
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialPage.draftBlocks[0]?.id ?? null,
  );
  const [changeNote, setChangeNote] = useState('');
  const [previewNonce, setPreviewNonce] = useState(0);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const tenantQuery = useQuery({
    queryKey: ['tenant', activeTenantId],
    queryFn: () =>
      apiClient.get<{ slug: string }>(`/tenants/${activeTenantId}`),
    enabled: !!activeTenantId,
  });

  const previewTokenQuery = useQuery({
    queryKey: ['product-page-preview-token', initialPage.id],
    queryFn: () => getPreviewToken(initialPage.id),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveDraft(initialPage.id, { theme, blocks, seo }, draftUpdatedAt),
    onSuccess: (updated) => {
      setDraftUpdatedAt(updated.draftUpdatedAt);
      setPreviewNonce((n) => n + 1);
    },
    onError: () => {
      toast({
        title: 'Autosave conflict — reload this page',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveMutation.mutate();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // saveMutation is a new object every render (react-query) — depending on
    // it would defeat the debounce by re-arming the timer on every autosave
    // response, not just on real edits to theme/blocks/seo.
  }, [theme, blocks, seo]);

  const publishMutation = useMutation({
    mutationFn: () =>
      publishProductPage(initialPage.id, changeNote || undefined),
    onSuccess: () => {
      const url = tenantQuery.data
        ? `${process.env.NEXT_PUBLIC_VERIFY_URL ?? ''}/p/${tenantQuery.data.slug}/${initialPage.slug}`
        : `/p/.../${initialPage.slug}`;
      toast({ title: 'Published', description: url });
      queryClient.invalidateQueries({
        queryKey: ['product-page', initialPage.id],
      });
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof Error ? error.message : 'Publish failed',
        variant: 'destructive',
      });
    },
  });

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );

  function updateBlock(next: Block) {
    setBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  }

  function addBlock(type: BlockType) {
    const block = defaultBlock(type);
    setBlocks((prev) => [...prev, block]);
    setSelectedBlockId(block.id);
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  const previewUrl =
    tenantQuery.data && previewTokenQuery.data
      ? `${process.env.NEXT_PUBLIC_VERIFY_URL ?? 'http://localhost:3000'}/p/${tenantQuery.data.slug}/${initialPage.slug}/preview?token=${encodeURIComponent(previewTokenQuery.data.token)}&_r=${previewNonce}`
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_420px]">
      <div className="space-y-3">
        <AddBlockMenu onAdd={addBlock} />
        <BlockList
          blocks={blocks}
          selectedId={selectedBlockId}
          onSelect={setSelectedBlockId}
          onReorder={setBlocks}
          onRemove={removeBlock}
        />
        <div className="border-border space-y-2 rounded-md border p-3">
          <p className="text-sm font-semibold">Theme override</p>
          <FormField label="Primary colour">
            <Input
              value={theme.palette?.primary ?? ''}
              onChange={(e) =>
                setTheme({
                  ...theme,
                  palette: {
                    ...theme.palette,
                    primary: e.target.value || undefined,
                  },
                })
              }
            />
          </FormField>
        </div>
        <div className="border-border space-y-2 rounded-md border p-3">
          <p className="text-sm font-semibold">SEO</p>
          <FormField label="Title">
            <Input
              value={seo.title ?? ''}
              onChange={(e) =>
                setSeo({ ...seo, title: e.target.value || undefined })
              }
            />
          </FormField>
          <FormField label="Description">
            <Textarea
              rows={2}
              value={seo.description ?? ''}
              onChange={(e) =>
                setSeo({ ...seo, description: e.target.value || undefined })
              }
            />
          </FormField>
        </div>
      </div>

      <div className="border-border rounded-md border p-4">
        {selectedBlock ? (
          <BlockForm
            pageId={initialPage.id}
            block={selectedBlock}
            onChange={updateBlock}
          />
        ) : (
          <p className="text-fg-muted text-sm">Select a block to edit it.</p>
        )}
        <div className="border-border mt-6 space-y-2 border-t pt-4">
          <FormField label="Change note">
            <Input
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
            />
          </FormField>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={!canWrite || publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish'}
            </Button>
            <Link
              href={`/pages/${initialPage.id}/history`}
              className="text-brand-text text-sm underline"
            >
              History
            </Link>
            {saveMutation.isPending && (
              <span className="text-fg-muted text-xs">Saving…</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-border rounded-md border p-2">
        <p className="text-fg-muted mb-2 text-xs">Live preview</p>
        {previewUrl ? (
          <iframe
            src={previewUrl}
            className="h-[70vh] w-full rounded-md border-0"
            title="Page preview"
          />
        ) : (
          <p className="text-fg-muted text-sm">Loading preview…</p>
        )}
      </div>
    </div>
  );
}
