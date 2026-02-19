/**
 * SEO score (0–100) and actionable checklist. Deterministic rules; used on save and client-side.
 */

import type { BlogStats, BlogSeo, ContentBlock } from "./types";

const MIN_WORD_COUNT_TARGET = 800;
const META_TITLE_LOW = 50;
const META_TITLE_HIGH = 60;
const META_DESC_LOW = 140;
const META_DESC_HIGH = 160;

export interface SeoCheckItem {
  id: string;
  label: string;
  score: number;
  max: number;
  pass: boolean;
  fixHint?: string;
  field?: string; // for "jump to field"
}

export interface SeoScoreResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: SeoCheckItem[];
  warnings: string[];
}

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 50) return "C";
  if (score >= 25) return "D";
  return "F";
}

export function computeSeoScore(
  seo: BlogSeo,
  stats: BlogStats,
  slug: string,
  isPublished: boolean,
  options?: { contentText?: string; contentBlocks?: ContentBlock[] }
): SeoScoreResult {
  const checks: SeoCheckItem[] = [];
  const warnings: string[] = [];

  const metaTitle = (seo.metaTitle ?? "").trim();
  const metaDesc = (seo.metaDescription ?? "").trim();
  const focusKeyword = (seo.focusKeyword ?? "").trim().toLowerCase();
  const first100Words = (options?.contentText ?? "").trim().split(/\s+/).slice(0, 100).join(" ").toLowerCase();
  const h2Texts: string[] = (options?.contentBlocks ?? [])
    .filter((b) => b.type === "heading" && (b as { level?: number }).level === 2)
    .map((b) => ((b as { content?: string }).content ?? "").toLowerCase());

  // Meta title present + length 50–60 (10)
  const titleLen = metaTitle.length;
  let titleScore = 0;
  if (titleLen === 0) {
    checks.push({ id: "metaTitle", label: "Meta title present", score: 0, max: 10, pass: false, fixHint: "Add a meta title", field: "seo.metaTitle" });
  } else if (titleLen >= META_TITLE_LOW && titleLen <= META_TITLE_HIGH) {
    titleScore = 10;
    checks.push({ id: "metaTitle", label: "Meta title length 50–60 chars", score: 10, max: 10, pass: true });
  } else {
    titleScore = titleLen > 0 ? 5 : 0;
    checks.push({
      id: "metaTitle",
      label: `Meta title length (${titleLen}; aim 50–60)`,
      score: titleScore,
      max: 10,
      pass: false,
      fixHint: titleLen < META_TITLE_LOW ? "Add more characters" : "Shorten to under 60",
      field: "seo.metaTitle",
    });
  }

  // Meta description present + length 140–160 (10)
  const descLen = metaDesc.length;
  let descScore = 0;
  if (descLen === 0) {
    checks.push({ id: "metaDesc", label: "Meta description present", score: 0, max: 10, pass: false, fixHint: "Add meta description", field: "seo.metaDescription" });
  } else if (descLen >= META_DESC_LOW && descLen <= META_DESC_HIGH) {
    descScore = 10;
    checks.push({ id: "metaDesc", label: "Meta description length 140–160 chars", score: 10, max: 10, pass: true });
  } else {
    descScore = descLen > 0 ? 5 : 0;
    checks.push({
      id: "metaDesc",
      label: `Meta description length (${descLen}; aim 140–160)`,
      score: descScore,
      max: 10,
      pass: false,
      fixHint: descLen < META_DESC_LOW ? "Add more" : "Shorten to 160",
      field: "seo.metaDescription",
    });
  }

  // Exactly one H1 (10)
  const h1Count = stats.headingCounts.h1;
  const h1Score = h1Count === 1 ? 10 : 0;
  checks.push({
    id: "h1",
    label: "Exactly one H1",
    score: h1Score,
    max: 10,
    pass: h1Count === 1,
    fixHint: h1Count === 0 ? "Add one H1 heading" : `Use only one H1 (found ${h1Count})`,
    field: "content",
  });

  // Uses H2/H3 structure (10)
  const hasStructure = stats.headingCounts.h2 > 0 || stats.headingCounts.h3 > 0;
  const structureScore = hasStructure ? 10 : 5;
  checks.push({
    id: "structure",
    label: "Uses H2/H3 structure",
    score: structureScore,
    max: 10,
    pass: hasStructure,
    fixHint: "Add H2 or H3 subheadings",
    field: "content",
  });

  // Focus keyword in title or H1 (6), first 100 words (6), at least one H2 (6)
  const kwInTitle = focusKeyword && metaTitle.toLowerCase().includes(focusKeyword);
  const kwInFirst100 = focusKeyword && first100Words.includes(focusKeyword);
  const kwInH2 = focusKeyword && h2Texts.some((t) => t.includes(focusKeyword));
  if (focusKeyword) {
    checks.push({
      id: "focusKeyword",
      label: "Focus keyword in title / H1",
      score: kwInTitle ? 6 : 0,
      max: 6,
      pass: kwInTitle,
      fixHint: "Include focus keyword in meta title or H1",
      field: "seo.focusKeyword",
    });
    checks.push({
      id: "keywordFirst100",
      label: "Focus keyword in first 100 words",
      score: kwInFirst100 ? 6 : 0,
      max: 6,
      pass: kwInFirst100,
      fixHint: "Mention keyword early in content",
      field: "content",
    });
    checks.push({
      id: "keywordH2",
      label: "Focus keyword in at least one H2",
      score: kwInH2 ? 6 : 0,
      max: 6,
      pass: kwInH2,
      fixHint: "Use keyword in an H2",
      field: "content",
    });
  } else {
    checks.push({ id: "focusKeyword", label: "Focus keyword set", score: 0, max: 6, pass: false, fixHint: "Set focus keyword for scoring", field: "seo.focusKeyword" });
    checks.push({ id: "keywordFirst100", label: "Focus keyword in first 100 words", score: 0, max: 6, pass: false });
    checks.push({ id: "keywordH2", label: "Focus keyword in H2", score: 0, max: 6, pass: false });
  }

  // Word count >= 800 (8)
  const wcScore = stats.wordCount >= MIN_WORD_COUNT_TARGET ? 8 : Math.min(8, Math.floor(stats.wordCount / 100));
  checks.push({
    id: "wordCount",
    label: `Word count >= ${MIN_WORD_COUNT_TARGET}`,
    score: wcScore,
    max: 8,
    pass: stats.wordCount >= MIN_WORD_COUNT_TARGET,
    fixHint: `Add more content (${stats.wordCount}/${MIN_WORD_COUNT_TARGET})`,
    field: "content",
  });

  // Images >= 2 and alt complete (8)
  const imgScore =
    stats.imagesCount >= 2 && stats.imagesMissingAltCount === 0
      ? 8
      : stats.imagesCount >= 1 && stats.imagesMissingAltCount === 0
        ? 4
        : stats.imagesMissingAltCount > 0
          ? 0
          : 0;
  checks.push({
    id: "images",
    label: "Images >= 2 with alt text",
    score: imgScore,
    max: 8,
    pass: stats.imagesCount >= 2 && stats.imagesMissingAltCount === 0,
    fixHint:
      stats.imagesMissingAltCount > 0
        ? "Add alt text to all images"
        : stats.imagesCount < 2
          ? "Add at least 2 images"
          : undefined,
    field: "content",
  });

  // Internal links >= 2 (8)
  const internalScore = stats.internalLinksCount >= 2 ? 8 : stats.internalLinksCount >= 1 ? 4 : 0;
  checks.push({
    id: "internalLinks",
    label: "Internal links >= 2",
    score: internalScore,
    max: 8,
    pass: stats.internalLinksCount >= 2,
    fixHint: "Add internal links to other posts/pages",
    field: "content",
  });

  // External links >= 1 optional (2)
  const extScore = stats.externalLinksCount >= 1 ? 2 : 0;
  checks.push({ id: "externalLinks", label: "External link (optional)", score: extScore, max: 2, pass: stats.externalLinksCount >= 1 });

  // Slug quality (4): kebab, reasonable length, no stop words
  const slugClean = slug.trim().toLowerCase();
  const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugClean) && slugClean.length >= 3 && slugClean.length <= 80;
  checks.push({
    id: "slug",
    label: "Slug (kebab-case, short)",
    score: slugOk ? 4 : 0,
    max: 4,
    pass: slugOk,
    fixHint: "Use kebab-case, 3–80 chars",
    field: "slug",
  });

  // Schema present Article (6)
  checks.push({ id: "schemaArticle", label: "Article schema", score: 6, max: 6, pass: true }); // always derived
  // FAQ schema if FAQ block (6)
  const faqSchemaScore = stats.hasFaq ? 6 : 0;
  checks.push({ id: "schemaFaq", label: "FAQ schema (when FAQ block)", score: faqSchemaScore, max: 6, pass: stats.hasFaq });

  if (isPublished && slugClean !== slug) warnings.push("Changing slug on a published post can hurt SEO.");
  if (!seo.robotsIndex) warnings.push("noindex is enabled; post may not appear in search.");
  if (stats.wordCount < 300) warnings.push("Thin content; consider adding more.");

  const totalScore = Math.min(
    100,
    titleScore +
      descScore +
      h1Score +
      structureScore +
      (kwInTitle ? 6 : 0) +
      (kwInFirst100 ? 6 : 0) +
      (kwInH2 ? 6 : 0) +
      wcScore +
      imgScore +
      internalScore +
      extScore +
      (slugOk ? 4 : 0) +
      6 +
      faqSchemaScore
  );

  return {
    score: totalScore,
    grade: gradeFromScore(totalScore),
    checks,
    warnings,
  };
}

/** Quick score from post-like object (for client-side updates). */
export function computeSeoScoreFromPost(post: {
  seo?: BlogSeo;
  stats?: BlogStats;
  slug?: string;
  status?: string;
  content?: ContentBlock[];
  contentText?: string;
}): SeoScoreResult {
  const stats = post.stats ?? {
    wordCount: 0,
    readingTimeMinutes: 0,
    headingCounts: { h1: 0, h2: 0, h3: 0 },
    imagesCount: 0,
    imagesMissingAltCount: 0,
    internalLinksCount: 0,
    externalLinksCount: 0,
    hasFaq: false,
    hasTable: false,
  };
  const seo = post.seo ?? {
    metaTitle: "",
    metaDescription: "",
    robotsIndex: true,
    robotsFollow: true,
  };
  const slug = post.slug ?? "";
  const isPublished = post.status === "published";
  return computeSeoScore(seo, stats, slug, isPublished, {
    contentText: post.contentText,
    contentBlocks: post.content,
  });
}
