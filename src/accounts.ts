import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { HeychatConfig, HeychatAccountConfig, ResolvedHeychatAccount } from "./types.js";

/**
 * List all configured account IDs from the accounts field.
 */
function listConfiguredAccountIds(cfg: ClawdbotConfig): string[] {
  const accounts = (cfg.channels?.heychat as HeychatConfig)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

/**
 * List all Heychat account IDs.
 * If no accounts are configured, returns [DEFAULT_ACCOUNT_ID] for backward compatibility.
 */
export function listHeychatAccountIds(cfg: ClawdbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    // Backward compatibility: no accounts configured, use default
    return [DEFAULT_ACCOUNT_ID];
  }
  return [...ids].toSorted((a, b) => a.localeCompare(b));
}

/**
 * Resolve the default account ID.
 */
export function resolveDefaultHeychatAccountId(cfg: ClawdbotConfig): string {
  const ids = listHeychatAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * Get the raw account-specific config.
 */
function resolveAccountConfig(cfg: ClawdbotConfig, accountId: string): HeychatAccountConfig | undefined {
  const accounts = (cfg.channels?.heychat as HeychatConfig)?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId];
}

/**
 * Merge top-level config with account-specific config.
 * Account-specific fields override top-level fields.
 */
function mergeHeychatAccountConfig(cfg: ClawdbotConfig, accountId: string): HeychatConfig {
  const heychatCfg = cfg.channels?.heychat as HeychatConfig | undefined;

  // Extract base config (exclude accounts field to avoid recursion)
  const { accounts: _ignored, ...base } = heychatCfg ?? {};

  // Get account-specific overrides
  const account = resolveAccountConfig(cfg, accountId) ?? {};

  // Merge: account config overrides base config
  return { ...base, ...account } as HeychatConfig;
}

/**
 * Resolve Heychat token from a config.
 * Priority: env > config > file
 */
export function resolveHeychatToken(cfg?: HeychatConfig): {
  token: string;
  source: "config" | "file" | "env" | "none";
} | null {
  // Check environment variable first
  const envToken = process.env.HEYCHAT_APP_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  // Check config token
  const configToken = cfg?.token?.trim();
  if (configToken) {
    return { token: configToken, source: "config" };
  }

  // Check token file
  const tokenFile = cfg?.tokenFile?.trim();
  if (tokenFile) {
    // Token file handling would require fs import, return as file source
    return { token: "", source: "file" };
  }

  return { token: "", source: "none" };
}

/**
 * Resolve a complete Heychat account with merged config.
 */
export function resolveHeychatAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): ResolvedHeychatAccount {
  const accountId = normalizeAccountId(params.accountId);
  const heychatCfg = params.cfg.channels?.heychat as HeychatConfig | undefined;

  // Base enabled state (top-level)
  const baseEnabled = heychatCfg?.enabled !== false;

  // Merge configs
  const merged = mergeHeychatAccountConfig(params.cfg, accountId);

  // Account-level enabled state
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  // Resolve token from merged config
  const tokenInfo = resolveHeychatToken(merged);

  // Build display name
  const name = (merged as HeychatAccountConfig).name?.trim() || `heychat:${accountId}`;

  // Build merged policy config
  const config = {
    dmPolicy: merged.dmPolicy ?? "pairing",
    groupPolicy: merged.groupPolicy ?? "open",
    allowFrom: merged.allowFrom ?? [],
    groups: merged.groups ?? {},
  };

  return {
    accountId,
    enabled,
    configured: Boolean(tokenInfo?.token),
    name,
    token: tokenInfo?.token,
    tokenSource: tokenInfo?.source ?? "none",
    config,
  };
}

/**
 * List all enabled and configured accounts.
 */
export function listEnabledHeychatAccounts(cfg: ClawdbotConfig): ResolvedHeychatAccount[] {
  return listHeychatAccountIds(cfg)
    .map((accountId) => resolveHeychatAccount({ cfg, accountId }))
    .filter((account) => account.enabled && account.configured);
}
