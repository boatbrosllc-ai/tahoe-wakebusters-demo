"use client";

/**
 * Re-export from .jsx to avoid SWC TSX parser bug (Unexpected token `div`. Expected jsx identifier)
 * in Next.js 14.2.x. The actual UI lives in ExperienceListingPageContent.jsx.
 */
export { ExperienceListingPageContent } from "./ExperienceListingPageContent.jsx";
