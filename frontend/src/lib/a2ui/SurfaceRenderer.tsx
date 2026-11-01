'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, LayoutPanelTop } from 'lucide-react';
import { validateSurface, type A2UIAction, type A2UISurface } from './surface';

export type SurfaceActionHandler = (action: A2UIAction, label: string) => Promise<boolean>;
interface Props {
  surface: unknown;
  isStreaming?: boolean;
  submittedSelection?: string;
  onAction?: SurfaceActionHandler;
}

/** Invalid input never reaches the recursive renderer, including hydrated history. */
export function SurfaceRenderer({ surface, ...props }: Props) {
  const validated = useMemo(() => {
    try {
      return validateSurface(surface);
    } catch {
      return null;
    }
  }, [surface]);
  if (!validated) return null;
  return (
    <ValidatedSurface key={validated.createSurface.surfaceId} surface={validated} {...props} />
  );
}

function ValidatedSurface({
  surface,
  isStreaming,
  onAction,
  submittedSelection,
}: Omit<Props, 'surface'> & { surface: A2UISurface }) {
  const { surfaceId, components } = surface.createSurface;
  const nodes = new Map(components.map(node => [node.id, node]));
  const [localSelection, setSelection] = useState('');
  const picker = components.find(node => node.component === 'ChoicePicker');
  const restoredSelection =
    picker?.component === 'ChoicePicker' &&
    picker.options.some(option => option.value === submittedSelection)
      ? submittedSelection
      : undefined;
  const selection = restoredSelection || localSelection;
  const [state, setState] = useState<'ready' | 'pending' | 'sent' | 'failed'>('ready');
  const dispatching = useRef(false);
  const groupId = useId();
  const sent = !!restoredSelection || state === 'sent';
  const locked = !!isStreaming || state === 'pending' || sent || !onAction;
  const submit = async (sourceComponentId: string) => {
    if (locked || dispatching.current || !selection || !onAction) return;
    dispatching.current = true;
    setState('pending');
    const picker = components.find(node => node.component === 'ChoicePicker');
    const label =
      picker?.component === 'ChoicePicker'
        ? picker.options.find(option => option.value === selection)?.label
        : undefined;
    try {
      const success = await onAction(
        {
          version: 'v1.0',
          action: {
            name: 'select_option',
            surfaceId,
            sourceComponentId,
            timestamp: new Date().toISOString(),
            context: { selection: [selection] },
          },
        },
        label || selection
      );
      setState(success ? 'sent' : 'failed');
    } catch {
      setState('failed');
    } finally {
      dispatching.current = false;
    }
  };
  const renderNode = (id: string): ReactNode => {
    const node = nodes.get(id)!;
    switch (node.component) {
      case 'Text':
        return (
          <p
            key={id}
            className={
              node.variant === 'caption'
                ? 'whitespace-pre-wrap text-xs leading-relaxed text-zinc-400'
                : 'whitespace-pre-wrap text-sm leading-relaxed text-zinc-100'
            }
          >
            {node.text}
          </p>
        );
      case 'Column':
        return (
          <div key={id} className="flex min-w-0 flex-col gap-4">
            {node.children.map(renderNode)}
          </div>
        );
      case 'Row':
        return (
          <div key={id} className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr">
            {node.children.map(renderNode)}
          </div>
        );
      case 'Card':
        return (
          <div key={id} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {renderNode(node.child)}
          </div>
        );
      case 'ChoicePicker':
        return (
          <fieldset key={id} disabled={locked} className="min-w-0">
            <legend className="mb-3 text-sm font-medium text-zinc-200">
              {node.label || 'Choose an option'}
            </legend>
            <div
              className={
                node.displayStyle === 'chips' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'
              }
            >
              {node.options.map(option => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-indigo-400 ${selection === option.value ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100' : 'border-white/10 bg-white/[0.02] text-zinc-300'} ${locked ? 'cursor-default opacity-70' : 'hover:border-indigo-400/50'}`}
                >
                  <input
                    className="h-4 w-4 accent-indigo-400"
                    type="radio"
                    name={groupId}
                    value={option.value}
                    checked={selection === option.value}
                    onChange={() => setSelection(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        );
      case 'Button':
        return (
          <button
            key={id}
            type="button"
            disabled={locked || !selection}
            onClick={() => void submit(node.id)}
            className={`self-start rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 ${node.variant === 'borderless' ? 'text-indigo-300 hover:bg-indigo-500/10' : node.variant === 'primary' ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20'}`}
          >
            {nodes.get(node.child)?.component === 'Text'
              ? (nodes.get(node.child) as { text: string }).text
              : null}
          </button>
        );
    }
  };
  return (
    <section
      aria-label="Interactive comparison"
      className="my-4 rounded-2xl border border-indigo-400/25 bg-zinc-900/70 p-5 shadow-lg"
    >
      <div className="mb-5 flex items-center gap-2 text-xs font-medium text-indigo-300">
        <LayoutPanelTop className="h-4 w-4" aria-hidden="true" />
        Interactive comparison
      </div>
      {renderNode('root')}
      {state === 'pending' && (
        <p role="status" className="mt-3 text-xs text-zinc-400">
          Sending your selection…
        </p>
      )}
      {sent && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Selection sent
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="mt-3 text-xs text-red-300">
          Could not complete your selection. Try again.
        </p>
      )}
    </section>
  );
}
