import { z } from "zod";
export { z };

const DmPolicySchema = z.enum(["pairing", "open", "allowlist"]);
const GroupPolicySchema = z.enum(["open", "allowlist", "disabled"]);

/**
 * Per-account configuration.
 * All fields are optional - missing fields inherit from top-level config.
 */
export const HeychatAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().optional(), // Display name for this account
    token: z.string().optional(),
    tokenFile: z.string().optional(),
    dmPolicy: DmPolicySchema.optional(),
    groupPolicy: GroupPolicySchema.optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groups: z.record(z.string(), z.object({ requireMention: z.boolean().optional() }).optional()).optional(),
  })
  .strict();

export const HeychatConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    // Top-level credentials (backward compatible for single-account mode)
    token: z.string().optional(),
    tokenFile: z.string().optional(),
    name: z.string().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    groupPolicy: GroupPolicySchema.optional().default("open"),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groups: z.record(z.string(), z.object({ requireMention: z.boolean().optional() }).optional()).optional(),
    // Multi-account configuration
    accounts: z.record(z.string(), HeychatAccountConfigSchema.optional()).optional(),
  })
  .strict();
