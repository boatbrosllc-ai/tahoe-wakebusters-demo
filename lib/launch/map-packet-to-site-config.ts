import type { SiteConfig } from "@/config/site-types";
import type { CustomerPlatformConfig } from "@/lib/launch/customer-platform-config.schema";

function digitsOnlyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits.startsWith("1") ? digits : `1${digits}`}` : "";
}

function defaultLogo(path: string, fallback: string): string {
  return path.trim() || fallback;
}

export function mapPacketToSiteConfig(packet: CustomerPlatformConfig): SiteConfig {
  const shortName = packet.company.shortName?.trim() || packet.company.name;
  const publicName = packet.company.publicName?.trim() || packet.company.name;
  const phone = packet.contact.phone?.trim() || "";
  const sms = packet.contact.sms?.trim() || phone;
  const branding = packet.branding ?? {};
  const logos = branding.logos ?? {};
  const media = branding.media ?? {};
  const theme = branding.theme ?? {};
  const address = packet.contact.address ?? {
    line1: "",
    city: "",
    state: "",
    zip: "",
    country: packet.business?.country ?? "US",
  };

  const cancellationSummary =
    packet.booking.cancellation.summary?.trim() ||
    `Free cancel until ${packet.booking.cancellation.freeCancelDays} days before · Contact us to cancel.`;

  return {
    tenantId: packet.siteId,
    environment: "production",

    company: {
      name: packet.company.name,
      shortName,
      legalName: packet.company.legalName,
      publicName,
      tagline: packet.company.tagline,
      domain: packet.domain.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    },

    contact: {
      email: packet.contact.email,
      phone,
      phoneTel: digitsOnlyPhone(phone),
      sms: digitsOnlyPhone(sms),
      address,
      hours: packet.contact.hours ?? "",
      marinaMeetNote:
        packet.contact.marinaMeetNote?.trim() ||
        "We'll send dock and check-in details after you book.",
      hoursNote:
        packet.contact.hoursNote?.trim() ||
        "Trips depart by reservation. We'll confirm meet-up time when you book.",
      googleMapsPlaceUrl: packet.contact.googleMapsPlaceUrl ?? "",
      mapEmbedSrc: packet.contact.mapEmbedSrc ?? "",
      geo: packet.contact.geo ?? null,
      areaServed: packet.contact.areaServed ?? [],
    },

    branding: {
      logo: defaultLogo(logos.logo ?? "", "/brand/logo.svg"),
      logoDesktop: defaultLogo(logos.logoDesktop ?? logos.logo ?? "", "/brand/logo-light.svg"),
      logoMonogram: defaultLogo(logos.logoMonogram ?? logos.logo ?? "", "/brand/logo-light.svg"),
      logoNavbar: defaultLogo(logos.logoNavbar ?? logos.logo ?? "", "/brand/logo-light.svg"),
      logoHover: defaultLogo(logos.logoHover ?? logos.logo ?? "", "/brand/logo-light.svg"),
      logoDark: defaultLogo(logos.logoDark ?? logos.logo ?? "", "/brand/logo-light.svg"),
      logoEmail: defaultLogo(logos.logoEmail ?? logos.logo ?? "", "/brand/logo.svg"),
      logoHero: defaultLogo(logos.logoHero ?? logos.logo ?? "", "/brand/logo-light.svg"),
      logoHeroHover: defaultLogo(logos.logoHeroHover ?? logos.logo ?? "", "/brand/logo-light.svg"),
      logoAlt: publicName,
      favicon: defaultLogo(logos.favicon ?? logos.logo ?? "", "/brand/logo.svg"),
    },

    theme: {
      primaryColor: theme.primaryColor ?? "#14b6dc",
      secondaryColor: theme.secondaryColor ?? "#f27a0a",
      accentColor: theme.accentColor ?? theme.secondaryColor ?? "#f27a0a",
      darkColor: theme.darkColor ?? "#04244a",
      mutedColor: theme.mutedColor ?? "#1a5a7a",
      backgroundColor: theme.backgroundColor ?? "#e8f6fa",
      textColor: theme.textColor ?? "#04244a",
      silverColor: theme.silverColor ?? "#d5dbe1",
      borderRadius: theme.borderRadius ?? "1rem",
      fontDisplay: theme.fontDisplay ?? "Syne",
    },

    social: {
      instagram: packet.social?.instagram ?? "",
      facebook: packet.social?.facebook ?? "",
      youtube: packet.social?.youtube ?? "",
      tiktok: packet.social?.tiktok ?? "",
      yelp: packet.social?.yelp ?? "",
      tripadvisor: packet.social?.tripadvisor ?? "",
    },

    seo: {
      title: packet.seo?.title ?? packet.company.name,
      description: packet.seo?.description ?? packet.company.tagline,
      defaultOgImage: media.hero ?? "/photos/stock/charter/fishing-boat-sunset.jpg",
      defaultOgImageAlt: packet.seo?.defaultOgImageAlt ?? `${publicName} — book online`,
      keywords: packet.seo?.keywords ?? ["boat rentals", "boat charter", "book a boat"],
      blogName: packet.seo?.blogName ?? "Blog",
    },

    media: {
      hero: media.hero ?? "/photos/stock/charter/fishing-boat-sunset.jpg",
      welcome: media.welcome ?? media.hero ?? "/photos/stock/charter/yachts-at-dock.jpg",
      boats: media.boats ?? media.hero ?? "/photos/stock/charter/yacht-sailing-cabo-pexels.jpg",
      galleryFallback: media.galleryFallback ?? "/photos/stock/charter/blue-fishing-boat-ocean-pexels.jpg",
      listingFallback: media.listingFallback ?? media.welcome ?? "/photos/stock/charter/yachts-at-dock.jpg",
    },

    catalog: {
      halfDay: packet.catalog?.halfDay ?? {
        title: "Half Day",
        durationLabel: "5 Hours",
        ctaLabel: "Book Half Day",
      },
      fullDay: packet.catalog?.fullDay ?? {
        title: "Full Day",
        durationLabel: "8 Hours",
        ctaLabel: "Book Full Day",
      },
      allIn: packet.catalog?.allIn ?? {
        title: "All-In",
        ctaLabel: "Book All-In",
      },
    },

    nav: {
      blogLabel: packet.nav?.blogLabel ?? "Blog",
      experiencesLabel: packet.nav?.experiencesLabel ?? "Trips",
      packagesLabel: packet.nav?.packagesLabel ?? "Packages",
      boatLabel: packet.nav?.boatLabel ?? "Our Boat",
    },

    business: {
      timezone: packet.timezone,
      currency: packet.business?.currency ?? "USD",
      country: packet.business?.country ?? address.country ?? "US",
      locale: packet.business?.locale ?? "en-US",
      taxRate: packet.taxRate ?? 0,
      legal: packet.business?.legal ?? {
        governingLaw: "the applicable state",
        venue: "the applicable jurisdiction",
      },
    },

    booking: {
      path: "/booking",
      mode: "link",
      providerUrl: "",
      embedSrc: "",
      depositFraction: packet.booking.depositFraction,
      minimumNoticeHours: packet.booking.minimumNoticeHours ?? 48,
      ...(packet.booking.turnaroundMinutes != null
        ? { turnaroundMinutes: packet.booking.turnaroundMinutes }
        : {}),
      ...(packet.booking.balanceTiming ? { balanceTiming: packet.booking.balanceTiming } : {}),
      ...(packet.booking.balanceHoursBefore != null ? { balanceHoursBefore: packet.booking.balanceHoursBefore } : {}),
      ...(packet.booking.refundPolicyText ? { refundPolicyText: packet.booking.refundPolicyText } : {}),
      ...(packet.booking.alcoholPolicyText ? { alcoholPolicyText: packet.booking.alcoholPolicyText } : {}),
      ...(packet.booking.minAge != null ? { minAge: packet.booking.minAge } : {}),
      slotSelectionMode: packet.booking.slotSelectionMode ?? "hourly",
      cancellation: {
        ...packet.booking.cancellation,
        summary: cancellationSummary,
      },
    },

    operations: {
      ...(packet.operatingHours ? { operatingHours: packet.operatingHours } : {}),
      ...(packet.season ? { season: packet.season } : {}),
      ...(packet.fuelGratuity ? { fuelGratuity: packet.fuelGratuity } : {}),
      ...(packet.booking.weatherPolicyText
        ? { weatherPolicyText: packet.booking.weatherPolicyText }
        : {}),
      ...(packet.booking.safetyPolicyText ? { safetyPolicyText: packet.booking.safetyPolicyText } : {}),
      ...(packet.booking.alcoholPolicyText ? { alcoholPolicyText: packet.booking.alcoholPolicyText } : {}),
      ...(packet.weeklySchedule?.length ? { weeklySchedule: packet.weeklySchedule } : {}),
    },

    features: {
      googleAuth: packet.features?.googleAuth ?? true,
      paypal: packet.features?.paypal ?? false,
      giftCards: packet.features?.giftCards ?? false,
      smsReminders: packet.features?.smsReminders ?? false,
    },

    phone,
    phoneTel: digitsOnlyPhone(phone),
    sms: digitsOnlyPhone(sms),
  };
}
