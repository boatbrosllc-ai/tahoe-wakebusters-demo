import type { SiteConfig } from "@/config/site-types";
import {
  validateLaunchPacket,
  type CustomerPlatformConfig,
} from "@/lib/launch/customer-platform-config.schema";
import { mapPacketToSiteConfig } from "@/lib/launch/map-packet-to-site-config";
import { seedFirestoreFromPacket, type SeedFirestoreFromPacketResult } from "@/lib/launch/seed-firestore-from-packet";
import { writeConfigFiles } from "@/lib/launch/write-config-files";

export type ImportLaunchPacketOptions = {
  /** Repo root (defaults to process.cwd()). */
  rootDir?: string;
  /** Write config/site.ts and content/* (default true). */
  writeFiles?: boolean;
  /** Seed Firestore via Firebase Admin (default true). Requires credentials in env. */
  seedFirebase?: boolean;
  /** Validate only — do not write files or seed. */
  dryRun?: boolean;
};

export type ImportLaunchPacketResult =
  | {
      ok: true;
      config: CustomerPlatformConfig;
      siteConfig: SiteConfig;
      warnings: string[];
      filesWritten?: string[];
      firebase?: SeedFirestoreFromPacketResult & { ok: true };
      dryRun: boolean;
    }
  | { ok: false; errors: string[] };

/**
 * Validate a Slipstack.io launch packet and apply it to this customer repo + Firebase.
 */
export async function importLaunchPacket(
  input: unknown,
  options: ImportLaunchPacketOptions = {},
): Promise<ImportLaunchPacketResult> {
  const validated = validateLaunchPacket(input);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors };
  }

  const rootDir = options.rootDir ?? process.cwd();
  const writeFiles = options.writeFiles !== false;
  const seedFirebase = options.seedFirebase !== false;
  const dryRun = options.dryRun === true;
  const siteConfig = mapPacketToSiteConfig(validated.config);

  if (dryRun) {
    return {
      ok: true,
      config: validated.config,
      siteConfig,
      warnings: validated.warnings,
      dryRun: true,
    };
  }

  let filesWritten: string[] | undefined;
  if (writeFiles) {
    const writeResult = await writeConfigFiles(rootDir, validated.config, siteConfig);
    filesWritten = writeResult.written;
  }

  let firebase: (SeedFirestoreFromPacketResult & { ok: true }) | undefined;
  if (seedFirebase) {
    console.warn(
      "Note: Firestore seed reconciles experiences/boats from the packet and may overwrite prior admin edits to those fields.",
    );
    const seedResult = await seedFirestoreFromPacket(validated.config, siteConfig);
    if (!seedResult.ok) {
      return {
        ok: false,
        errors: [
          ...(writeFiles
            ? [`Config files were written under ${rootDir} before Firebase seed failed.`]
            : []),
          seedResult.error,
        ],
      };
    }
    firebase = seedResult;
  }

  return {
    ok: true,
    config: validated.config,
    siteConfig,
    warnings: validated.warnings,
    filesWritten,
    firebase,
    dryRun: false,
  };
}

export { validateLaunchPacket } from "@/lib/launch/customer-platform-config.schema";
export type { CustomerPlatformConfig } from "@/lib/launch/customer-platform-config.schema";
