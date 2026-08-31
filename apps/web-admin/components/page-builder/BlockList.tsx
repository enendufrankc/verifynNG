'use client';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@verifyng/ui';
import { GripVerticalIcon, TrashIcon } from 'lucide-react';
import type { Block } from '@verifynng/page-schema';

const AUTO_BLOCK_TYPES = new Set(['batch-info', 'verification-education']);

function SortableRow({
  block,
  selected,
  onSelect,
  onRemove,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: block.id,
    });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border p-2 ${
        selected ? 'border-brand bg-surface-sunken' : 'border-border'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-fg-faint cursor-grab"
        aria-label="Drag to reorder"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 text-left text-sm"
      >
        {block.type}
      </button>
      {!AUTO_BLOCK_TYPES.has(block.type) && (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <TrashIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** T10's drag-order block list (@dnd-kit). Auto blocks (batch-info,
 * verification-education) can be reordered but never removed. */
export function BlockList({
  blocks,
  selectedId,
  onSelect,
  onReorder,
  onRemove,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (blocks: Block[]) => void;
  onRemove: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(blocks, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={blocks.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {blocks.map((block) => (
            <SortableRow
              key={block.id}
              block={block}
              selected={block.id === selectedId}
              onSelect={() => onSelect(block.id)}
              onRemove={() => onRemove(block.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
