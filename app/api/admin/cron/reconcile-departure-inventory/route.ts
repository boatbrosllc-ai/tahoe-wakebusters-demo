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
    const expectedByDoc = new Map<string, number>();
    let mismatches = 0;
    let corrected = 0;
    const applyCorrections = request.nextUrl.searchParams.get("apply") === "true";
    const maxAutoCorrectDelta = (() => {
      const n = parseInt(process.env.DEPARTURE_INVENTORY_MAX_AUTO_CORRECT_DELTA ?? "10", 10);
      return Number.isFinite(n) && n >= 0 ? Math.min(n, 500) : 10;
    })();

    // Pass 1: aggregate active shared holds across the full dataset.
    let lastId: string | null = null;
    while (true) {
      let q = db.collection("holds").where("status", "==", "active").where("bookingMode", "==", "shared").orderBy("__name__").limit(PAGE_SIZE);
      if (lastId) q = q.startAfter(lastId);
      const snap = await q.get();
      if (snap.empty) break;
      snap.docs.forEach((d) => {
        const h = d.data() as { experienceId?: string; startDateStr?: string; expiresAt?: { toDate?: () => Date }; partySize?: number };
        const exp = typeof h.experienceId === "string" ? h.experienceId.trim() : "";
        const dateStr = typeof h.startDateStr === "string" ? h.startDateStr.trim() : "";
        const expAt = h.expiresAt?.toDate?.()?.getTime() ?? 0;
        if (!exp || !dateStr || expAt < now) return;
        const key = docIdFor(exp, dateStr);
        expectedByDoc.set(key, (expectedByDoc.get(key) ?? 0) + Math.max(0, h.partySize ?? 0));
      });
      lastId = snap.docs[snap.docs.length - 1]?.id ?? null;
      if (snap.size < PAGE_SIZE) break;
    }

    // Pass 2: reconcile each inventory document once, using full expected totals.
    const reconciledIds = new Set<string>();
    lastId = null;
    while (true) {
      let inventoryQuery = db.collection("departureInventory").orderBy("__name__").limit(PAGE_SIZE);
      if (lastId) inventoryQuery = inventoryQuery.startAfter(lastId);
      const inventorySnap = await inventoryQuery.get();
      if (inventorySnap.empty) break;
      for (const doc of inventorySnap.docs) {
        const inventoryId = doc.id;
        const current = ((doc.data() as { reservedSeats?: number }).reservedSeats ?? 0);
        const expected = expectedByDoc.get(inventoryId) ?? 0;
        reconciledIds.add(inventoryId);
        if (current === expected) continue;
        mismatches++;
        const delta = Math.abs(expected - current);
        await writeOperationalAlert({
          type: "departure_inventory_reconciliation_mismatch",
          source: "reconcile-departure-inventory",
          inventoryId,
          expectedReservedSeats: expected,
          observedReservedSeats: current,
        });
        if (applyCorrections) {
          if (delta > maxAutoCorrectDelta) {
            await writeOperationalAlert({
              type: "departure_inventory_auto_correct_skipped_large_delta",
              source: "reconcile-departure-inventory",
              inventoryId,
              delta,
              maxAutoCorrectDelta,
              expectedReservedSeats: expected,
              observedReservedSeats: current,
            });
          } else {
            await doc.ref.set({ reservedSeats: expected }, { merge: true });
            corrected++;
          }
        }
      }
      lastId = inventorySnap.docs[inventorySnap.docs.length - 1]?.id ?? null;
      if (inventorySnap.size < PAGE_SIZE) break;
    }

    // Pass 3: create/patch missing inventory docs that should have reserved seats.
    for (const [inventoryId, expected] of Array.from(expectedByDoc.entries())) {
      if (reconciledIds.has(inventoryId) || expected <= 0) continue;
      mismatches++;
      await writeOperationalAlert({
        type: "departure_inventory_reconciliation_mismatch",
        source: "reconcile-departure-inventory",
        inventoryId,
        expectedReservedSeats: expected,
        observedReservedSeats: 0,
      });
      if (applyCorrections) {
        const delta = Math.abs(expected - 0);
        if (delta > maxAutoCorrectDelta) {
          await writeOperationalAlert({
            type: "departure_inventory_auto_correct_skipped_large_delta",
            source: "reconcile-departure-inventory",
            inventoryId,
            delta,
            maxAutoCorrectDelta,
            expectedReservedSeats: expected,
            observedReservedSeats: 0,
          });
        } else {
          await db.collection("departureInventory").doc(inventoryId).set({ reservedSeats: expected }, { merge: true });
          corrected++;
        }
      }
    }
    return NextResponse.json({ ok: true, mismatches, corrected, applyCorrections });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
