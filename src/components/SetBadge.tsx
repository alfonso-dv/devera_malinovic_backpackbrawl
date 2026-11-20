import { SET_THRESHOLD, SETS } from "../sets";
import type { SetId } from "../types";

/** B4: small badge showing the set of an item, with the set bonus as tooltip. */
export function SetBadge({ set, active = false }: { set: SetId; active?: boolean }) {
    const def = SETS[set];
    return (
        <span
            title={`${def.name} set (${SET_THRESHOLD}+ items): ${def.bonus}${active ? " — active" : ""}`}
            className={`inline-flex cursor-help items-center gap-0.5 rounded-full border px-1.5 text-xs font-bold ${
                active ? "border-gold bg-gold/20 text-gold" : "border-panel-edge text-muted"
            }`}
        >
      <span aria-hidden>{def.icon}</span>
            {def.name}
    </span>
    );
}
