import type { ComponentType } from "react";
import { getActiveSiteId, type SiteId } from "@/config/site";
import { AbcBoatsHomePage } from "@/sites/abc-boats/pages/home";
import { AbcBoatsAboutPage } from "@/sites/abc-boats/pages/about";
import { PlatformDevHomePage } from "@/sites/platform-dev/pages/home";

type SitePages = {
  HomePage: ComponentType;
  AboutPage: ComponentType | null;
};

const PAGES: Record<SiteId, SitePages> = {
  "platform-dev": {
    HomePage: PlatformDevHomePage,
    AboutPage: null,
  },
  "abc-boats": {
    HomePage: AbcBoatsHomePage,
    AboutPage: AbcBoatsAboutPage,
  },
};

export function getSitePages(): SitePages {
  return PAGES[getActiveSiteId()];
}
