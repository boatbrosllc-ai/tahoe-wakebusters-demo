/**
 * Slipstack.io → Platform launch packet contract.
 *
 * Secrets (Stripe, Firebase credentials, email, public URLs) are NOT included.
 * Tax rate is optional until Slipstack.io collects it — defaults to 0 with a warning.
 */

import { z } from "zod";
import { createWaiverTemplateSchema } from "@/lib/waiver/schema";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const launchPacketExperienceRateSchema = z.object({
  durationHours: z.number().int().min(1).max(24),
  displayName: z.string().min(1),
  priceCents: z.number().int().min(0),
  priceHolidayCents: z.number().int().min(0).optional(),
  priceWeekendCents: z.number().int().min(0).optional(),
  priceFriSunCents: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const launchPacketExperienceSchema = z.object({
  externalId: z.string().min(1).optional(),
  /** Public/canonical slug (e.g. half-day, full-day, sunset-cruise). */
  slug: z.string().min(1),
  /** Override Firestore slug; otherwise half-day→pontoon, full-day→watersports. */
  firestoreSlug: z.string().min(1).optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().min(1),
  pricingType: z.enum(["charter", "ticketed"]).optional(),
  active: z.boolean().optional(),
  maxGuests: z.number().int().min(1).optional(),
  petsMax: z.number().int().min(0).optional(),
  included: z.array(z.string()).optional(),
  whatToBring: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional(),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  heroMediaUrl: z.string().min(1).optional(),
  gallery: z.array(z.string()).optional(),
  location: z
    .object({
      title: z.string(),
      addressText: z.string(),
      notes: z.string().optional(),
    })
    .optional(),
  seasonal: z
    .object({
      enabled: z.boolean(),
      startMonth: z.number().int().min(1).max(12).optional(),
      endMonth: z.number().int().min(1).max(12).optional(),
      startDate: dateOnly.optional(),
      endDate: dateOnly.optional(),
    })
    .optional(),
  holidayDates: z.array(z.object({ start: dateOnly, end: dateOnly })).optional(),
  rates: z.array(launchPacketExperienceRateSchema).min(1),
  addonCatalogKeys: z.array(z.string()).optional(),
});

export const launchPacketBoatSchema = z.object({
  externalId: z.string().min(1).optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  heroSubtitle: z.string().optional(),
  capacity: z.number().int().min(1),
  petsMax: z.number().int().min(0).optional(),
  photos: z.array(z.string()).min(1),
  boatType: z.string().optional(),
  allowedStartTimes: z
    .array(z.object({ hour: z.number().int().min(0).max(23), minute: z.union([z.literal(0), z.literal(30)]) }))
    .optional(),
  /** Experience slugs this boat serves (public or Firestore slugs). */
  experienceSlugs: z.array(z.string()).min(1),
  previousSlugs: z.array(z.string()).optional(),
  previousNames: z.array(z.string()).optional(),
});

export const launchPacketAddonSchema = z.object({
  catalogKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
  type: z.enum(["toggle", "quantity", "tip"]),
  maxQty: z.number().int().min(1).optional(),
  bookable: z.boolean().optional(),
  partnerFulfilled: z.boolean().optional(),
  highlight: z.boolean().optional(),
});

export const launchPacketPricingSchema = z.object({
  foundingRateActive: z.boolean().optional(),
  foundingLabel: z.string().optional(),
  standardRates: z
    .object({
      halfDayCents: z.number().int().min(0),
      fullDayCents: z.number().int().min(0),
      peakFullDayCents: z.number().int().min(0).optional(),
    })
    .optional(),
  foundingRates: z
    .object({
      halfDayCents: z.number().int().min(0),
      fullDayCents: z.number().int().min(0),
    })
    .optional(),
  extensionHourCents: z.number().int().min(0).optional(),
  includedItems: z.array(z.string()).optional(),
});

export const launchPacketBookingSchema = z.object({
  depositFraction: z.number().min(0).max(1),
  minimumNoticeHours: z.number().int().min(0).optional(),
  turnaroundMinutes: z.number().int().min(0).optional(),
  cancellation: z.object({
    freeCancelDays: z.number().int().min(0),
    partialRefundDaysStart: z.number().int().min(0),
    partialRefundDaysEnd: z.number().int().min(0),
    noRefundWithinDays: z.number().int().min(0),
    fullText: z.string().min(1),
    summary: z.string().optional(),
  }),
  weatherPolicyText: z.string().optional(),
  safetyPolicyText: z.string().optional(),
  balanceTiming: z.enum(["at_booking", "hours_before", "on_arrival"]).optional(),
  balanceHoursBefore: z.number().int().min(0).optional(),
  refundPolicyText: z.string().optional(),
  alcoholPolicyText: z.string().optional(),
  minAge: z.number().int().min(0).optional(),
  slotSelectionMode: z.enum(["hourly", "fixed-windows"]).optional(),
});

export const launchPacketBrandingSchema = z.object({
  theme: z
    .object({
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      darkColor: z.string().optional(),
      mutedColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
      silverColor: z.string().optional(),
      borderRadius: z.string().optional(),
      fontDisplay: z.string().optional(),
    })
    .optional(),
  logos: z
    .object({
      logo: z.string().optional(),
      logoDesktop: z.string().optional(),
      logoMonogram: z.string().optional(),
      logoNavbar: z.string().optional(),
      logoHover: z.string().optional(),
      logoDark: z.string().optional(),
      logoEmail: z.string().optional(),
      logoHero: z.string().optional(),
      logoHeroHover: z.string().optional(),
      favicon: z.string().optional(),
    })
    .optional(),
  media: z
    .object({
      hero: z.string().optional(),
      welcome: z.string().optional(),
      boats: z.string().optional(),
      galleryFallback: z.string().optional(),
      listingFallback: z.string().optional(),
    })
    .optional(),
});

export const launchPacketFuelGratuitySchema = z.object({
  fuelSurchargeCents: z.number().int().min(0).optional(),
  fuelSurchargeLabel: z.string().optional(),
  suggestedGratuityPercent: z.number().min(0).max(100).optional(),
  gratuityAddonCatalogKey: z.string().optional(),
  gratuityNotes: z.string().optional(),
  fuelPolicy: z.enum(["included", "extra", "customer_pays"]).optional(),
  gratuityPolicy: z.enum(["included", "optional", "not_included", "required"]).optional(),
});

export const customerPlatformConfigSchema = z
  .object({
    version: z.literal("1.0"),
    orgId: z.string().min(1),
    siteId: z.string().min(1),
    company: z.object({
      name: z.string().min(1),
      legalName: z.string().min(1),
      shortName: z.string().optional(),
      publicName: z.string().optional(),
      tagline: z.string().min(1),
      description: z.string().optional(),
    }),
    domain: z.string().min(1),
    contact: z.object({
      email: z.string().email(),
      phone: z.string().optional(),
      sms: z.string().optional(),
      address: z
        .object({
          line1: z.string(),
          city: z.string(),
          state: z.string(),
          zip: z.string(),
          country: z.string(),
        })
        .optional(),
      hours: z.string().optional(),
      marinaMeetNote: z.string().optional(),
      hoursNote: z.string().optional(),
      googleMapsPlaceUrl: z.string().optional(),
      mapEmbedSrc: z.string().optional(),
      geo: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
      areaServed: z.array(z.string()).optional(),
    }),
    timezone: z.string().min(1),
    /** Not collected by Slipstack.io yet — template default 0 until onboarding adds the field. */
    taxRate: z.number().min(0).max(1).optional(),
    branding: launchPacketBrandingSchema.optional(),
    seo: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        blogName: z.string().optional(),
        defaultOgImage: z.string().optional(),
        defaultOgImageAlt: z.string().optional(),
      })
      .optional(),
    social: z
      .object({
        instagram: z.string().optional(),
        facebook: z.string().optional(),
        youtube: z.string().optional(),
        tiktok: z.string().optional(),
        yelp: z.string().optional(),
        tripadvisor: z.string().optional(),
      })
      .optional(),
    catalog: z
      .object({
        halfDay: z.object({ title: z.string(), durationLabel: z.string(), ctaLabel: z.string() }).optional(),
        fullDay: z.object({ title: z.string(), durationLabel: z.string(), ctaLabel: z.string() }).optional(),
        allIn: z.object({ title: z.string(), ctaLabel: z.string() }).optional(),
      })
      .optional(),
    nav: z
      .object({
        blogLabel: z.string().optional(),
        experiencesLabel: z.string().optional(),
        packagesLabel: z.string().optional(),
        boatLabel: z.string().optional(),
      })
      .optional(),
    business: z
      .object({
        currency: z.string().optional(),
        country: z.string().optional(),
        locale: z.string().optional(),
        legal: z.object({ governingLaw: z.string(), venue: z.string() }).optional(),
      })
      .optional(),
    booking: launchPacketBookingSchema,
    operatingHours: z
      .object({
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
        firstDepartureHour: z.number().int().min(0).max(23).optional(),
        lastDepartureHour: z.number().int().min(0).max(23).optional(),
      })
      .optional(),
    blackoutDates: z.array(dateOnly).optional(),
    weeklySchedule: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          closed: z.boolean(),
          openHour: z.number().int().min(0).max(23),
          openMinute: z.number().int().min(0).max(59),
          closeHour: z.number().int().min(0).max(23),
          closeMinute: z.number().int().min(0).max(59),
        }),
      )
      .optional(),
    season: launchPacketExperienceSchema.shape.seasonal.optional(),
    fuelGratuity: launchPacketFuelGratuitySchema.optional(),
    pricing: launchPacketPricingSchema.optional(),
    boats: z.array(launchPacketBoatSchema).min(1),
    experiences: z.array(launchPacketExperienceSchema).min(1),
    addons: z.array(launchPacketAddonSchema).min(1),
    waiver: createWaiverTemplateSchema
      .extend({
        externalId: z.string().min(1).optional(),
      })
      .optional(),
    features: z
      .object({
        googleAuth: z.boolean().optional(),
        paypal: z.boolean().optional(),
        giftCards: z.boolean().optional(),
        smsReminders: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((packet, ctx) => {
    const slugSet = new Set<string>();
    for (const exp of packet.experiences) {
      const key = exp.slug.trim().toLowerCase();
      if (slugSet.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate experience slug: ${exp.slug}`,
          path: ["experiences"],
        });
      }
      slugSet.add(key);
    }
    const boatSlugSet = new Set<string>();
    for (const boat of packet.boats) {
      const key = boat.slug.trim().toLowerCase();
      if (boatSlugSet.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate boat slug: ${boat.slug}`,
          path: ["boats"],
        });
      }
      boatSlugSet.add(key);
    }
    const addonKeys = new Set(packet.addons.map((a) => a.catalogKey.toLowerCase()));
    for (const exp of packet.experiences) {
      for (const key of exp.addonCatalogKeys ?? []) {
        if (!addonKeys.has(key.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Experience "${exp.slug}" references unknown addon catalogKey "${key}"`,
            path: ["experiences"],
          });
        }
      }
    }
    for (const boat of packet.boats) {
      const knownSlugs = new Set(packet.experiences.map((e) => e.slug.toLowerCase()));
      for (const ref of boat.experienceSlugs) {
        if (!knownSlugs.has(ref.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Boat "${boat.slug}" references unknown experience slug "${ref}"`,
            path: ["boats"],
          });
        }
      }
    }
  });

export type CustomerPlatformConfig = z.infer<typeof customerPlatformConfigSchema>;
export type LaunchPacketExperience = z.infer<typeof launchPacketExperienceSchema>;
export type LaunchPacketBoat = z.infer<typeof launchPacketBoatSchema>;
export type LaunchPacketAddon = z.infer<typeof launchPacketAddonSchema>;

export type LaunchPacketValidationResult =
  | { ok: true; config: CustomerPlatformConfig; warnings: string[] }
  | { ok: false; errors: string[] };

export function validateLaunchPacket(input: unknown): LaunchPacketValidationResult {
  const parsed = customerPlatformConfigSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    });
    return { ok: false, errors };
  }

  const warnings: string[] = [];
  if (parsed.data.taxRate == null) {
    warnings.push(
      "taxRate is missing — using 0 until Slipstack.io adds tax collection to onboarding. Set business.taxRate in config/site.ts or re-import when available.",
    );
  }
  if (/^example\.com$/i.test(parsed.data.domain.trim())) {
    warnings.push("domain is example.com — replace before production deploy.");
  }

  return { ok: true, config: parsed.data, warnings };
}
