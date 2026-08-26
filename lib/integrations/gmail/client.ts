const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailProfile = { emailAddress?: string; historyId?: string };
export type GmailMessage = {
  id: string;
  threadId?: string;
  historyId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    mimeType?: string;
    headers?: { name?: string; value?: string }[];
    body?: { data?: string; size?: number };
    parts?: unknown[];
  };
};
export type GmailHistoryList = {
  history?: Array<{
    id?: string;
    messagesAdded?: Array<{ message?: { id?: string; threadId?: string; labelIds?: string[] } }>;
    messages?: Array<{ id?: string; threadId?: string }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
};

async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    const err = new Error(json.error?.message || `Gmail API ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function gmailGetProfile(accessToken: string): Promise<GmailProfile> {
  return gmailFetch<GmailProfile>(accessToken, "/profile");
}

export async function gmailGetMessage(accessToken: string, id: string): Promise<GmailMessage> {
  return gmailFetch<GmailMessage>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`);
}

export async function gmailListHistory(
  accessToken: string,
  startHistoryId: string,
  pageToken?: string
): Promise<GmailHistoryList> {
  const qs = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
  });
  if (pageToken) qs.set("pageToken", pageToken);
  return gmailFetch<GmailHistoryList>(accessToken, `/history?${qs.toString()}`);
}

export async function gmailSearchMessages(
  accessToken: string,
  q: string,
  maxResults = 50,
  pageToken?: string
): Promise<{ messages?: Array<{ id: string; threadId?: string }>; nextPageToken?: string }> {
  const qs = new URLSearchParams({ q, maxResults: String(maxResults) });
  if (pageToken) qs.set("pageToken", pageToken);
  return gmailFetch(accessToken, `/messages?${qs.toString()}`);
}

export type GmailWatchResponse = {
  historyId?: string;
  expiration?: string;
};

export async function gmailUsersWatch(
  accessToken: string,
  topicName: string
): Promise<GmailWatchResponse> {
  return gmailFetch<GmailWatchResponse>(accessToken, "/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "include",
    }),
  });
}

export function collectHistoryMessageIds(history: GmailHistoryList): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const h of history.history ?? []) {
    for (const added of h.messagesAdded ?? []) {
      const id = added.message?.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

export function isStaleHistoryError(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : String(err);
  return status === 404 || /history.?id/i.test(message) && /not found|invalid|expired/i.test(message);
}
