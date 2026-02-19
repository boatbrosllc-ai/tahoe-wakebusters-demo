import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type {
  Experience,
  ExperienceRate,
  ExperienceAddon,
  ExperienceLocation,
  ExperienceCancellationPolicy,
  ExperienceSeasonal,
} from "@/lib/booking/types";

/** Remove undefined from object (and array elements) so Firestore update/set accepts it. Leaves null and other values. */
function stripUndefined<T>(obj: T): T {
  if (obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      item !== null && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype
        ? stripUndefined(item as Record<string, unknown>)
        : item
    ) as T;
  }
  if (obj === null || typeof obj !== "object" || Object.getPrototypeOf(obj) !== Object.prototype) {
    return obj;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] =
      v !== null &&
      typeof v === "object" &&
      Object.getPrototypeOf(v) === Object.prototype
        ? stripUndefined(v as Record<string, unknown>)
        : Array.isArray(v)
          ? stripUndefined(v)
          : v;
  }
  return out as T;
}

function parseBody(
  body: unknown
): Partial<{
  slug: string;
  title: string;
  subtitle: string;
  descriptionLong: string;
  heroMedia: { type: "image" | "video"; url: string };
  gallery: string[];
  location: ExperienceLocation;
  maxGuests: number;
  petsMax: number;
  included: string[];
  whatToBring: string[];
  rules: string[];
  cancellationPolicy: ExperienceCancellationPolicy;
  faqs: { q: string; a: string }[];
  seasonal: ExperienceSeasonal;
  active: boolean;
  timezone: string;
  rates: Omit<ExperienceRate, "active">[];
  addons: Omit<ExperienceAddon, "active">[];
  heroOverlayText: string;
  promoVideoUrl: string;
  metaTitle: string;
  metaDescription: string;
  ctaButtonText: string;
  cancellationSummary: string;
  testimonials: { name: string; quote: string; date?: string }[];
  featured: boolean;
  spotsLeftOverride: number;
  defaultRateId: string;
  bookingPosition: "sidebar" | "inline" | "modal";
  galleryAltTexts: string[];
  holidayDates: { label?: string; start: string; end: string; recurring?: boolean; priceCents?: number; priceCentsByDuration?: Record<number, number> }[];
  weekendDays: number[];
  friSunDays: number[];
  sortOrder: number;
}> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: ReturnType<typeof parseBody> = {};
  if (typeof b.slug === "string") out.slug = b.slug.trim();
  if (typeof b.title === "string") out.title = b.title.trim();
  if (typeof b.subtitle === "string") out.subtitle = b.subtitle.trim();
  if (typeof b.descriptionLong === "string") out.descriptionLong = b.descriptionLong.trim();
  if (b.heroMedia && typeof b.heroMedia === "object" && "url" in b.heroMedia && typeof (b.heroMedia as { url: unknown }).url === "string") {
    out.heroMedia = {
      type: (b.heroMedia as { type?: string }).type === "video" ? "video" : "image",
      url: (b.heroMedia as { url: string }).url,
    };
  }
  if (Array.isArray(b.gallery)) out.gallery = b.gallery.filter((x): x is string => typeof x === "string");
  if (b.location && typeof b.location === "object") {
    const loc = b.location as Record<string, unknown>;
    out.location = {
      title: typeof loc.title === "string" ? loc.title.trim() : "",
      addressText: typeof loc.addressText === "string" ? loc.addressText.trim() : "",
      notes: typeof loc.notes === "string" ? loc.notes.trim() : undefined,
    };
  }
  if (typeof b.maxGuests === "number" && b.maxGuests >= 0) out.maxGuests = Math.floor(b.maxGuests);
  if (typeof b.petsMax === "number" && b.petsMax >= 0) out.petsMax = Math.floor(b.petsMax);
  if (Array.isArray(b.included)) out.included = b.included.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.whatToBring)) out.whatToBring = b.whatToBring.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.rules)) out.rules = b.rules.filter((x): x is string => typeof x === "string");
  if (b.cancellationPolicy && typeof b.cancellationPolicy === "object") {
    const cp = b.cancellationPolicy as Record<string, unknown>;
    out.cancellationPolicy = {
      freeCancelDays: typeof cp.freeCancelDays === "number" ? cp.freeCancelDays : 30,
      partialRefundDaysStart: typeof cp.partialRefundDaysStart === "number" ? cp.partialRefundDaysStart : 15,
      partialRefundDaysEnd: typeof cp.partialRefundDaysEnd === "number" ? cp.partialRefundDaysEnd : 30,
      noRefundWithinDays: typeof cp.noRefundWithinDays === "number" ? cp.noRefundWithinDays : 14,
      fullText: typeof cp.fullText === "string" ? cp.fullText : "",
    };
  }
  if (Array.isArray(b.faqs)) {
    out.faqs = b.faqs
      .filter((x): x is { q?: unknown; a?: unknown } => x != null && typeof x === "object")
      .map((x) => ({ q: typeof x.q === "string" ? x.q : "", a: typeof x.a === "string" ? x.a : "" }));
  }
  if (b.seasonal && typeof b.seasonal === "object") {
    const sea = b.seasonal as Record<string, unknown>;
    out.seasonal = {
      enabled: sea.enabled === true,
      startMonth: typeof sea.startMonth === "number" ? sea.startMonth : undefined,
      endMonth: typeof sea.endMonth === "number" ? sea.endMonth : undefined,
    };
  }
  if (typeof b.active === "boolean") out.active = b.active;
  if (typeof b.timezone === "string") out.timezone = b.timezone.trim() || "";
  if (Array.isArray(b.rates)) {
    out.rates = b.rates
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        durationHours: typeof x.durationHours === "number" ? x.durationHours : 0,
        displayName: typeof x.displayName === "string" ? x.displayName : "",
        priceCents: typeof x.priceCents === "number" ? x.priceCents : 0,
        priceWeekendCents: typeof x.priceWeekendCents === "number" ? x.priceWeekendCents : undefined,
        priceFriSunCents: typeof x.priceFriSunCents === "number" ? x.priceFriSunCents : undefined,
        priceHolidayCents: typeof x.priceHolidayCents === "number" ? x.priceHolidayCents : undefined,
      }));
  }
  if (Array.isArray(b.friSunDays)) {
    out.friSunDays = (b.friSunDays as number[]).filter((x) => typeof x === "number" && x >= 0 && x <= 6).sort((a, b) => a - b);
  }
  if (Array.isArray(b.holidayDates)) {
    out.holidayDates = (b.holidayDates as { label?: string; start?: string; end?: string; recurring?: boolean; priceCents?: number; priceCentsByDuration?: Record<string, number> }[])
      .filter((x) => x != null && typeof x === "object" && (typeof (x as { start?: string }).start === "string" || typeof (x as { end?: string }).end === "string"))
      .map((x) => {
        const byDur = x.priceCentsByDuration && typeof x.priceCentsByDuration === "object"
          ? Object.fromEntries(
              Object.entries(x.priceCentsByDuration).filter(
                ([k, v]) => Number.isFinite(Number(k)) && typeof v === "number" && v >= 0
              ).map(([k, v]) => [Number(k), v] as [number, number])
            ) as Record<number, number>
          : undefined;
        const priceCentsByDuration = byDur && Object.keys(byDur).length > 0 ? byDur : undefined;
        const priceCents = typeof (x as { priceCents?: number }).priceCents === "number" ? (x as { priceCents: number }).priceCents : undefined;
        const label = typeof x.label === "string" ? x.label : undefined;
        const recurring = (x as { recurring?: boolean }).recurring === true;
        return {
          start: typeof x.start === "string" ? x.start : "",
          end: typeof x.end === "string" ? x.end : "",
          ...(label != null && label !== "" && { label }),
          ...(recurring && { recurring: true }),
          ...(typeof priceCents === "number" && { priceCents }),
          ...(priceCentsByDuration && { priceCentsByDuration }),
        };
      });
  }
  if (Array.isArray(b.addons)) {
    out.addons = b.addons
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        name: typeof x.name === "string" ? x.name : "",
        description: typeof x.description === "string" ? x.description : undefined,
        priceCents: typeof x.priceCents === "number" ? x.priceCents : 0,
        type: (x.type === "quantity" || x.type === "tip" ? x.type : "toggle") as "toggle" | "quantity" | "tip",
        maxQty: typeof x.maxQty === "number" ? x.maxQty : undefined,
        highlight: x.highlight === true,
      }));
  }
  if (typeof b.heroOverlayText === "string") out.heroOverlayText = b.heroOverlayText.trim();
  if (typeof b.promoVideoUrl === "string") out.promoVideoUrl = b.promoVideoUrl.trim();
  if (typeof b.metaTitle === "string") out.metaTitle = b.metaTitle.trim();
  if (typeof b.metaDescription === "string") out.metaDescription = b.metaDescription.trim();
  if (typeof b.ctaButtonText === "string") out.ctaButtonText = b.ctaButtonText.trim();
  if (typeof b.cancellationSummary === "string") out.cancellationSummary = b.cancellationSummary.trim();
  if (Array.isArray(b.testimonials)) {
    out.testimonials = b.testimonials
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        name: typeof x.name === "string" ? x.name : "",
        quote: typeof x.quote === "string" ? x.quote : "",
        date: typeof x.date === "string" ? x.date : undefined,
      }))
      .filter((t) => t.name || t.quote);
  }
  if (typeof b.featured === "boolean") out.featured = b.featured;
  if (typeof b.spotsLeftOverride === "number" && b.spotsLeftOverride >= 0) out.spotsLeftOverride = b.spotsLeftOverride;
  if (typeof b.defaultRateId === "string") out.defaultRateId = b.defaultRateId.trim();
  if (b.bookingPosition === "sidebar" || b.bookingPosition === "inline" || b.bookingPosition === "modal") out.bookingPosition = b.bookingPosition;
  if (Array.isArray(b.galleryAltTexts)) out.galleryAltTexts = b.galleryAltTexts.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.weekendDays)) {
    const arr = (b.weekendDays as unknown[]).filter((x): x is number => typeof x === "number" && x >= 0 && x <= 6);
    if (arr.length > 0) out.weekendDays = Array.from(new Set(arr)).sort((a, b) => a - b);
  }
  if (typeof b.sortOrder === "number") out.sortOrder = b.sortOrder;
  return Object.keys(out).length ? out : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const db = getDb();
    const expRef = db.collection("experiences").doc(id);
    const expSnap = await expRef.get();
    if (!expSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = expSnap.data() as Record<string, unknown>;
    const ratesSnap = await expRef.collection("rates").get();
    const addonsSnap = await expRef.collection("addons").get();
    const rates = ratesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const addons = addonsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ id: expSnap.id, ...data, rates, addons });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "experiences/[id]/route.ts:PATCH", message: "PATCH started", data: {}, timestamp: Date.now(), hypothesisId: "A" }) }).catch(() => {});
  // #endregion
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // #region agent log
  const { rates: parsedRates, addons: parsedAddons, ...expFields } = parsed;
  const firstRate = Array.isArray(parsedRates) && parsedRates[0];
  const rateHasUndefined = firstRate ? Object.entries(firstRate).some(([, v]) => v === undefined) : false;
  fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "experiences/[id]/route.ts:parsed", message: "parsed body", data: { expFieldsKeys: Object.keys(expFields), ratesLen: Array.isArray(parsedRates) ? parsedRates.length : 0, firstRateKeys: firstRate ? Object.keys(firstRate) : [], rateHasUndefined }, timestamp: Date.now(), hypothesisId: "B" }) }).catch(() => {});
  // #endregion

  try {
    const db = getDb();
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "experiences/[id]/route.ts:getDb", message: "getDb done", data: {}, timestamp: Date.now(), hypothesisId: "A" }) }).catch(() => {});
    // #endregion
    const expRef = db.collection("experiences").doc(id);
    const expSnap = await expRef.get();
    if (!expSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { rates, addons, ...expFieldsInner } = parsed;
    if (Object.keys(expFieldsInner).length > 0) {
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "experiences/[id]/route.ts:beforeUpdate", message: "about to expRef.update", data: {}, timestamp: Date.now(), hypothesisId: "C" }) }).catch(() => {});
      // #endregion
      const expPayload = stripUndefined(expFieldsInner as Record<string, unknown>) as Partial<Experience>;
      await expRef.update(expPayload);
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "experiences/[id]/route.ts:afterUpdate", message: "expRef.update done", data: {}, timestamp: Date.now(), hypothesisId: "C" }) }).catch(() => {});
      // #endregion
    }
    if (Array.isArray(rates)) {
      const ratesRef = expRef.collection("rates");
      const existing = await ratesRef.get();
      for (const d of existing.docs) await d.ref.delete();
      for (let ri = 0; ri < rates.length; ri++) {
        const r = rates[ri];
        // #region agent log
        if (ri === 0) {
          const hasUndef = Object.entries(r).some(([, v]) => v === undefined);
          fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "experiences/[id]/route.ts:beforeRateSet", message: "before ratesRef.doc().set", data: { rateKeys: Object.keys(r), hasUndefined: hasUndef }, timestamp: Date.now(), hypothesisId: "B" }) }).catch(() => {});
        }
        // #endregion
        await ratesRef.doc().set({ ...stripUndefined(r as Record<string, unknown>), active: true });
      }
    }
    if (Array.isArray(addons)) {
      const addonsRef = expRef.collection("addons");
      const existing = await addonsRef.get();
      for (const d of existing.docs) await d.ref.delete();
      for (const a of addons) {
        await addonsRef.doc().set({ ...stripUndefined(a as Record<string, unknown>), active: true });
      }
    }
    return NextResponse.json({ id });
  } catch (err) {
    // #region agent log
    const errMsg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "";
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "experiences/[id]/route.ts:catch", message: "PATCH error", data: { errMsg, errName }, timestamp: Date.now(), hypothesisId: "A" }) }).catch(() => {});
    // #endregion
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
