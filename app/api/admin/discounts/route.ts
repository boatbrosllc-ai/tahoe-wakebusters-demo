import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getCentralCalendarDayBounds } from "@/lib/booking/experience-slots";
import {
  normalizeDiscountCodeInput,
  validateAdminDiscountCodeLength,
} from "@/lib/booking/discount-code-input";
import type { Discount } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const snap = await db.collection("discounts").orderBy("createdAt", "desc").get();
    const list = snap.docs.map((d) => {
      const data = d.data() as Discount & { expiresAt?: { toDate(): Date }; createdAt: { toDate(): Date }; updatedAt?: { toDate(): Date } };
      return {
        id: d.id,
        ...data,
        expiresAt: data.expiresAt && typeof data.expiresAt === "object" && "toDate" in data.expiresAt
          ? (data.expiresAt as { toDate(): Date }).toDate().toISOString()
          : null,
        createdAt: data.createdAt && typeof data.createdAt === "object" && "toDate" in data.createdAt
          ? (data.createdAt as { toDate(): Date }).toDate().toISOString()
          : null,
        updatedAt: data.updatedAt && typeof data.updatedAt === "object" && "toDate" in data.updatedAt
          ? (data.updatedAt as { toDate(): Date }).toDate().toISOString()
          : null,
      };
    });
    return NextResponse.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? normalizeDiscountCodeInput(body.code) : "";
    const type = body.type === "percent" || body.type === "fixed" ? body.type : "percent";
    const percent = type === "percent" && typeof body.percent === "number"
      ? Math.min(100, Math.max(1, Math.round(body.percent)))
      : undefined;
    const valueCents = type === "fixed" && typeof body.valueCents === "number" ? Math.max(0, Math.floor(body.valueCents)) : undefined;
    const expiresAtParam = typeof body.expiresAt === "string" ? body.expiresAt : null;
    const maxRedemptions = typeof body.maxRedemptions === "number" && body.maxRedemptions > 0 ? Math.floor(body.maxRedemptions) : undefined;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;

    const codeLengthCheck = validateAdminDiscountCodeLength(code);
    if (!codeLengthCheck.ok) {
      return NextResponse.json({ error: codeLengthCheck.error }, { status: 400 });
    }
    if (type === "percent" && (percent == null || percent <= 0)) {
      return NextResponse.json({ error: "Percent must be 1–100" }, { status: 400 });
    }
    if (type === "fixed" && (valueCents == null || valueCents <= 0)) {
      return NextResponse.json({ error: "Fixed amount must be greater than 0 cents" }, { status: 400 });
    }

    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    const existing = await db.collection("discounts").where("code", "==", code).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "A discount with this code already exists" }, { status: 409 });
    }

    let expiresAtTimestamp: ReturnType<typeof Timestamp.fromDate> | undefined;
    if (expiresAtParam) {
      const dateOnly = expiresAtParam.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!dateOnly) {
        return NextResponse.json({ error: "expiresAt must be YYYY-MM-DD" }, { status: 400 });
      }
      expiresAtTimestamp = Timestamp.fromDate(getCentralCalendarDayBounds(dateOnly).dayEnd);
    }

    const now = new Date();
    const doc: Omit<Discount, "usedCount"> & { usedCount: number } = {
      code,
      type,
      ...(percent != null && { percent }),
      ...(valueCents != null && { valueCents }),
      ...(expiresAtTimestamp && { expiresAt: expiresAtTimestamp }),
      ...(maxRedemptions != null && { maxRedemptions }),
      usedCount: 0,
      active: true,
      ...(description && { description }),
      createdAt: Timestamp.fromDate(now),
    };

    const ref = await db.collection("discounts").add(doc);
    return NextResponse.json({ id: ref.id, ...doc, createdAt: now.toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
