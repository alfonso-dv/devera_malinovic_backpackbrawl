import { countSets, SET_IDS, SET_THRESHOLD, SETS } from "../sets";
import { SetBadge } from "./SetBadge";

/** B4: overview of all sets: how many items you have and whether the bonus is active. */
export function SetBonuses({ itemIds }: { itemIds: string[] }) {
    const counts = countSets(itemIds);
    return (
        <section aria-label="Set bonuses" className="mt-3 flex flex-col gap-1 text-xs">
            <h3 className="font-bold">🧩 Set bonuses</h3>
            {SET_IDS.map((id) => {
                const active = counts[id] >= SET_THRESHOLD;
                return (
                    <p key={id} className={active ? "text-gold" : "text-muted"}>
                        <SetBadge set={id} active={active} /> {counts[id]}/{SET_THRESHOLD} {active ? `✅ ${SETS[id].bonus}` : "— inactive"}
                    </p>
                );
            })}
        </section>
    );
}
