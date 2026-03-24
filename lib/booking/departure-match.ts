import { parseSlotId, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";

export type DepartureParsed = {
  dateStr: string;
  startHour: number;
  durationHours: number;
  startMinute?: number;
};

/** Same calendar departure (date + clock start + duration), used for shared vs private exclusivity. */
export function departureTimesMatch(slotId: string | undefined, target: DepartureParsed): boolean {
  if (!slotId) return false;
  const p = parseSlotId(slotId) ?? parseSlotIdRelaxed(slotId);
  if (!p) return false;
  return (
    p.dateStr === target.dateStr &&
    p.startHour === target.startHour &&
    p.durationHours === target.durationHours &&
    (p.startMinute ?? 0) === (target.startMinute ?? 0)
  );
}
