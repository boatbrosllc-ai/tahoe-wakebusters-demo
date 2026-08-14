"use client";

import type { ComponentType } from "react";
import { getActiveSiteId, type SiteId } from "@/config/site";
import { Header as DefaultHeader } from "@/components/site/Header";
import { AbcBoatsHeader } from "@/sites/abc-boats/components/Header";

type SiteHeader = ComponentType<{ adminSessionCookiePresent?: boolean }>;

const HEADERS: Record<SiteId, SiteHeader> = {
  "platform-dev": DefaultHeader,
  "abc-boats": AbcBoatsHeader,
};

export function getSiteHeader(): SiteHeader {
  return HEADERS[getActiveSiteId()];
}
