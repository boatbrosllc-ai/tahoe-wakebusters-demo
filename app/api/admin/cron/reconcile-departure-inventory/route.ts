import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const PAGE_SIZE = 200;

function docIdFor(experienceId: string, dateStr: string): string {
  return `${experienceId}_${dateStr}`;
}

/** Reconciles departureInventory.reservedSeats against active shared holds. */
export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const now = Date.now();
    let lastId: string | null = null;
    let mismatches = 0;
    let corrected = 0;
    const applyCorrections = request.nextUrl.searchParams.get("apply") === "true";
    while (true) {
      let q = db.collection("holds").where("status", "==", "active").where("bookingMode", "==", "shared").orderBy("__name__").limit(PAGE_SIZE);
      if (lastId) q = q.startAfter(lastId);
      const snap = await q.get();
      if (snap.empty) break;
      const expectedByDoc = new Map<string, number>();
      snap.docs.forEach((d) => {
        const h = d.data() as { experienceId?: string; startDateStr?: string; expiresAt?: { toDate?: () => Date }; partySize?: number };
        const exp = typeof h.experienceId === "string" ? h.experienceId.trim() : "";
        const dateStr = typeof h.startDateStr === "string" ? h.startDateStr.trim() : "";
        const expAt = h.expiresAt?.toDate?.()?.getTime() ?? 0;
        if (!exp || !dateStr || expAt < now) return;
        const key = docIdFor(exp, dateStr);
        expectedByDoc.set(key, (expectedByDoc.get(key) ?? 0) + Math.max(0, h.partySize ?? 0));
      });
      for (const [inventoryId, expected] of Array.from(expectedByDoc.entries())) {
        const invRef = db.collection("departureInventory").doc(inventoryId);
        const invSnap = await invRef.get();
        const current = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
        if (current === expected) continue;
        mismatches++;
        await writeOperationalAlert({
          type: "departure_inventory_reconciliation_mismatch",
          source: "reconcile-departure-inventory",
          inventoryId,
          expectedReservedSeats: expected,
          observedReservedSeats: current,
        });
        if (applyCorrections) {
          await invRef.set({ reservedSeats: expected }, { merge: true });
          corrected++;
        }
      }
      lastId = snap.docs[snap.docs.length - 1]?.id ?? null;
      if (snap.size < PAGE_SIZE) break;
    }
    return NextResponse.json({ ok: true, mismatches, corrected, applyCorrections });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
