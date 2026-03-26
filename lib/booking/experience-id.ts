const FIRESTORE_AUTO_ID_PATTERN = /^[A-Za-z0-9]{20}$/;

export function isCanonicalExperienceId(value: string | undefined | null): boolean {
  if (!value) return false;
  return FIRESTORE_AUTO_ID_PATTERN.test(value.trim());
}

export function assertCanonicalExperienceId(value: string | undefined | null): asserts value is string {
  if (!isCanonicalExperienceId(value)) {
    throw new Error("Invalid experienceId: expected canonical Firestore document id");
  }
}

