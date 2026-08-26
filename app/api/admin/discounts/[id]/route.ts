import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseDiscountAssignmentFields } from "@/lib/booking/discount-assignment";
import { requireFeatureResponse } from "@/lib/plan";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("discounts");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const active = typeof body.active === "boolean" ? body.active : undefined;
    const description =
      typeof body.description === "string" ? body.description.trim() : body.description === null ? "" : undefined;
    const assignment = parseDiscountAssignmentFields(body);

    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const updates: Record<string, unknown> = {};

    if (active !== undefined) updates.active = active;
    if (description !== undefined) {
      updates.description = description ? description : FieldValue.delete();
    }
    if (assignment.assignedTo) updates.assignedTo = assignment.assignedTo;
    else if (assignment.clearAssignedTo) updates.assignedTo = FieldValue.delete();
    if (assignment.assignedToType) updates.assignedToType = assignment.assignedToType;
    else if (assignment.clearAssignedToType) updates.assignedToType = FieldValue.delete();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Body must include active, assignedTo, assignedToType, or description" },
        { status: 400 }
      );
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    const ref = db.collection("discounts").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Discount not found" }, { status: 404 });
    }

    await ref.update(updates);
    return NextResponse.json({
      ok: true,
      ...(active !== undefined && { active }),
      ...(assignment.assignedTo && { assignedTo: assignment.assignedTo }),
      ...(assignment.assignedToType && { assignedToType: assignment.assignedToType }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebase = /firebase|FIREBASE|config missing|credential/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebase && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebase ? 503 : 500 }
    );
  }
}
