/**
 * Idempotent Firestore seed from a validated CustomerPlatformConfig launch packet.
 * Does not use template placeholder experiences when a packet is provided.
 */
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd } from "@/lib/booking/experience-slots";
import { reconcileAddons, reconcileRates, type AddonSeed, type RateSeed } from "@/lib/booking/seed-reconcile";
import type { Experience, ExperienceCancellationPolicy } from "@/lib/booking/types";
import type { CustomerPlatformConfig, LaunchPacketBoat, LaunchPacketExperience } from "@/lib/launch/customer-platform-config.schema";
import { resolveExperienceSlugReference, resolveFirestoreExperienceSlug } from "@/lib/launch/resolve-firestore-experience-slug";
import type { SiteConfig } from "@/config/site-types";
import { resolveAllowDepositFromConfig } from "@/lib/booking/booking-policy-copy";
import { createTemplate, listTemplates, updateTemplate } from "@/lib/waiver/firestore";
import type { CreateWaiverTemplateInput } from "@/lib/waiver/schema";

export type SeedFirestoreFromPacketResult =
  | {
      ok: true;
      experienceIds: string[];
      boatIds: string[];
      waiverTemplateId?: string;
      blackoutBlocks: number;
    }
  | { ok: false; error: string };

function packetAddonsToSeeds(
  packet: CustomerPlatformConfig,
  keys?: string[],
): AddonSeed[] {
  const allowed = keys ? new Set(keys.map((k) => k.toLowerCase())) : null;
  return packet.addons
    .filter((a) => !allowed || allowed.has(a.catalogKey.toLowerCase()))
    .map((addon) => ({
      catalogKey: addon.catalogKey,
      name: addon.name,
      description: addon.description ?? addon.name,
      priceCents: addon.priceCents,
      type: addon.type === "tip" ? "toggle" : addon.type,
      ...(addon.maxQty != null ? { maxQty: addon.maxQty } : {}),
      active: addon.bookable !== false,
      ...(addon.bookable === false ? { hiddenFromBookingUI: true as const } : {}),
      ...(addon.partnerFulfilled ? { partnerFulfilled: true as const } : {}),
      ...(addon.highlight ? { highlight: true as const } : {}),
    }));
}

function experienceRates(exp: LaunchPacketExperience): RateSeed[] {
  return exp.rates.map((rate) => ({
    durationHours: rate.durationHours,
    displayName: rate.displayName,
    priceCents: rate.priceCents,
    active: rate.active !== false,
    ...(rate.priceHolidayCents != null ? { priceHolidayCents: rate.priceHolidayCents } : {}),
    ...(rate.priceWeekendCents != null ? { priceWeekendCents: rate.priceWeekendCents } : {}),
    ...(rate.priceFriSunCents != null ? { priceFriSunCents: rate.priceFriSunCents } : {}),
  }));
}

function buildExperienceDoc(
  exp: LaunchPacketExperience,
  siteConfig: SiteConfig,
  firestoreSlug: string,
  packet: CustomerPlatformConfig,
): Omit<Experience, "id"> {
  const cancellation: ExperienceCancellationPolicy = {
    freeCancelDays: siteConfig.booking.cancellation.freeCancelDays,
    partialRefundDaysStart: siteConfig.booking.cancellation.partialRefundDaysStart,
    partialRefundDaysEnd: siteConfig.booking.cancellation.partialRefundDaysEnd,
    noRefundWithinDays: siteConfig.booking.cancellation.noRefundWithinDays,
    fullText: siteConfig.booking.cancellation.fullText,
  };

  const primaryRate = exp.rates.find((r) => r.active !== false) ?? exp.rates[0];
  const heroUrl = exp.heroMediaUrl ?? siteConfig.media.welcome;

  return {
    slug: firestoreSlug,
    title: exp.title,
    subtitle: exp.subtitle ?? exp.title,
    descriptionLong: exp.description,
    heroMedia: { type: "image", url: heroUrl },
    gallery: exp.gallery?.length ? exp.gallery : [heroUrl, siteConfig.media.galleryFallback],
    location: exp.location ?? {
      title: "Marina / dock",
      addressText: siteConfig.contact.marinaMeetNote,
    },
    maxGuests: exp.maxGuests ?? 6,
    petsMax: exp.petsMax ?? 0,
    included: exp.included ?? ["Private boat", "Captain and crew"],
    whatToBring: exp.whatToBring ?? ["Sunscreen", "Valid ID"],
    rules: exp.rules ?? ["Follow captain instructions"],
    cancellationPolicy: cancellation,
    faqs: exp.faqs ?? [],
    seasonal: exp.seasonal ?? packet.season ?? { enabled: false },
    active: exp.active !== false,
    timezone: siteConfig.business.timezone,
    pricingType: exp.pricingType ?? "charter",
    allowDeposit: resolveAllowDepositFromConfig(siteConfig),
    fromPriceCents: primaryRate?.priceCents ?? null,
    sortOrder: exp.slug === "full-day" ? 0 : exp.slug === "half-day" ? 1 : 10,
    ...(Array.isArray(exp.holidayDates) ? { holidayDates: exp.holidayDates } : {}),
    ...(exp.externalId ? { launchExternalId: exp.externalId } : {}),
  };
}

async function findExperienceBySlug(db: ReturnType<typeof getDb>, firestoreSlug: string) {
  const snap = await db.collection("experiences").where("slug", "==", firestoreSlug).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function findBoatByIdentity(db: ReturnType<typeof getDb>, boat: LaunchPacketBoat) {
  if (boat.externalId) {
    const byExternal = await db
      .collection("boats")
      .where("launchExternalId", "==", boat.externalId)
      .limit(1)
      .get();
    if (!byExternal.empty) return byExternal.docs[0];
  }

  const bySlug = await db.collection("boats").where("slug", "==", boat.slug).limit(1).get();
  if (!bySlug.empty) return bySlug.docs[0];

  for (const prev of boat.previousSlugs ?? []) {
    const snap = await db.collection("boats").where("slug", "==", prev).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }

  const byName = await db.collection("boats").where("name", "==", boat.name).limit(1).get();
  if (!byName.empty) return byName.docs[0];

  return null;
}

async function seedExperiences(
  db: ReturnType<typeof getDb>,
  packet: CustomerPlatformConfig,
  siteConfig: SiteConfig,
): Promise<{ experienceIds: string[]; slugToId: Map<string, string> }> {
  const experienceIds: string[] = [];
  const slugToId = new Map<string, string>();

  for (const exp of packet.experiences) {
    const firestoreSlug = resolveFirestoreExperienceSlug(exp);
    const existing = await findExperienceBySlug(db, firestoreSlug);
    const docFields = buildExperienceDoc(exp, siteConfig, firestoreSlug, packet);
    let expId: string;

    if (existing) {
      expId = existing.id;
      await existing.ref.set(docFields, { merge: true });
    } else {
      const ref = db.collection("experiences").doc();
      expId = ref.id;
      await ref.set(docFields);
    }

    experienceIds.push(expId);
    slugToId.set(exp.slug.toLowerCase(), expId);
    slugToId.set(firestoreSlug.toLowerCase(), expId);

    const addonKeys = exp.addonCatalogKeys;
    const addons =
      addonKeys === undefined ? packetAddonsToSeeds(packet) : packetAddonsToSeeds(packet, addonKeys);
    await reconcileRates(db.collection("experiences").doc(expId).collection("rates"), experienceRates(exp));
    if (addons.length > 0) {
      await reconcileAddons(db.collection("experiences").doc(expId).collection("addons"), addons);
    }
  }

  return { experienceIds, slugToId };
}

async function seedBoats(
  db: ReturnType<typeof getDb>,
  packet: CustomerPlatformConfig,
  siteConfig: SiteConfig,
  slugToId: Map<string, string>,
): Promise<string[]> {
  const { FieldValue } = getFirestoreExports();
  const boatIds: string[] = [];

  for (const boat of packet.boats) {
    const existing = await findBoatByIdentity(db, boat);
    const experienceIds = boat.experienceSlugs
      .map((ref) => slugToId.get(ref.toLowerCase()) ?? slugToId.get(resolveExperienceSlugReference(ref).toLowerCase()))
      .filter((id): id is string => Boolean(id));

    const listingFields = {
      name: boat.name,
      slug: boat.slug,
      previousSlugs: boat.previousSlugs ?? [],
      description: boat.description ?? `${boat.name} — ${siteConfig.company.name}`,
      heroSubtitle: boat.heroSubtitle ?? "Captain & crew included",
      capacity: boat.capacity,
      photos: boat.photos,
      timezone: siteConfig.business.timezone,
      capacityMax: boat.capacity,
      petsMax: boat.petsMax ?? 0,
      defaultLocationText: siteConfig.contact.marinaMeetNote,
      cancellationPolicyText: siteConfig.booking.cancellation.fullText,
      active: true,
      isListingBoat: true as const,
      experienceIds,
      ...(boat.boatType ? { boatType: boat.boatType } : {}),
      ...(boat.allowedStartTimes ? { allowedStartTimes: boat.allowedStartTimes } : {}),
      ...(boat.externalId ? { launchExternalId: boat.externalId } : {}),
    };

    let boatId: string;
    if (existing) {
      boatId = existing.id;
      const prevSlugs = Array.isArray(existing.data()?.previousSlugs)
        ? (existing.data()?.previousSlugs as string[])
        : [];
      await existing.ref.set(
        {
          ...listingFields,
          previousSlugs: Array.from(new Set([...prevSlugs, ...(boat.previousSlugs ?? [])])),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      const ref = db.collection("boats").doc();
      boatId = ref.id;
      await ref.set({
        ...listingFields,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    boatIds.push(boatId);

    const ratesRef = db.collection("boats").doc(boatId).collection("rates");
    const existingRates = await ratesRef.get();
    if (existingRates.empty) {
      const durations = new Set<number>();
      for (const expRef of boat.experienceSlugs) {
        const exp = packet.experiences.find((e) => e.slug.toLowerCase() === expRef.toLowerCase());
        exp?.rates.forEach((r) => durations.add(r.durationHours));
      }
      for (const hours of Array.from(durations).sort((a, b) => a - b)) {
        await ratesRef.doc().set({
          durationHours: hours,
          displayName: `${hours}-Hour Charter`,
          active: true,
        });
      }
    }
  }

  return boatIds;
}

async function seedWaiverTemplate(packet: CustomerPlatformConfig): Promise<string | undefined> {
  if (!packet.waiver) return undefined;
  const input: CreateWaiverTemplateInput = {
    title: packet.waiver.title,
    description: packet.waiver.description ?? "",
    isActive: packet.waiver.isActive ?? true,
    termsHtml: packet.waiver.termsHtml ?? "",
    requiredFields: packet.waiver.requiredFields,
    clauses: packet.waiver.clauses,
    signature: packet.waiver.signature,
    welcomeHeading: packet.waiver.welcomeHeading,
    welcomeSubheading: packet.waiver.welcomeSubheading,
    pageHeadings: packet.waiver.pageHeadings,
    dobMinAge: packet.waiver.dobMinAge,
    dobMaxAge: packet.waiver.dobMaxAge,
    minorAge: packet.waiver.minorAge,
    includeInConfirmationEmail: packet.waiver.includeInConfirmationEmail,
    sendSeparateWaiverInvite: packet.waiver.sendSeparateWaiverInvite,
    sendWaiverReminder: packet.waiver.sendWaiverReminder,
  };

  const templates = await listTemplates();
  const externalId = packet.waiver.externalId?.trim();
  const existing =
    (externalId
      ? templates.find((t) => (t as { launchExternalId?: string }).launchExternalId === externalId)
      : undefined) ?? templates.find((t) => t.title === input.title);

  if (existing) {
    await updateTemplate(existing.id, { ...input, isActive: true });
    if (externalId) {
      await getDb().collection("waiverTemplates").doc(existing.id).set({ launchExternalId: externalId }, { merge: true });
    }
    return existing.id;
  }

  const id = await createTemplate(input);
  if (externalId) {
    await getDb().collection("waiverTemplates").doc(id).set({ launchExternalId: externalId }, { merge: true });
  }
  return id;
}

async function seedBlackoutBlocks(
  db: ReturnType<typeof getDb>,
  packet: CustomerPlatformConfig,
  slugToId: Map<string, string>,
): Promise<number> {
  if (!packet.blackoutDates?.length) return 0;
  const { FieldValue, Timestamp } = getFirestoreExports();
  let count = 0;

  for (const date of packet.blackoutDates) {
    for (const exp of packet.experiences) {
      const expId = slugToId.get(exp.slug.toLowerCase());
      if (!expId) continue;
      const blockId = `launch-blackout-${expId}-${date}`;
      const { start } = getSlotStartEnd(date, 0, 0, 0);
      const { end } = getSlotStartEnd(date, 23, 1, 59);
      await db
        .collection("blocks")
        .doc(blockId)
        .set(
          {
            experienceId: expId,
            experienceCanonicalId: expId,
            startAt: Timestamp.fromDate(start),
            endAt: Timestamp.fromDate(end),
            reason: "Launch packet blackout date",
            launchPacketKey: blockId,
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      count += 1;
    }
  }

  return count;
}

async function seedOperationsSettings(
  db: ReturnType<typeof getDb>,
  packet: CustomerPlatformConfig,
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  await db
    .collection("settings")
    .doc("customerLaunch")
    .set(
      {
        orgId: packet.orgId,
        siteId: packet.siteId,
        version: packet.version,
        minimumNoticeHours: packet.booking.minimumNoticeHours ?? null,
        turnaroundMinutes: packet.booking.turnaroundMinutes ?? null,
        operatingHours: packet.operatingHours ?? null,
        season: packet.season ?? null,
        fuelGratuity: packet.fuelGratuity ?? null,
        weatherPolicyText: packet.booking.weatherPolicyText ?? null,
        safetyPolicyText: packet.booking.safetyPolicyText ?? null,
        importedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function seedFirestoreFromPacket(
  packet: CustomerPlatformConfig,
  siteConfig: SiteConfig,
): Promise<SeedFirestoreFromPacketResult> {
  try {
    const db = getDb();
    const { experienceIds, slugToId } = await seedExperiences(db, packet, siteConfig);
    const boatIds = await seedBoats(db, packet, siteConfig, slugToId);
    const waiverTemplateId = await seedWaiverTemplate(packet);
    const blackoutBlocks = await seedBlackoutBlocks(db, packet, slugToId);
    await seedOperationsSettings(db, packet);

    return { ok: true, experienceIds, boatIds, waiverTemplateId, blackoutBlocks };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[seed-firestore-from-packet]", err);
    return { ok: false, error: message };
  }
}
