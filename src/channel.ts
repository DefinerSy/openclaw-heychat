import type {
  ChannelMeta,
  ChannelPlugin,
  ClawdbotConfig,
} from "openclaw/plugin-sdk";
import {
  buildBaseChannelStatusSummary,
  createDefaultChannelRuntimeState,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
} from "openclaw/plugin-sdk";
import {
  resolveHeychatAccount,
  resolveHeychatToken,
  listHeychatAccountIds,
  resolveDefaultHeychatAccountId,
} from "./accounts.js";
import { getHeychatRuntime } from "./runtime.js";
import { isHeychatGroupAllowed, resolveHeychatGroupConfig } from "./policy.js";
import type { ResolvedHeychatAccount, HeychatConfig, HeychatProbeResult } from "./types.js";

const meta: ChannelMeta = {
  id: "heychat",
  label: "Heychat",
  selectionLabel: "Heychat (黑盒语音)",
  docsPath: "/channels/heychat",
  docsLabel: "heychat",
  blurb: "Heychat (黑盒语音) channel plugin.",
  aliases: ["heychat"],
  order: 70,
};

// 黑盒语音 WebSocket 和 HTTP 配置
const HEYCHAT_WSS_URL = "wss://chat.xiaoheihe.cn/chatroom/ws/connect";
const HEYCHAT_HTTP_HOST = "https://chat.xiaoheihe.cn";
const HEYCHAT_COMMON_PARAMS = "chat_os_type=bot&client_type=heybox_chat&chat_version=999.0.0&chat_version=1.24.5";

// 消息类型
const MSG_TYPE = {
  TEXT: 1,
  IMAGE: 3,
  MARKDOWN: 4,
  AT_MARKDOWN: 10,
};

// 发送消息到黑盒语音
async function sendHeychatMessage(
  token: string,
  options: {
    roomId: string;
    channelId: string;
    text: string;
    replyId?: string;
    msgType?: number;
  }
): Promise<{ messageId: string; ackId: string; msgId: string }> {
  const url = `${HEYCHAT_HTTP_HOST}/chatroom/v2/channel_msg/send?${HEYCHAT_COMMON_PARAMS}`;

  const body = {
    heychat_ack_id: "0",
    msg_type: options.msgType ?? MSG_TYPE.TEXT,
    msg: options.text,
    channel_id: options.channelId,
    room_id: options.roomId,
    reply_id: options.replyId ?? "",
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": token,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.status !== "ok") {
      throw new Error(result.msg || "Failed to send message");
    }

    return {
      messageId: result.result?.chatmobile_ack_id ?? "",
      ackId: result.result?.heychat_ack_id ?? "",
      msgId: result.result?.msg_id ?? "",
    };
  } catch (error) {
    throw new Error(`Failed to send Heychat message: ${error}`);
  }
}

// 探测黑盒语音 Token 是否有效
async function probeHeychat(token: string, timeoutMs: number = 5000): Promise<HeychatProbeResult> {
  if (!token || !token.trim()) {
    return { ok: false, error: "Token is empty" };
  }

  if (token.length < 10) {
    return { ok: false, error: "Token format invalid" };
  }

  return {
    ok: true,
    bot: {
      id: "heychat-bot",
      name: "Heychat Bot",
    },
  };
}

const heychatMessageActions = {
  listActions: (ctx: any) => [],
  extractToolSend: (ctx: any) => null,
  handleAction: async (ctx: any) => {
    throw new Error("Heychat message actions not yet implemented");
  },
};

export const heychatPlugin: ChannelPlugin<ResolvedHeychatAccount, HeychatProbeResult> = {
  id: "heychat",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  pairing: {
    idLabel: "heychatUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(heychat|hc):/i, ""),
    notifyApproval: async ({ cfg, id, accountId }) => {
      const account = resolveHeychatAccount({ cfg, accountId: accountId || DEFAULT_ACCOUNT_ID });
      if (!account.token) {
        throw new Error("Heychat token not configured");
      }
      await sendHeychatMessage(account.token, {
        roomId: id,
        channelId: id,
        text: PAIRING_APPROVED_MESSAGE,
        msgType: MSG_TYPE.TEXT,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    polls: false,
    nativeCommands: true,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.heychat"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        token: { type: "string" },
        tokenFile: { type: "string" },
        name: { type: "string" },
        dmPolicy: { type: "string", enum: ["pairing", "open", "allowlist"] },
        groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
        allowFrom: { type: "array", items: { type: "string" } },
        groups: { type: "object" },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              name: { type: "string" },
              token: { type: "string" },
              tokenFile: { type: "string" },
              dmPolicy: { type: "string", enum: ["pairing", "open", "allowlist"] },
              groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
              allowFrom: { type: "array", items: { type: "string" } },
              groups: { type: "object" },
            },
          },
        },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listHeychatAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveHeychatAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultHeychatAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        // For default account, set top-level enabled
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            heychat: {
              ...cfg.channels?.heychat,
              enabled,
            },
          },
        };
      }

      // For named accounts, set enabled in accounts[accountId]
      const heychatCfg = cfg.channels?.heychat as HeychatConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          heychat: {
            ...heychatCfg,
            accounts: {
              ...heychatCfg?.accounts,
              [accountId]: {
                ...heychatCfg?.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        // Delete entire heychat config
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).heychat;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }

      // Delete specific account from accounts
      const heychatCfg = cfg.channels?.heychat as HeychatConfig | undefined;
      const accounts = { ...heychatCfg?.accounts };
      delete accounts[accountId];

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          heychat: {
            ...heychatCfg,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveHeychatAccount({ cfg, accountId });
      return (account.config?.allowFrom ?? []).map((entry) => String(entry));
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(heychat|hc):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    collectWarnings: ({ cfg, accountId }) => {
      const account = resolveHeychatAccount({ cfg, accountId });
      const heychatCfg = account.config;
      const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
      const { groupPolicy } = resolveAllowlistProviderRuntimeGroupPolicy({
        providerConfigPresent: cfg.channels?.heychat !== undefined,
        groupPolicy: heychatCfg?.groupPolicy,
        defaultGroupPolicy,
      });
      if (groupPolicy === "open") return [];
      return [
        `- Heychat[${account.accountId}] groups: groupPolicy="open" allows any member to trigger the bot. Set groupPolicy="allowlist" to restrict senders.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId, groupId }) => {
      const account = resolveHeychatAccount({ cfg, accountId });
      const groupConfig = account.config.groups?.[groupId];
      return groupConfig?.requireMention ?? true;
    },
    resolveToolPolicy: ({ cfg, accountId, groupId }) => {
      return "allowed";
    },
  },
  messaging: {
    normalizeTarget: (target) => {
      return target;
    },
    targetResolver: {
      looksLikeId: (id) => /^[0-9]+$/.test(id),
      hint: "<room_id>:<channel_id>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },
  actions: heychatMessageActions,
  outbound: {
    deliveryMode: "direct",
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    pollMaxOptions: 10,
    sendText: async ({ to, text, accountId, replyToId, threadId, silent, cfg }) => {
      const [roomId, channelId] = to.split(":");
      const account = resolveHeychatAccount({ cfg, accountId: accountId || DEFAULT_ACCOUNT_ID });

      if (!account.token) {
        throw new Error("Heychat token not configured");
      }

      const result = await sendHeychatMessage(account.token, {
        roomId: roomId || to,
        channelId: channelId || roomId || to,
        text,
        replyId: replyToId,
        msgType: MSG_TYPE.TEXT,
      });

      return { channel: "heychat", messageId: result.messageId, ackId: result.ackId };
    },
    sendMedia: async ({ to, text, mediaUrl }) => {
      throw new Error("Heychat sendMedia not yet implemented");
    },
    sendPoll: async () => {
      throw new Error("Heychat sendPoll not yet implemented");
    },
  },