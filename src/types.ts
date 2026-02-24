import type { BaseProbeResult } from "openclaw/plugin-sdk";
import type { HeychatConfigSchema, HeychatAccountConfigSchema, z } from "./config-schema.js";

export type HeychatConfig = z.infer<typeof HeychatConfigSchema>;
export type HeychatAccountConfig = z.infer<typeof HeychatAccountConfigSchema>;

export type ResolvedHeychatAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  token?: string;
  tokenSource: "config" | "file" | "env" | "none";
  /** Merged config (top-level defaults + account-specific overrides) */
  config: {
    dmPolicy?: "pairing" | "open" | "allowlist";
    groupPolicy?: "open" | "allowlist" | "disabled";
    allowFrom?: string[];
    groups?: Record<string, { requireMention?: boolean }>;
  };
};

export type HeychatProbeResult = BaseProbeResult<string> & {
  bot?: {
    id: string;
    name: string;
  };
};
