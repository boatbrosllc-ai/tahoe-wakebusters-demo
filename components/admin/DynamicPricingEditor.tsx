"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight, Check, DollarSign } from "lucide-react";

const inputClass =
  "block w-full min-h-[40px] rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary";

export type HolidayDateRow = {
  label: string;
  start: string;
  end: string;
  /** Repeat this range every year (compare month-day only) */
  recurring?: boolean;
  /** Optional single price in cents for this range (all durations); overrides rate holiday default when set */
  priceCents?: number;
  /** Per-duration price overrides (durationHours -> cents). Editable in 8h/5h/3h/6h/4h columns. */
  priceCentsByDuration?: Record<number, number>;
};

// US holiday presets: (year) => { start, end } in YYYY-MM-DD
function getPresetRanges(year: number): { id: string; label: string; start: string; end: string }[] {
  const jul4 = `${year}-07-04`;
  const mayLast = new Date(year, 4, 31);
  const memDay = new Date(mayLast);
  while (memDay.getDay() !== 1) memDay.setDate(memDay.getDate() - 1);
  const memDayStr = `${memDay.getFullYear()}-${String(memDay.getMonth() + 1).padStart(2, "0")}-${String(memDay.getDate()).padStart(2, "0")}`;
  const laborDay = new Date(year, 8, 1);
  while (laborDay.getDay() !== 1) laborDay.setDate(laborDay.getDate() + 1);
  const laborDayStr = `${laborDay.getFullYear()}-${String(laborDay.getMonth() + 1).padStart(2, "0")}-${String(laborDay.getDate()).padStart(2, "0")}`;
  const nov1 = new Date(year, 10, 1);
  const firstThursday = 1 + (4 - nov1.getDay() + 7) % 7;
  const fourthThursday = firstThursday + 21;
  const thanksgiving = `${year}-11-${String(fourthThursday).padStart(2, "0")}`;
  const thanksgivingEnd = `${year}-11-${String(Math.min(fourthThursday + 3, 30)).padStart(2, "0")}`;
  return [
    { id: "july4", label: "July 4", start: jul4, end: jul4 },
    { id: "memorial", label: "Memorial Day", start: memDayStr, end: memDayStr },
    { id: "labor", label: "Labor Day", start: laborDayStr, end: laborDayStr },
    { id: "thanksgiving", label: "Thanksgiving", start: thanksgiving, end: thanksgivingEnd },
    { id: "christmas", label: "Christmas", start: `${year}-12-24`, end: `${year}-12-26` },
    { id: "newyear", label: "New Year", start: `${year}-12-31`, end: `${year + 1}-01-01` },
  ];
}

function isDateInRange(dateStr: string, start: string, end: string): boolean {
  if (!start || !end) return false;
  return dateStr >= start && dateStr <= end;
}

function toMonthDay(iso: string): string {
  return iso.slice(5, 10);
}

function isDateInHolidayRange(iso: string, start: string, end: string, recurring?: boolean): boolean {
  if (!start) return false;
  const endUse = end || start;
  if (!recurring) return isDateInRange(iso, start, endUse);
  const md = toMonthDay(iso);
  const mdStart = toMonthDay(start);
  const mdEnd = toMonthDay(endUse);
  if (mdStart <= mdEnd) return md >= mdStart && md <= mdEnd;
  return md >= mdStart || md <= mdEnd;
}

function isDateInAnyRange(dateStr: string, ranges: HolidayDateRow[]): boolean {
  return ranges.some((r) => isDateInHolidayRange(dateStr, r.start, r.end, r.recurring));
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function getDayType(date: Date, weekendDays: number[], friSunDays: number[]): "weekday" | "weekend" | "friSun" {
  const d = date.getDay();
  if (weekendDays.includes(d)) return "weekend";
  if (friSunDays.includes(d)) return "friSun";
  return "weekday";
}

/** Format day indices (0=Sun..6=Sat) as "Mon–Fri" or "Fri–Sun" when contiguous (incl. wrap), else "Mon, Wed, Fri" */
function formatDayRange(days: number[]): string {
  if (days.length === 0) return "—";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) return DAY_NAMES[sorted[0]];
  const gaps = sorted.slice(1).map((d, i) => (d - sorted[i] + 7) % 7);
  const bigGaps = gaps.filter((g) => g > 1);
  if (bigGaps.length === 1) {
    const idx = gaps.findIndex((g) => g > 1);
    const first = sorted[idx + 1];
    const last = sorted[idx];
    return `${DAY_NAMES[first]}–${DAY_NAMES[last]}`;
  }
  if (bigGaps.length === 0) return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

/** Single month calendar: table-based so 7 columns never break */
function MonthCalendar({
  year,
  month,
  holidayRanges,
  weekendDays = [0, 6],
  friSunDays = [],
  showTitle = true,
}: {
  year: number;
  month: number;
  holidayRanges: HolidayDateRow[];
  weekendDays?: number[];
  friSunDays?: number[];
  showTitle?: boolean;
}) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const cells: { date: Date; dateStr: string; isHoliday: boolean; dayType: "weekday" | "weekend" | "friSun" }[] = [];
  for (let i = 0; i < startPad; i++)
    cells.push({ date: new Date(0), dateStr: "", isHoliday: false, dayType: "weekday" });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({
      date,
      dateStr,
      isHoliday: isDateInAnyRange(dateStr, holidayRanges),
      dayType: getDayType(date, weekendDays, friSunDays),
    });
  }
  const WEEKDAYS = DAY_NAMES;
  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <div className="inline-block">
      {showTitle && (
        <div className="text-center text-sm font-semibold text-brand-dark mb-2">
          {new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" })}
        </div>
      )}
      <table className="border-collapse" role="grid" aria-label={`Calendar ${year} ${month + 1}`}>
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th
                key={w}
                scope="col"
                className="w-20 min-w-[5rem] py-3.5 text-center text-base font-medium text-brand-muted bg-brand-bg/60 border border-brand-dark/10"
              >
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {Array.from({ length: 7 }).map((_, ci) => {
                const c = row[ci];
                if (!c || !c.dateStr) {
                  return (
                    <td key={ci} className="min-w-[5rem] w-20 h-20 border border-brand-dark/10 bg-brand-bg/30" />
                  );
                }
                let bg = "bg-white";
                if (c.isHoliday) bg = "bg-violet-200/90 text-violet-900";
                else if (c.dayType === "weekend") bg = "bg-sky-100/80 text-sky-800";
                else if (c.dayType === "friSun") bg = "bg-violet-100/80 text-violet-800";
                return (
                  <td
                    key={ci}
                    className={`min-w-[5rem] w-20 h-20 border border-brand-dark/10 text-center text-xl font-medium ${bg}`}
                    title={`${c.dateStr}${c.isHoliday ? " (holiday)" : c.dayType === "weekend" ? " (weekend)" : c.dayType === "friSun" ? " (Fri/Sun)" : " (weekday)"}`}
                  >
                    {c.date.getDate()}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DynamicPricingEditorProps {
  rates: {
    durationHours: number;
    displayName: string;
    priceCents: number;
    priceWeekendCents?: number;
    priceFriSunCents?: number;
    priceHolidayCents?: number;
  }[];
  onRatesChange: (rates: DynamicPricingEditorProps["rates"]) => void;
  holidayDates: HolidayDateRow[];
  onHolidayDatesChange: (ranges: HolidayDateRow[]) => void;
  weekendDays?: number[];
  onWeekendDaysChange?: (days: number[]) => void;
  friSunDays?: number[];
  onFriSunDaysChange?: (days: number[]) => void;
  boatHint?: boolean;
  /** When true, hide weekend/holiday/special-dates/calendar sections (legacy: all days same rate). */
  hideCalendar?: boolean;
  /** "ticketed" = per-ticket copy and hint; "charter" = default. When "ticketed", pass hideCalendar=false to allow weekend/holiday pricing. */
  pricingMode?: "charter" | "ticketed";
}

export function DynamicPricingEditor({
  rates,
  onRatesChange,
  holidayDates,
  onHolidayDatesChange,
  weekendDays: weekendDaysProp = [0, 6],
  onWeekendDaysChange,
  friSunDays: friSunDaysProp = [],
  onFriSunDaysChange,
  boatHint = false,
  hideCalendar = false,
  pricingMode = "charter",
}: DynamicPricingEditorProps) {
  const isTicketed = pricingMode === "ticketed";
  const weekendDays = weekendDaysProp.length > 0 ? weekendDaysProp : [0, 6];
  const friSunDays = Array.isArray(friSunDaysProp) ? friSunDaysProp : [];
  const weekdayDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !weekendDays.includes(d) && !friSunDays.includes(d));
  const weekdayLabel = formatDayRange(weekdayDays);
  const weekendLabel = formatDayRange(weekendDays);
  const friSunLabel = formatDayRange(friSunDays);
  const toggleWeekendDay = (day: number) => {
    if (!onWeekendDaysChange) return;
    const next = weekendDays.includes(day)
      ? weekendDays.filter((d) => d !== day)
      : [...weekendDays, day].sort((a, b) => a - b);
    onWeekendDaysChange(next.length > 0 ? next : [0, 6]);
  };
  const toggleFriSunDay = (day: number) => {
    if (!onFriSunDaysChange) return;
    const next = friSunDays.includes(day)
      ? friSunDays.filter((d) => d !== day)
      : [...friSunDays, day].sort((a, b) => a - b);
    onFriSunDaysChange(next);
  };
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  /** Draft strings for price inputs so typing "50." doesn't become "50.00" mid-edit */
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const priceField = (
    key: string,
    cents: number | undefined,
    setCents: (value: number | undefined) => void,
    optional = false
  ) => {
    const hasDraft = key in priceDrafts;
    const display = hasDraft ? priceDrafts[key] : (cents != null ? (cents / 100).toFixed(2) : "");
    return {
      value: display,
      onFocus: () =>
        setPriceDrafts((prev) => ({ ...prev, [key]: cents != null ? (cents / 100).toFixed(2) : "" })),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setPriceDrafts((prev) => ({ ...prev, [key]: e.target.value })),
      onBlur: () => {
        const raw = priceDrafts[key];
        setPriceDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        if (raw === "" || raw == null) {
          if (optional) setCents(undefined);
          else setCents(0);
          return;
        }
        const num = parseFloat(raw);
        if (!Number.isNaN(num) && num >= 0) setCents(Math.round(num * 100));
      },
    };
  };

  const addRate = () =>
    onRatesChange([...rates, { durationHours: 3, displayName: "", priceCents: 0 }]);
  const removeRate = (i: number) => onRatesChange(rates.filter((_, idx) => idx !== i));
  const setRate = (i: number, field: string, value: number | string) => {
    onRatesChange(rates.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };
  const setRateNum = (i: number, field: string, value: number) => {
    onRatesChange(rates.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };
  const setRateOptionalCents = (
    i: number,
    field: "priceWeekendCents" | "priceFriSunCents" | "priceHolidayCents",
    value: number | undefined
  ) => {
    onRatesChange(rates.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const addHoliday = (row: HolidayDateRow) => onHolidayDatesChange([...holidayDates, row]);
  const removeHoliday = (i: number) =>
    onHolidayDatesChange(holidayDates.filter((_, idx) => idx !== i));
  const setHoliday = (i: number, field: keyof HolidayDateRow, value: string | boolean | number | undefined | Record<number, number>) => {
    onHolidayDatesChange(
      holidayDates.map((h, idx) => (idx === i ? { ...h, [field]: value } : h))
    );
  };

  const setHolidayDurationPrice = (i: number, durationHours: number, cents: number | undefined) => {
    onHolidayDatesChange(
      holidayDates.map((h, idx) => {
        if (idx !== i) return h;
        const next: Record<number, number> = { ...(h.priceCentsByDuration || {}) };
        if (cents == null) delete next[durationHours];
        else next[durationHours] = cents;
        const priceCentsByDuration = Object.keys(next).length ? next : undefined;
        return { ...h, priceCentsByDuration };
      })
    );
  };

  const addPreset = (preset: { label: string; start: string; end: string }) => {
    if (holidayDates.some((h) => h.start === preset.start && h.end === preset.end)) return;
    addHoliday({ label: preset.label, start: preset.start, end: preset.end });
  };

  const addAllForYear = (year: number) => {
    const presets = getPresetRanges(year);
    presets.forEach((p) => {
      if (!holidayDates.some((h) => h.start === p.start && h.end === p.end)) {
        addHoliday({ label: p.label, start: p.start, end: p.end });
      }
    });
  };

  const applyCustomRange = () => {
    if (!customStart) return;
    addHoliday({ label: customLabel || "Custom", start: customStart, end: customEnd || customStart });
    setCustomLabel("");
    setCustomStart("");
    setCustomEnd("");
    setAddCustomOpen(false);
  };

  const presetsThisYear = useMemo(() => getPresetRanges(viewYear), [viewYear]);
  const isPresetAdded = (start: string, end: string) =>
    holidayDates.some((h) => h.start === start && h.end === end);

  // Ranges sorted by year/date, with original index for set/remove
  const rangesWithIndex = useMemo((): (HolidayDateRow & { _index: number })[] => {
    return holidayDates
      .map((h, i) => ({ ...h, _index: i }))
      .sort((a, b) => {
        const ya = parseInt(a.start.slice(0, 4), 10);
        const yb = parseInt(b.start.slice(0, 4), 10);
        if (ya !== yb) return ya - yb;
        return a.start.localeCompare(b.start);
      });
  }, [holidayDates]);

  // Duration columns in special-dates table: order by length (3h, 4h, 5h, 6h, 8h)
  const ratesByDuration = useMemo(
    () => [...rates].sort((a, b) => (a.durationHours ?? 0) - (b.durationHours ?? 0)),
    [rates]
  );

  return (
    <div className="space-y-8">
      {boatHint && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
          <strong>Boat pricing:</strong> Set weekday, weekend, and holiday prices here. Holiday dates are defined on each experience; the same tiers apply when a customer picks this boat.
        </div>
      )}

      {/* Rates & calendar – no inner title; parent provides "Rates & calendar" */}
      <section className="rounded-xl border border-brand-dark/10 bg-brand-bg/20 overflow-hidden">
        <div className="p-4 sm:p-6 space-y-5">
          {isTicketed && !hideCalendar && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <strong>Per-ticket pricing:</strong> Set base and optional weekend/holiday premiums. Customers see the correct price for each date when they book.
            </div>
          )}
          {!hideCalendar && onWeekendDaysChange && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-brand-dark">Which days are weekend?</span>
              <div className="flex flex-wrap gap-1">
                {DAY_NAMES.map((name, dayIndex) => (
                  <label
                    key={dayIndex}
                    className={`inline-flex items-center rounded-md border px-2 py-1 text-xs cursor-pointer transition-colors ${
                      weekendDays.includes(dayIndex)
                        ? "border-sky-300 bg-sky-100 text-sky-900 font-medium"
                        : "border-brand-dark/15 bg-white text-brand-muted hover:bg-brand-bg/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={weekendDays.includes(dayIndex)}
                      onChange={() => toggleWeekendDay(dayIndex)}
                      className="sr-only"
                      aria-label={`${name} is weekend`}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {!hideCalendar && onFriSunDaysChange && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-brand-dark">Which days use Fri/Sun price?</span>
              <div className="flex flex-wrap gap-1">
                {DAY_NAMES.map((name, dayIndex) => (
                  <label
                    key={dayIndex}
                    className={`inline-flex items-center rounded-md border px-2 py-1 text-xs cursor-pointer transition-colors ${
                      friSunDays.includes(dayIndex)
                        ? "border-violet-300 bg-violet-100 text-violet-900 font-medium"
                        : "border-brand-dark/15 bg-white text-brand-muted hover:bg-brand-bg/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={friSunDays.includes(dayIndex)}
                      onChange={() => toggleFriSunDay(dayIndex)}
                      className="sr-only"
                      aria-label={`${name} uses Fri/Sun price`}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {/* Durations: charter lengths or ticket durations */}
          <div>
            <p className="text-sm font-medium text-brand-dark mb-1.5">
              {hideCalendar ? (isTicketed ? "Ticket durations" : "Durations") : "Charter lengths"}
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              {rates.map((r, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-dark/15 bg-white pl-2 pr-1 py-1.5 text-sm"
                >
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-11 rounded border border-brand-dark/20 px-1.5 py-0.5 text-sm"
                    placeholder="hrs"
                    value={r.durationHours || ""}
                    onChange={(e) => setRateNum(i, "durationHours", parseFloat(e.target.value) || 0)}
                    aria-label="Hours"
                  />
                  <span className="text-brand-muted text-xs">hrs</span>
                  <input
                    className="w-28 min-w-0 rounded border border-brand-dark/20 px-1.5 py-0.5 text-sm"
                    placeholder="Label"
                    value={r.displayName}
                    onChange={(e) => setRate(i, "displayName", e.target.value)}
                    aria-label="Label"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeRate(i)} aria-label="Remove">
                    <Trash2 className="w-3 h-3 text-brand-muted" />
                  </Button>
                </span>
              ))}
              <Button type="button" variant="outline" size="sm" className="text-xs" onClick={addRate}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add duration
              </Button>
            </div>
          </div>

          {/* Base prices – default; holidays/custom below override these */}
          <div>
            <p className="text-sm font-medium text-brand-dark mb-1.5">
              {hideCalendar ? "Ticket prices by duration" : isTicketed ? "Per-ticket prices by day type" : "Rates by day type (default)"}
            </p>
            <p className="text-xs text-brand-muted mb-3">
              {hideCalendar
                ? "Set the per-ticket price for each duration."
                : isTicketed
                  ? "Base per-ticket price plus optional weekend/holiday premiums. Special date ranges below override when they apply."
                  : "Default prices for each charter. Holidays and custom dates below override these when they apply."}
            </p>
            <div className="overflow-x-auto rounded-xl border border-brand-dark/10">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-brand-dark/15 bg-brand-bg/50">
                    {!hideCalendar && <th className="text-left py-3 px-3 font-medium text-brand-muted w-32">When</th>}
                    {!hideCalendar && <th className="text-left py-3 px-3 font-medium text-brand-muted w-40">Days</th>}
                    {rates.map((r, i) => (
                      <th key={i} className="text-left py-3 px-3 font-medium text-brand-muted border-l border-brand-dark/10 min-w-[7rem]">
                        {r.displayName || (isTicketed ? `${r.durationHours ?? "?"}h` : `${r.durationHours ?? "?"}h Charter`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rates.length === 0 ? (
                    <tr className="bg-amber-50/30">
                      <td colSpan={(hideCalendar ? 0 : 2) + rates.length} className="py-6 px-3 text-sm text-brand-muted text-center">
                        {hideCalendar
                          ? "Add a duration above, then set per-ticket prices here."
                          : isTicketed
                            ? "Add a ticket duration above (e.g. 1 hour), then set per-ticket prices. Optionally set weekend and holiday premiums."
                            : "Add a charter duration above, then set prices here."}
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr className="border-b border-brand-dark/10 bg-white">
                        {!hideCalendar && <td className="py-3 px-3 font-medium text-brand-dark">{isTicketed ? "Weekday (base)" : "Weekdays"}</td>}
                        {!hideCalendar && <td className="py-3 px-3 text-brand-muted text-sm">{weekdayLabel}</td>}
                        {rates.map((r, i) => {
                          const p = priceField(`weekday-${i}`, r.priceCents, (v) => setRateNum(i, "priceCents", v ?? 0), false);
                          return (
                            <td key={i} className="py-3 px-3 border-l border-brand-dark/10">
                              <input type="text" inputMode="decimal" className={`${inputClass} w-full min-w-0 max-w-[6rem] py-1.5 min-h-0 text-sm`} placeholder="0" value={p.value} onFocus={p.onFocus} onChange={p.onChange} onBlur={p.onBlur} aria-label={`Weekday ${r.displayName || i + 1}`} />
                            </td>
                          );
                        })}
                      </tr>
                      {!hideCalendar && <tr className="border-b border-brand-dark/10 bg-sky-50/50">
                        <td className="py-3 px-3 font-medium text-brand-dark">Weekends</td>
                        <td className="py-3 px-3 text-brand-muted text-sm">{weekendLabel}</td>
                        {rates.map((r, i) => {
                          const p = priceField(`weekend-${i}`, r.priceWeekendCents, (v) => setRateOptionalCents(i, "priceWeekendCents", v), true);
                          return (
                            <td key={i} className="py-3 px-3 border-l border-sky-200/80">
                              <input type="text" inputMode="decimal" className={`${inputClass} w-full min-w-0 max-w-[6rem] py-1.5 min-h-0 text-sm bg-white/80`} placeholder="—" value={p.value} onFocus={p.onFocus} onChange={p.onChange} onBlur={p.onBlur} aria-label={`Weekend ${r.displayName || i + 1}`} />
                            </td>
                          );
                        })}
                      </tr>}
                      {!hideCalendar && <tr className="border-b border-brand-dark/10 bg-violet-50/50">
                        <td className="py-3 px-3 font-medium text-brand-dark">Fri/Sun</td>
                        <td className="py-3 px-3 text-brand-muted text-sm">{friSunLabel}</td>
                        {rates.map((r, i) => {
                          const p = priceField(`frisun-${i}`, r.priceFriSunCents, (v) => setRateOptionalCents(i, "priceFriSunCents", v), true);
                          return (
                            <td key={i} className="py-3 px-3 border-l border-violet-200/80">
                              <input type="text" inputMode="decimal" className={`${inputClass} w-full min-w-0 max-w-[6rem] py-1.5 min-h-0 text-sm bg-white/80`} placeholder="—" value={p.value} onFocus={p.onFocus} onChange={p.onChange} onBlur={p.onBlur} aria-label={`Fri/Sun ${r.displayName || i + 1}`} />
                            </td>
                          );
                        })}
                      </tr>}
                      {!hideCalendar && <tr className="border-b border-brand-dark/10 bg-amber-50/50">
                        <td className="py-3 px-3 font-medium text-brand-dark">Holiday default</td>
                        <td className="py-3 px-3 text-brand-muted text-sm">Used for special dates below</td>
                        {rates.map((r, i) => {
                          const p = priceField(`holiday-${i}`, r.priceHolidayCents, (v) => setRateOptionalCents(i, "priceHolidayCents", v), true);
                          return (
                            <td key={i} className="py-3 px-3 border-l border-amber-200/80">
                              <input type="text" inputMode="decimal" className={`${inputClass} w-full min-w-0 max-w-[6rem] py-1.5 min-h-0 text-sm bg-white/80`} placeholder="—" value={p.value} onFocus={p.onFocus} onChange={p.onChange} onBlur={p.onBlur} aria-label={`Holiday ${r.displayName || i + 1}`} />
                            </td>
                          );
                        })}
                      </tr>}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Special dates – final override over default rates */}
          {!hideCalendar && (<>
          <p className="text-xs text-brand-muted mb-2">
            July 4, Memorial Day, Labor Day, Thanksgiving, Christmas, and New Year always use the <strong>holiday default</strong> price (from the rate table above) unless you add a custom range here with a different price.
          </p>
          <div>
            <p className="text-sm font-medium text-brand-dark mb-1.5">Holidays & special dates (final override)</p>
            <p className="text-xs text-brand-muted mb-3">These override the default rates above when a date falls in a range. Set price per charter (columns ordered by length: 3h, 4h, 5h, 6h, 8h, …); blank = that charter&apos;s <strong>Holiday default</strong>.</p>

            {/* Add toolbar – above table */}
            <div className="rounded-lg border border-brand-dark/10 bg-brand-bg/30 p-3 mb-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-brand-dark">Add for year</span>
                <div className="flex items-center rounded-md border border-brand-dark/20 bg-white overflow-hidden">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-none shrink-0" onClick={() => setViewYear((y) => y - 1)} aria-label="Previous year">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="min-w-[2.5rem] text-center text-sm font-medium px-1">{viewYear}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-none shrink-0" onClick={() => setViewYear((y) => y + 1)} aria-label="Next year">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => addAllForYear(viewYear)} className="shrink-0">
                  Add all {viewYear}
                </Button>
                <span className="text-xs text-brand-muted hidden sm:inline">or one:</span>
                <div className="flex flex-wrap gap-1.5">
                  {presetsThisYear.map((p) => {
                    const added = isPresetAdded(p.start, p.end);
                    return (
                      <Button
                        key={p.id + viewYear}
                        type="button"
                        variant={added ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => !added && addPreset(p)}
                        disabled={added}
                        className="h-7 text-xs shrink-0"
                      >
                        {added && <Check className="w-3 h-3 mr-0.5" />}
                        {p.label}
                      </Button>
                    );
                  })}
                </div>
                {!addCustomOpen ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddCustomOpen(true)} className="shrink-0 h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
                    Custom range
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:inline-flex">
                    <input className="w-24 rounded border border-brand-dark/20 px-2 py-1 text-sm" placeholder="Name" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} aria-label="Range name" />
                    <input type="date" className="w-32 rounded border border-brand-dark/20 px-2 py-1 text-sm min-h-0" value={customStart} onChange={(e) => setCustomStart(e.target.value)} aria-label="Start date" />
                    <span className="text-brand-muted text-xs">to</span>
                    <input type="date" className="w-32 rounded border border-brand-dark/20 px-2 py-1 text-sm min-h-0" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} aria-label="End date" />
                    <Button size="sm" className="h-7 text-xs" onClick={applyCustomRange} disabled={!customStart}>Add</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddCustomOpen(false)}>Cancel</Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-brand-dark/10 overflow-x-auto overflow-y-visible">
              <table className="w-full border-collapse text-sm min-w-0 table-fixed sm:table-auto">
                <thead>
                  <tr className="border-b border-brand-dark/15 bg-brand-bg/50">
                    <th className="text-left py-2.5 px-3 font-medium text-brand-muted whitespace-nowrap w-28 sm:w-auto min-w-[7rem]" title="Range name">Name</th>
                    <th className="text-left py-2.5 px-3 font-medium text-brand-muted whitespace-nowrap w-36 sm:w-auto min-w-[8.5rem]" title="Date or range">Dates</th>
                    <th className="text-left py-2.5 px-3 font-medium text-brand-muted w-20" title="Repeat every year">Yearly</th>
                    {ratesByDuration.map((r, ri) => (
                      <th key={ri} className="text-left py-2.5 px-2 font-medium text-brand-muted border-l border-brand-dark/10 min-w-[4.5rem] w-20 text-xs" title={r.displayName || `${r.durationHours ?? "?"}h`}>
                        {r.durationHours ?? "?"}h
                      </th>
                    ))}
                    <th className="w-12 border-l border-brand-dark/10 shrink-0" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                {rangesWithIndex.length === 0 ? (
                  <tr>
                    <td colSpan={4 + ratesByDuration.length} className="py-6 px-3 text-center text-sm text-brand-muted">
                      No special dates yet. Use the buttons above to add holidays or a custom range.
                    </td>
                  </tr>
                ) : null}
                {rangesWithIndex.map((h) => {
                  const i = h._index;
                  return (
                    <tr key={`${i}-${h.start}-${h.end}`} className="border-b border-brand-dark/5 hover:bg-brand-bg/30">
                      <td className="py-2.5 px-3 align-top">
                        <input className={`${inputClass} border-0 bg-transparent py-1.5 px-2 -mx-2 min-h-0 w-full min-w-0 text-sm`} placeholder="Name" value={h.label} onChange={(e) => setHoliday(i, "label", e.target.value)} aria-label="Name" />
                      </td>
                      <td className="py-2.5 px-3 text-brand-muted align-top">
                        {(() => {
                          const isRange = !!(h.end && h.end !== h.start);
                          const effectiveEnd = h.end || h.start;
                          if (!isRange) {
                            return (
                              <div className="flex flex-col gap-1 min-w-[8rem]">
                                <input type="date" className="w-full rounded border border-brand-dark/15 px-2 py-1 text-xs min-h-0" value={h.start || ""} onChange={(e) => { const v = e.target.value; setHoliday(i, "start", v); setHoliday(i, "end", v); }} aria-label="Date" title="Single day" />
                                <button type="button" className="text-[10px] text-brand-primary hover:underline text-left" onClick={() => { if (h.start) { const d = new Date(h.start); d.setDate(d.getDate() + 1); const next = d.toISOString().slice(0, 10); setHoliday(i, "end", next); } }}>Add end date</button>
                              </div>
                            );
                          }
                          return (
                            <div className="flex flex-col gap-1 min-w-[8rem]">
                              <input type="date" className="w-full rounded border border-brand-dark/15 px-2 py-1 text-xs min-h-0" value={h.start || ""} onChange={(e) => setHoliday(i, "start", e.target.value)} aria-label="Start" />
                              <span className="text-[10px] opacity-70">to</span>
                              <input type="date" className="w-full rounded border border-brand-dark/15 px-2 py-1 text-xs min-h-0" value={effectiveEnd || ""} onChange={(e) => setHoliday(i, "end", e.target.value)} aria-label="End" />
                              <button type="button" className="text-[10px] text-brand-muted hover:underline text-left" onClick={() => setHoliday(i, "end", h.start)}>Single day</button>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <label className="flex items-center gap-1.5 cursor-pointer" title="Repeat every year">
                          <input type="checkbox" checked={!!h.recurring} onChange={(e) => setHoliday(i, "recurring", e.target.checked)} className="rounded border-brand-dark/20 shrink-0" aria-label="Repeat yearly" />
                          <span className="text-xs text-brand-muted">Yearly</span>
                        </label>
                      </td>
                      {ratesByDuration.map((r, ri) => {
                        const durationHours = r.durationHours ?? 0;
                        const perDurCents = h.priceCentsByDuration?.[durationHours];
                        const effective = perDurCents ?? (r.priceHolidayCents ?? r.priceWeekendCents ?? r.priceFriSunCents ?? r.priceCents);
                        const p = priceField(`range-${i}-${ri}`, perDurCents, (v) => setHolidayDurationPrice(i, durationHours, v), true);
                        return (
                          <td key={ri} className="py-2.5 px-2 border-l border-brand-dark/10 align-top">
                            <input type="text" inputMode="decimal" className={`${inputClass} w-full min-w-[4rem] max-w-[5.5rem] py-1.5 min-h-0 text-sm`} placeholder={effective != null ? `$${(effective / 100).toFixed(0)}` : "—"} value={p.value} onFocus={p.onFocus} onChange={p.onChange} onBlur={p.onBlur} aria-label={`${r.displayName || durationHours + "h"} price`} title={effective != null ? `Effective: $${(effective / 100).toFixed(0)}` : "Uses holiday default"} />
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-2 border-l align-top shrink-0">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => removeHoliday(i)} aria-label={`Remove ${h.label}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
          </>)}

          {/* Calendar preview */}
          {!boatHint && !hideCalendar && (
            <div className="pt-4 border-t border-brand-dark/10 w-full flex flex-col items-center">
              <p className="text-sm font-medium text-brand-dark mb-2">How it looks</p>
              <p className="text-xs text-brand-muted mb-2">Which days use weekday, weekend, or holiday pricing.</p>
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="flex items-center gap-1.5 mb-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewMonth === 0 ? (setViewMonth(11), setViewYear((y) => y - 1)) : setViewMonth((m) => m - 1)} aria-label="Prev month">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[8rem] text-center">
                    {new Date(viewYear, viewMonth).toLocaleString("default", { month: "long", year: "numeric" })}
                  </span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => viewMonth === 11 ? (setViewMonth(0), setViewYear((y) => y + 1)) : setViewMonth((m) => m + 1)} aria-label="Next month">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <MonthCalendar year={viewYear} month={viewMonth} holidayRanges={holidayDates} weekendDays={weekendDays} friSunDays={friSunDays} showTitle={false} />
                <div className="flex items-center gap-3 text-xs text-brand-muted">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-white border border-brand-dark/20" /> Weekday</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-sky-100" /> Weekend</span>
                  {friSunDays.length > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-violet-100" /> Fri/Sun</span>}
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-violet-200/90" /> Holiday</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {boatHint && (
        <p className="text-sm text-brand-muted pt-2 border-t border-brand-dark/10">
          Holiday dates are set on each experience. Use the same weekday / weekend / holiday prices here so the right price applies when a customer picks this boat.
        </p>
      )}
    </div>
  );
}
