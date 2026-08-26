import { describe, it } from "node:test";
import assert from "node:assert";
import { decodeBase64Url, extractGmailBodies, getGmailHeader } from "../mime";
import { shouldRenewGmailWatch } from "../watch-logic";
import {
  decodePubSubMessageData,
  isExpectedGmailPush,
  pubSubDeliveryId,
  pubSubTokenMatches,
} from "../pubsub";
import { detectMarketplaceProvider } from "@/lib/integrations/marketplaces/detector";
import { collectHistoryMessageIds, isStaleHistoryError } from "../client";

describe("Gmail MIME", () => {
  it("decodes nested multipart HTML and text", () => {
    const html = Buffer.from("<p>Booking ID: abc123</p>").toString("base64url");
    const text = Buffer.from("Booking ID: abc123").toString("base64url");
    const bodies = extractGmailBodies({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: text } },
        {
          mimeType: "multipart/related",
          parts: [{ mimeType: "text/html", body: { data: html } }],
        },
      ],
    });
    assert.match(bodies.text, /Booking ID: abc123/);
    assert.match(bodies.html, /Booking ID: abc123/);
  });

  it("handles malformed MIME without throwing", () => {
    const bodies = extractGmailBodies({ mimeType: "multipart/mixed", parts: [{ mimeType: "application/octet-stream" }] });
    assert.equal(bodies.text, "");
    assert.equal(bodies.html, "");
    assert.equal(decodeBase64Url("QQ"), "A");
    assert.equal(getGmailHeader({ headers: [{ name: "From", value: "x@y.com" }] }, "from"), "x@y.com");
  });

  it("decodes quoted-printable at the byte level using the CTE header", () => {
    const qp = Buffer.from("Guest: =C3=A9").toString("base64url");
    const decoded = extractGmailBodies({
      mimeType: "text/plain",
      headers: [{ name: "Content-Transfer-Encoding", value: "quoted-printable" }],
      body: { data: qp },
    });
    assert.equal(decoded.text, "Guest: é");

    const raw = extractGmailBodies({
      mimeType: "text/plain",
      body: { data: qp },
    });
    assert.equal(raw.text, "Guest: =C3=A9");
  });
});

describe("Gmail watch renewal", () => {
  it("renews when expiration is within 24 hours", () => {
    const now = Date.parse("2026-08-20T12:00:00Z");
    assert.equal(shouldRenewGmailWatch(now + 2 * 60 * 60 * 1000, now), true);
    assert.equal(shouldRenewGmailWatch(now + 3 * 24 * 60 * 60 * 1000, now), false);
    assert.equal(shouldRenewGmailWatch(undefined, now), true);
  });
});

describe("Pub/Sub and history handling", () => {
  it("treats duplicate Pub/Sub deliveries as the same id", () => {
    const body = { message: { messageId: "m-1", data: Buffer.from(JSON.stringify({ historyId: "99" })).toString("base64") } };
    assert.equal(pubSubDeliveryId(body), "m-1");
    assert.equal(pubSubDeliveryId(body), pubSubDeliveryId(body));
    const decoded = decodePubSubMessageData(body.message.data);
    assert.equal(decoded?.historyId, "99");
    assert.equal(isExpectedGmailPush(decoded), true);
  });

  it("rejects a missing push token", () => {
    assert.equal(pubSubTokenMatches("abc", "abc"), true);
    assert.equal(pubSubTokenMatches("abc", "abd"), false);
    assert.equal(pubSubTokenMatches(null, "abc"), false);
  });

  it("collects unique history message ids and detects stale history", () => {
    const ids = collectHistoryMessageIds({
      history: [
        { messagesAdded: [{ message: { id: "a" } }, { message: { id: "a" } }] },
        { messagesAdded: [{ message: { id: "b" } }] },
      ],
    });
    assert.deepEqual(ids, ["a", "b"]);
    assert.equal(isStaleHistoryError({ status: 404, message: "History id not found" }), true);
    assert.equal(isStaleHistoryError({ status: 400, message: "nope" }), false);
  });

  it("ignores unsupported senders", () => {
    const detected = detectMarketplaceProvider({
      id: "x",
      from: "Spam <promo@example.com>",
      fromEmail: "promo@example.com",
      subject: "Hello",
      text: "Not a marketplace booking",
    });
    assert.equal(detected.provider, null);
  });
});
