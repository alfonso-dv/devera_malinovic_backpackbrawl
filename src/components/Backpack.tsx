import { useEffect, useState } from "react";
import { TICK_SECONDS } from "../battle";
import { describeEffects, getItem } from "../items";
import { moveBlocker, sellBlocker, sellValue } from "../run";
import { BACKPACK_COLS } from "../shop";
import type { ItemDef, RunState } from "../types";

/** Hover text for a backpack slot: name, effects and cooldown. */
const tooltip = (item: ItemDef) =>
  [item.name, ...describeEffects(item.effects).map(({ label }) => label), `⏱️ every ${item.cooldown * TICK_SECONDS}s`].join("\n");

interface BackpackProps {
  run: RunState;
  /** True while not shopping: nothing can be selected, moved or sold. */
  locked: boolean;
  onSell: (slot: number) => void;
  onMove: (from: number, to: number) => void;
}

export function Backpack({ run, locked, onSell, onMove }: BackpackProps) {
  // The selection is remembered by item uid, not by slot index: if the selected
  // item is sold or the run changes, the selection simply disappears.
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const found = run.backpack.findIndex((slot) => slot?.uid === selectedUid);
  const selected = locked || found === -1 ? null : found;
  const selectedItem = selected === null ? null : getItem(run.backpack[selected]!.itemId);

  const cancel = () => setSelectedUid(null);

  // Escape cancels the selection.
  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setSelectedUid(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function handleSlotClick(index: number) {
    if (selected === null) {
      // Nothing selected yet: select the clicked item (empty slots do nothing).
      setSelectedUid(run.backpack[index]?.uid ?? null);
    } else if (index === selected) {
      cancel();
    } else if (moveBlocker(run, selected, index) === null) {
      onMove(selected, index);
      cancel();
    }
  }

  return (
    <section className="rounded-lg border border-panel-edge bg-panel p-4">
      <h2 className="font-display text-xl font-bold">🎒 Backpack</h2>

      {selectedItem ? (
        <div className="mb-3 flex items-start justify-between gap-2 text-sm">
          <p className="text-gold" role="status">
            Moving {selectedItem.icon} {selectedItem.name}: pick a highlighted slot. Occupied slots swap.
          </p>
          <button
            type="button"
            onClick={cancel}
            title="Cancel the selection (Esc)"
            className="shrink-0 rounded border border-panel-edge px-2 py-0.5 font-bold hover:border-gold"
          >
            ✕ Cancel
          </button>
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted">Click an item to move it. Hover for stats. Sell items for half their price.</p>
      )}

      <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${BACKPACK_COLS}, minmax(0, 1fr))` }}>
        {run.backpack.map((slot, index) => {
          const item = slot ? getItem(slot.itemId) : null;
          const sellBlocked = sellBlocker(run, index);
          const isSelected = index === selected;
          const isTarget = selected !== null && moveBlocker(run, selected, index) === null;

          let slotLabel: string;
          if (isSelected) slotLabel = `${item!.name}, selected. Click again to cancel.`;
          else if (isTarget) slotLabel = item ? `Swap with ${item.name}` : `Move to empty slot ${index + 1}`;
          else if (item) slotLabel = `Select ${item.name} to move it`;
          else slotLabel = `Empty slot ${index + 1}`;

          return (
            <li key={slot?.uid ?? `empty-${index}`} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => handleSlotClick(index)}
                disabled={!item && !isTarget}
                aria-label={slotLabel}
                aria-pressed={item ? isSelected : undefined}
                title={item ? `${tooltip(item)}\n\n${slotLabel}` : slotLabel}
                className={[
                  "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border-2 p-1 transition",
                  isSelected
                    ? "scale-105 border-gold bg-gold/25 shadow-lg shadow-gold/20 ring-2 ring-gold ring-offset-2 ring-offset-panel"
                    : isTarget
                      ? "border-dashed border-gold bg-gold/5 hover:bg-gold/15"
                      : item
                        ? "border-gold/40 bg-ink/40 hover:border-gold"
                        : "border-dashed border-panel-edge disabled:cursor-default",
                ].join(" ")}
              >
                {item && (
                  <>
                    <span className="text-3xl leading-none sm:text-4xl" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="text-center text-xs leading-tight">{item.name}</span>
                  </>
                )}
                {isSelected && (
                  <span className="text-xs font-bold text-gold" aria-hidden>
                    ✋ Selected
                  </span>
                )}
                {isTarget && (
                  <span className="text-xs font-bold text-gold" aria-hidden>
                    {item ? "⇄ Swap" : "↓ Move here"}
                  </span>
                )}
              </button>
              {item && (
                <button
                  type="button"
                  onClick={() => onSell(index)}
                  disabled={sellBlocked !== null}
                  title={sellBlocked ?? `Sell ${item.name} for ${sellValue(item.id)} 🪙 (half of ${item.price} 🪙, rounded down)`}
                  className="rounded bg-panel-edge px-1.5 py-0.5 text-xs font-bold hover:bg-gold hover:text-ink disabled:text-muted disabled:hover:bg-panel-edge"
                >
                  Sell +{sellValue(item.id)} 🪙
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}