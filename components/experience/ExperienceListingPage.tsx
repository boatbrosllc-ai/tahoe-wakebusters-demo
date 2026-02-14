"use client";

import React from "react";
import { ExperienceListingPageContent } from "./ExperienceListingPageContent.jsx";
import type { ExperienceWithDetails } from "@/lib/booking/get-experience-by-slug";

export interface ExperienceListingPageProps {
  data: ExperienceWithDetails;
}

/**
 * Thin wrapper to avoid SWC parser bug (Unexpected token `div`. Expected jsx identifier)
 * in Next.js 14.2.x when return ( <div ...> appears in this file.
 */
export function ExperienceListingPage(props: ExperienceListingPageProps) {
  return React.createElement(ExperienceListingPageContent, props);
}
