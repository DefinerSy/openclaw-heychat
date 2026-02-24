import type { AllowlistMatch, ChannelGroupContext, GroupToolPolicyConfig } from "openclaw/plugin-sdk";
import type { HeychatConfig } from "./types.js";

export type HeychatAllowlistMatch = AllowlistMatch<"wildcard" | "id">;

function normalizeHeychatAllowEntry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "*") {
    return "*";
  }
  // Remove heychat: or hc: prefix
  const withoutProviderPrefix = trimmed.replace(/^(heychat|hc):/i, "");
  return withoutProviderPrefix.trim().toLowerCase();
}

export function resolveHeychatAllowlistMatch(params: {
  allowFrom: Array<string | number>;
  senderId: string;
  senderIds?: Array<string | null | undefined>;
  senderName?: string | null;
}): HeychatAllowlistMatch {
  const allowFrom = params.allowFrom
    .map((entry) => normalizeHeychatAllowEntry(String(entry)))
    .filter(Boolean);
  if (allowFrom.length === 0) {
    return { allowed: false };
  }
  if (allowFrom.includes("*")) {
    return { allowed: true, matchKey: "*", matchSource: "wildcard" };
  }

  const senderCandidates = [params.senderId, ...(params.senderIds ?? [])]
    .map((entry) => normalizeHeychatAllowEntry(String(entry ?? "")))
    .filter(Boolean);

  for (const senderId of senderCandidates) {
    if (allowFrom.includes(senderId)) {
      return { allowed: true, matchKey: senderId, matchSource: "id" };
    }
  }

  return { allowed: false };
}

export function resolveHeychatGroupConfig(params: {
  cfg?: HeychatConfig;
  groupId?: string | null;
}): Record<string, { requireMention?: boolean }> | undefined {
  const groups = params.cfg?.groups ?? {};
  const groupId = params.groupId?.trim();
  if (!groupId) {
    return undefined;
  }

  const direct = groups[groupId];
  if (direct) {
    return direct;
  }

  const lowered = groupId.toLowerCase();
  const matchKey = Object.keys(groups).find((key) => key.toLowerCase() === lowered);
  return matchKey ? groups[matchKey] : undefined;
}

export function resolveHeychatGroupToolPolicy(
  params: ChannelGroupContext,
): GroupToolPolicyConfig | undefined {
  const cfg = params.cfg.channels?.heychat as HeychatConfig | undefined;
  if (!cfg) {
    return undefined;
  }

  const groupConfig = resolveHeychatGroupConfig({
    cfg,
    groupId: params.groupId,
  });

  return undefined; // Heychat doesn't support tool policies yet
}

export function isHeychatGroupAllowed(params: {
  groupPolicy: "open" | "allowlist" | "disabled";
  allowFrom: Array<string | number>;
  senderId: string;
  senderIds?: Array<string | null | undefined>;
  senderName?: string | null;
}): boolean {
  const { groupPolicy } = params;
  if (groupPolicy === "disabled") {
    return false;
  }
  if (groupPolicy === "open") {
    return true;
  }
  return resolveHeychatAllowlistMatch(params).allowed;
}
