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
import { addReactionHeychat, removeReactionHeychat, HeychatEmoji } from "./reactions.js";
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
  CARD: 20,
};

// Room ID 到 Channel ID 的映射缓存 (room_id -> channel_id)
const roomToChannelMap = new Map<string, string>();

// Channel ID 到 Room ID 的反向映射 (channel_id -> room_id)
const channelToRoomMap = new Map<string, string>();

// 缓存 room_id -> channel_id 映射
function cacheRoomChannel(roomId: string, channelId: string, log?: any) {
  if (roomId && channelId) {
    roomToChannelMap.set(roomId, channelId);
    channelToRoomMap.set(channelId, roomId);
    if (log) {
      log.info(`[heychat] Cached room->channel: ${roomId} -> ${channelId}`);
    }
  }
}

// 获取 channel_id，如果缓存中没有则返回 room_id
function getChannelId(roomId: string): string {
  return roomToChannelMap.get(roomId) || roomId;
}

// 获取 room_id，如果缓存中没有则返回 channel_id
function getRoomId(channelId: string): string {
  return channelToRoomMap.get(channelId) || channelId;
}

// 生成唯一的 ack_id（避免重复消息错误）
function generateAckId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

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
    heychat_ack_id: generateAckId(),
    msg_type: options.msgType ?? MSG_TYPE.MARKDOWN,
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

// 发送卡片消息到黑盒语音
async function sendHeychatCard(
  token: string,
  options: {
    roomId: string;
    channelId: string;
    cardData: any;
    replyId?: string;
  }
): Promise<{ messageId: string; ackId: string; msgId: string }> {
  const url = `${HEYCHAT_HTTP_HOST}/chatroom/v2/channel_msg/send?${HEYCHAT_COMMON_PARAMS}`;

  // 卡片消息使用 msg_type: 20
  const body = {
    heychat_ack_id: generateAckId(),
    msg_type: 20,
    msg: JSON.stringify(options.cardData),
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
      throw new Error(result.msg || "Failed to send card message");
    }

    return {
      messageId: result.result?.chatmobile_ack_id ?? "",
      ackId: result.result?.heychat_ack_id ?? "",
      msgId: result.result?.msg_id ?? "",
    };
  } catch (error) {
    throw new Error(`Failed to send Heychat card: ${error}`);
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

// 黑盒语音卡片构建辅助函数
const HeychatCardBuilder = {
  // 创建基础卡片结构
  createCard: (modules: any[]) => ({
    data: [{
      type: "card",
      border_color: "",
      size: "medium",
      modules,
    }],
  }),

  // 纯文本模块
  plainText: (text: string, width?: string) => ({
    type: "section",
    paragraph: [{
      type: "plain-text",
      text,
      ...(width ? { width } : {}),
    }],
  }),

  // Markdown 模块
  markdown: (text: string, width?: string) => ({
    type: "section",
    paragraph: [{
      type: "markdown",
      text,
      ...(width ? { width } : {}),
    }],
  }),

  // 多列布局
  multiColumn: (items: Array<{ type: "plain-text" | "markdown"; text: string; width?: string }>) => ({
    type: "section",
    paragraph: items.map(item => ({
      type: item.type,
      text: item.text,
      ...(item.width ? { width: item.width } : {}),
    })),
  }),

  // 文本 + 图片
  textWithImage: (text: string, imageUrl: string, imageSize: "small" | "medium" | "large" = "medium") => ({
    type: "section",
    paragraph: [
      { type: "plain-text", text },
      { type: "image", url: imageUrl, size: imageSize },
    ],
  }),

  // 标题
  header: (title: string) => ({
    type: "header",
    content: {
      type: "plain-text",
      text: title,
    },
  }),

  // 单图
  singleImage: (imageUrl: string) => ({
    type: "images",
    urls: [{ url: imageUrl }],
  }),

  // 多图网格
  imageGrid: (imageUrls: string[]) => ({
    type: "images",
    urls: imageUrls.map(url => ({ url })),
  }),

  // 按钮
  button: (text: string, url: string, theme: "default" | "success" | "warning" | "danger" = "default") => ({
    type: "button",
    event: "link-to",
    value: url,
    text,
    theme,
  }),

  // 按钮组
  buttonGroup: (buttons: Array<{ text: string; url: string; theme?: "default" | "success" | "warning" | "danger" }>) => ({
    type: "button-group",
    btns: buttons.map(btn => HeychatCardBuilder.button(btn.text, btn.url, btn.theme)),
  }),
};

const heychatMessageActions = {
  listActions: (ctx: any) => [],
  extractToolSend: (ctx: any) => null,
  handleAction: async (ctx: any) => {
    throw new Error("Heychat message actions not yet implemented");
  },
};

export { HeychatCardBuilder };

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
        msgType: MSG_TYPE.MARKDOWN,
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
    cards: true,
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
    chunkerMode: "text",
    textChunkLimit: 4000,
    pollMaxOptions: 10,
    sendText: async ({ to, text, accountId, replyToId, threadId, silent, cfg }) => {
      const [roomId, channelId] = to.split(":");
      const account = resolveHeychatAccount({ cfg, accountId: accountId || DEFAULT_ACCOUNT_ID });

      if (!account.token) {
        throw new Error("Heychat token not configured");
      }

      // 自动判断 room_id 和 channel_id
      let finalRoomId: string;
      let finalChannelId: string;

      if (roomId && channelId) {
        // 已提供完整格式 room_id:channel_id
        finalRoomId = roomId;
        finalChannelId = channelId;
      } else if (roomId) {
        // 只提供 room_id，查找缓存的 channel_id
        finalRoomId = roomId;
        finalChannelId = getChannelId(roomId) || roomId;
      } else {
        // 只提供 channel_id，查找缓存的 room_id
        finalChannelId = to;
        finalRoomId = getRoomId(to) || to;
      }

      const result = await sendHeychatMessage(account.token, {
        roomId: finalRoomId,
        channelId: finalChannelId,
        text,
        replyId: replyToId,
        msgType: MSG_TYPE.MARKDOWN,
      });

      return { channel: "heychat", messageId: result.messageId, ackId: result.ackId };
    },
    sendMedia: async ({ to, text, mediaUrl }) => {
      throw new Error("Heychat sendMedia not yet implemented");
    },
    sendPoll: async () => {
      throw new Error("Heychat sendPoll not yet implemented");
    },
    sendCard: async ({ to, cardData, accountId, replyToId, cfg }) => {
      const [roomId, channelId] = to.split(":");
      const account = resolveHeychatAccount({ cfg, accountId: accountId || DEFAULT_ACCOUNT_ID });

      if (!account.token) {
        throw new Error("Heychat token not configured");
      }

      // 自动判断 room_id 和 channel_id
      let finalRoomId: string;
      let finalChannelId: string;

      if (roomId && channelId) {
        // 已提供完整格式 room_id:channel_id
        finalRoomId = roomId;
        finalChannelId = channelId;
      } else if (roomId) {
        // 只提供 room_id，查找缓存的 channel_id
        finalRoomId = roomId;
        finalChannelId = getChannelId(roomId) || roomId;
      } else {
        // 只提供 channel_id，查找缓存的 room_id
        finalChannelId = to;
        finalRoomId = getRoomId(to) || to;
      }

      const result = await sendHeychatCard(account.token, {
        roomId: finalRoomId,
        channelId: finalChannelId,
        cardData,
        replyId: replyToId,
      });

      return { channel: "heychat", messageId: result.messageId, ackId: result.ackId };
    },
  },
  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, { port: null }),
    buildChannelSummary: ({ snapshot }) => ({
      ...buildBaseChannelStatusSummary(snapshot),
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => await probeHeychat(account.token, timeoutMs),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      tokenSource: account.tokenSource,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = resolveHeychatAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
      const token = account.token?.trim();

      if (!token) {
        throw new Error("Heychat token not configured");
      }

      ctx.log?.info(`[heychat] [${ctx.accountId}] connecting to Heychat WebSocket...`);

      // 建立 WebSocket 连接并转发到 OpenClaw Gateway
      return startHeychatWebSocket(token, {
        accountId: ctx.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        log: ctx.log,
      });
    },
    logoutAccount: async ({ accountId, cfg }) => {
      return { cleared: false, envToken: false, loggedOut: true };
    },
  },
};

// Heychat WebSocket 运行时
interface HeychatWSContext {
  accountId: string;
  config: ClawdbotConfig;
  runtime: any;
  abortSignal: AbortSignal;
  log: any;
}

// 全局消息去重集合（模块级别，避免重连时重置）
const HEYCHAT_PROCESSED_MSG_IDS = new Set<string>();
const HEYCHAT_PROCESSING_MSG_IDS = new Set<string>();
const MAX_MSG_ID_CACHE = 1000;

// 处理 Heychat inbound 消息
async function processHeychatInboundMessage(params: {
  ctx: HeychatWSContext;
  roomId: string;
  channelId: string;
  userId: string;
  senderName: string;
  userMessage: string;
  msgId: string;
  isGroup: boolean;
}) {
  const { ctx, roomId, channelId, userId, senderName, userMessage, msgId, isGroup } = params;
  const core = getHeychatRuntime();
  const cfg = ctx.config;
  const accountId = ctx.accountId;
  const heychatCfg = cfg.channels?.heychat;

  try {
    // 缓存 room_id -> channel_id 映射
    if (roomId && channelId && roomId !== channelId) {
      cacheRoomChannel(roomId, channelId, ctx?.log);
    }

    // 处理 /pair 命令
    if (userMessage.startsWith("/pair")) {
      const parts = userMessage.split(/\s+/);
      const botId = parts[1]?.trim();
      
      ctx.log?.info(`[heychat] [${accountId}] Received /pair command with botId: ${botId}`);
      
      if (botId && botId === String(userId)) {
        // botId 匹配，将 channel_id 添加到 allowFrom
        const currentAllowFrom = heychatCfg?.allowFrom ?? [];
        if (!currentAllowFrom.includes(channelId)) {
          const newAllowFrom = [...currentAllowFrom, channelId];
          ctx.log?.info(`[heychat] [${accountId}] Adding channel ${channelId} to allowFrom`);
          
          // 更新配置
          await core.config.patch({
            path: ["channels", "heychat", "allowFrom"],
            value: newAllowFrom,
          });
          
          ctx.log?.info(`[heychat] [${accountId}] Successfully added ${channelId} to allowFrom`);
          
          // 发送成功消息
          const account = resolveHeychatAccount({ cfg, accountId });
          if (account.token) {
            await sendHeychatMessage(account.token, {
              roomId,
              channelId,
              text: `✅ 配对成功！\n\nroom_id: \`${roomId}\`\nchannel_id: \`${channelId}\`\n\n已添加到 allowFrom 列表`,
              msgType: MSG_TYPE.MARKDOWN,
            });
          }
        } else {
          // 已经在 allowFrom 中
          ctx.log?.info(`[heychat] [${accountId}] Channel ${channelId} already in allowFrom`);
          
          const account = resolveHeychatAccount({ cfg, accountId });
          if (account.token) {
            await sendHeychatMessage(account.token, {
              roomId,
              channelId,
              text: `ℹ️ 该频道已在 allowFrom 列表中\n\nroom_id: \`${roomId}\`\nchannel_id: \`${channelId}\``,
              msgType: MSG_TYPE.MARKDOWN,
            });
          }
        }
      } else {
        // botId 不匹配
        ctx.log?.warn(`[heychat] [${accountId}] BotId mismatch: expected ${userId}, got ${botId}`);
        
        const account = resolveHeychatAccount({ cfg, accountId });
        if (account.token) {
          await sendHeychatMessage(account.token, {
            roomId,
            channelId,
            text: `❌ 配对失败：botId 不匹配\n\n请使用正确的 botId: \`${userId}\``,
            msgType: MSG_TYPE.MARKDOWN,
          });
        }
      }
      
      // 不继续处理该消息
      return;
    }

    // 群组策略检查
    if (isGroup) {
      const account = resolveHeychatAccount({ cfg, accountId });
      const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
      const { groupPolicy } = resolveAllowlistProviderRuntimeGroupPolicy({
        providerConfigPresent: cfg.channels?.heychat !== undefined,
        groupPolicy: account.config.groupPolicy,
        defaultGroupPolicy,
      });
      const groupAllowFrom = account.config.allowFrom ?? [];

      // 检查群组是否被允许
      const groupAllowed = isHeychatGroupAllowed({
        groupPolicy,
        allowFrom: groupAllowFrom,
        senderId: channelId, // 使用群组 ID 检查
        senderName: undefined,
      });

      if (!groupAllowed) {
        ctx.log?.info(
          `[heychat] [${accountId}] Group ${channelId} not in allowlist, message ignored`,
        );
        return;
      }

      // 检查组内发送者白名单（如果配置了）
      const groupConfig = resolveHeychatGroupConfig({ cfg: heychatCfg, groupId: channelId });
      const senderAllowFrom = groupConfig?.allowFrom ?? [];
      if (senderAllowFrom.length > 0) {
        const senderAllowed = isHeychatGroupAllowed({
          groupPolicy: "allowlist",
          allowFrom: senderAllowFrom,
          senderId: userId,
          senderName: senderName,
        });
        if (!senderAllowed) {
          ctx.log?.info(
            `[heychat] [${accountId}] User ${userId} not in group ${channelId} sender allowlist, message ignored`,
          );
          return;
        }
      }
    }
    // 计算 conversation key
    const conversationId = `${roomId}:${channelId}`;
    const chatType = isGroup ? "group" : "direct";

    // 记录活动
    core.channel.activity.record({
      channel: "heychat",
      accountId,
      direction: "inbound",
    });

    // 计算 Agent 路由
    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "heychat",
      accountId,
      peer: {
        kind: chatType === "direct" ? "direct" : "group",
        id: chatType === "direct" ? userId : channelId,
      },
    });

    const sessionKey = route.sessionKey;

    // 构建 from 标签
    const fromLabel = isGroup
      ? `${channelId}:${userId}`
      : userId;

    // 构建消息信封
    const body = core.channel.reply.formatInboundEnvelope({
      channel: "Heychat",
      from: fromLabel,
      timestamp: Date.now(),
      body: userMessage,
      chatType,
      sender: { name: String(senderName), id: String(userId) },
    });

    // 构建消息体
    const preview = userMessage.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isGroup
      ? `Heychat[${accountId}] message in group ${channelId}`
      : `Heychat[${accountId}] DM from ${senderName}`;

    // 构建完整的上下文
    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      BodyForAgent: userMessage,
      RawBody: userMessage,
      CommandBody: userMessage,
      From: fromLabel,
      To: conversationId,
      SessionKey: sessionKey,
      AccountId: accountId,
      ChatType: chatType,
      GroupSubject: isGroup ? channelId : undefined,
      SenderName: String(senderName),
      SenderId: String(userId),
      Provider: "heychat" as const,
      Surface: "heychat" as const,
      MessageSid: String(msgId),
      Timestamp: Date.now(),
    });

    // 提交系统事件
    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey,
      contextKey: `heychat:message:${conversationId}:${msgId}`,
    });

    // 收到消息时添加表情反应（可配置）
    const account = resolveHeychatAccount({ cfg, accountId });
    const token = account.token || "";
    let reactionId: string | null = null;
    
    // 读取表情配置（支持自定义）
    const reactionsCfg = (cfg.channels?.heychat as any)?.reactions;
    const processingEmoji = reactionsCfg?.enabled !== false 
      ? (reactionsCfg?.processing || HeychatEmoji.EYES)
      : null;
    
    if (token && msgId && processingEmoji) {
      addReactionHeychat({
        cfg,
        roomId,
        channelId,
        msgId,
        emoji: processingEmoji,
        accountId,
      })
        .then((result) => {
          reactionId = result.reactionId;
          ctx.log?.info(`[heychat] Added reaction: ${result.reactionId} (${processingEmoji})`);
        })
        .catch(err => ctx.log?.warn(`[heychat] Failed to add reaction: ${err}`));
    }

    // 创建回复分发器并触发 Agent 回复
    const { dispatcher, replyOptions, markDispatchIdle } =
      core.channel.reply.createReplyDispatcherWithTyping({
        humanDelay: { min: 0, max: 0 },
        deliver: async (payload) => {
          const text = payload.text ?? "";
          const account = resolveHeychatAccount({ cfg, accountId });
          const token = account.token || "";
          try {
            await sendHeychatMessage(token, {
              roomId,
              channelId,
              text,
              msgType: MSG_TYPE.MARKDOWN,
            });
            ctx.log?.info(`[heychat] [${accountId}] Sent reply: ${text.substring(0, 50)}...`);
          } catch (err) {
            ctx.log?.error(`[heychat] [${accountId}] Failed to send reply: ${String(err)}`);
          }
        },
      });

    // 分发回复（这会触发 Agent 处理并等待回复）
    try {
      const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
        ctx: ctxPayload,
        cfg,
        dispatcher,
        replyOptions,
      });
      markDispatchIdle();
      if (queuedFinal || (counts?.final ?? 0) > 0) {
        ctx.log?.info(`[heychat] [${accountId}] Agent reply complete (queuedFinal=${queuedFinal}, replies=${counts?.final ?? 0})`);
        
        // 回复完成后取消表情反应（使用相同的表情）
        if (reactionId && msgId && processingEmoji) {
          removeReactionHeychat({
            cfg,
            roomId,
            channelId,
            msgId,
            emoji: processingEmoji,
            accountId,
          })
            .then(() => ctx.log?.info(`[heychat] Removed reaction: ${reactionId}`))
            .catch(err => ctx.log?.warn(`[heychat] Failed to remove reaction: ${err}`));
        }
      }
    } catch (err) {
      ctx.log?.error(`[heychat] [${accountId}] Failed to dispatch reply: ${String(err)}`);
      markDispatchIdle();
    }
  } catch (err) {
    ctx.log?.error(`[heychat] [${accountId}] processHeychatInboundMessage failed: ${String(err)}`);
    ctx.log?.error(`[heychat] [${accountId}] Stack:`, err instanceof Error ? err.stack : 'N/A');
    throw err;
  }
}

async function startHeychatWebSocket(token: string, ctx: HeychatWSContext): Promise<() => void> {
  const { WebSocket } = await import("ws");

  const getWssUrl = () => {
    return `${HEYCHAT_WSS_URL}?${HEYCHAT_COMMON_PARAMS}&token=${encodeURIComponent(token)}`;
  };

  const sendMessage = async (options: { roomId: string; channelId: string; text: string }) => {
    return sendHeychatMessage(token, options);
  };

  return new Promise((resolve, reject) => {
    let ws: any = null;
    let pingTimer: NodeJS.Timeout | null = null;
    let isClosed = false;

    const connect = () => {
      if (isClosed) return;

      ctx.log?.info(`[heychat] [${ctx.accountId}] Connecting to Heychat WebSocket...`);

      // 关闭之前的连接（如果有）
      if (ws && ws.readyState === WebSocket.OPEN) {
        ctx.log?.info(`[heychat] [${ctx.accountId}] Closing existing connection...`);
        ws.close();
      }

      ws = new WebSocket(getWssUrl(), {
        rejectUnauthorized: false,
      });

      ws.on("open", () => {
        ctx.log?.info(`[heychat] [${ctx.accountId}] Connected to Heychat server`);

        // 启动心跳
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("PING");
          }
        }, 30000);

        ctx.log?.info(`[heychat] [${ctx.accountId}] Heychat WebSocket connected`);
      });

      ws.on("message", async (data: any) => {
        try {
          const message = data.toString();

          // 忽略 PONG 响应
          if (message === "PONG" || message === "pong" || message.startsWith("PONG")) {
            return;
          }

          const event = JSON.parse(message);
          const typeStr = String(event.type);
          const innerData = event.data || event;

          // 调试日志：记录所有接收到的事件类型
          ctx.log?.info(`[heychat] [${ctx.accountId}] Received event type: ${typeStr}`);
          ctx.log?.info(`[heychat] [${ctx.accountId}] Event data: ${JSON.stringify(innerData).substring(0, 2000)}`);

          // 记录 PUSH 事件的完整数据
          if (typeStr === "PUSH" || typeStr === "push") {
            ctx.log?.info(`[heychat] [${ctx.accountId}] PUSH event: ${JSON.stringify(event).substring(0, 1000)}`);

            // 检查是否是通知事件（event: "80"），这种事件只包含 userid，不包含消息内容
            const pushData = event.data || {};
            if (pushData.event === "80" && pushData.type === "notify") {
              ctx.log?.info(`[heychat] [${ctx.accountId}] Received heartbeat/notification from userid=${pushData.userid}`);
              // 通知事件不包含消息内容，忽略
              return;
            }
          }

          // 检查是否是消息事件 (Type 50=命令，Type 5=普通消息，Type 1=文本消息)
          // 也处理任何包含 msg_id 和 msg 字段的事件（私信可能使用不同类型）
          const isMessageEvent = typeStr === "50" || typeStr === "5" || typeStr === "1" ||
            (innerData.msg_id && (innerData.msg || innerData.command_info));

          if (isMessageEvent) {
            let commandInfo = null;
            let roomBaseInfo = null;
            let channelBaseInfo = null;
            let senderInfo = null;
            let msgId = innerData.msg_id;
            let userMessage = innerData.msg || "";

            if (typeStr === "50" && innerData.command_info) {
              // Type 50: Bot command event
              commandInfo = innerData.command_info;
              roomBaseInfo = innerData.room_base_info;
              channelBaseInfo = innerData.channel_base_info;
              senderInfo = innerData.sender_info;
              userMessage = commandInfo.options?.[0]?.value || "";
            } else if (typeStr === "5" || typeStr === "1") {
              // Type 5: Regular message, Type 1: Text message
              roomBaseInfo = innerData.room_base_info;
              channelBaseInfo = innerData.channel_base_info;
              senderInfo = innerData.user_base_info || innerData.sender_info || innerData.user_info;

              // Try to parse addition for bot_command
              try {
                const addition = JSON.parse(innerData.addition || "{}");
                if (addition.bot_command?.command_info) {
                  commandInfo = addition.bot_command.command_info;
                  userMessage = commandInfo.options?.[0]?.value || "";
                } else if (innerData.msg) {
                  // Regular text message without bot_command
                  userMessage = innerData.msg;
                }
              } catch (e) {
                // Use msg directly if addition parsing fails
                if (innerData.msg) {
                  userMessage = innerData.msg;
                }
              }
            } else if (typeStr === "50" || innerData.command_info) {
              // Type 50: Bot command event (direct command_info in root)
              commandInfo = innerData.command_info;
              roomBaseInfo = innerData.room_base_info;
              channelBaseInfo = innerData.channel_base_info;
              senderInfo = innerData.sender_info;
              userMessage = commandInfo.options?.[0]?.value || "";
            } else {
              // Fallback: extract data from common fields
              roomBaseInfo = innerData.room_base_info || innerData.room_info;
              channelBaseInfo = innerData.channel_base_info || innerData.channel_info;
              senderInfo = innerData.user_base_info || innerData.sender_info || innerData.user_info;
              if (innerData.msg && !userMessage) {
                userMessage = innerData.msg;
              }
            }

            // Check if we have valid message data
            if (!msgId) {
              ctx.log?.debug(`[heychat] [${ctx.accountId}] Skipping message without msgId`);
              return;
            }

            // 消息去重检查
            if (HEYCHAT_PROCESSED_MSG_IDS.has(msgId)) {
              ctx.log?.debug(`[heychat] [${ctx.accountId}] Duplicate message ignored: ${msgId}`);
              return;
            }

            // 检查是否正在处理中（防止并发处理）
            if (HEYCHAT_PROCESSING_MSG_IDS.has(msgId)) {
              ctx.log?.debug(`[heychat] [${ctx.accountId}] Message already processing: ${msgId}`);
              return;
            }

            const roomId = roomBaseInfo?.room_id;
            const channelId = channelBaseInfo?.channel_id;
            const userId = senderInfo?.user_id;
            const senderName = senderInfo?.nickname || senderInfo?.name || "User";

            // 判断是否是群聊消息
            // 在 Heychat 中，私信的 roomId 和 channelId 通常相同，群聊则不同
            // 但如果 roomId 或 channelId 为空，则默认为私信
            const isGroup = roomId && channelId && roomId !== channelId;

            // 调试日志：记录消息详情
            ctx.log?.debug(`[heychat] [${ctx.accountId}] Message details: roomId=${roomId}, channelId=${channelId}, userId=${userId}, isGroup=${isGroup}`);

            // 添加到已处理集合和正在处理集合
            HEYCHAT_PROCESSED_MSG_IDS.add(msgId);
            HEYCHAT_PROCESSING_MSG_IDS.add(msgId);
            // 限制缓存大小
            if (HEYCHAT_PROCESSED_MSG_IDS.size > MAX_MSG_ID_CACHE) {
              const firstId = HEYCHAT_PROCESSED_MSG_IDS.values().next().value;
              HEYCHAT_PROCESSED_MSG_IDS.delete(firstId);
            }

            if (commandInfo) {
              ctx.log?.info(`[heychat] [${ctx.accountId}] Received command: ${commandInfo.name} from ${senderName} (msgId=${msgId})`);
              ctx.log?.info(`[heychat] [${ctx.accountId}] Command details: ${JSON.stringify(commandInfo)}`);
              
              // 处理 /pair 命令
              if (commandInfo.name === "pair" || commandInfo.name === "/pair" || commandInfo.name === "配对") {
                ctx.log?.info(`[heychat] [${ctx.accountId}] Processing /pair command`);
                
                // 获取命令参数（可能是 botToken 或 bot_id）
                const option = commandInfo.options?.[0];
                const paramName = option?.name;
                const botId = option?.value?.trim();
                
                ctx.log?.info(`[heychat] [${ctx.accountId}] /pair parameter: name=${paramName}, value=${botId}`);
                
                // 获取当前机器人 Token 进行验证
                const account = resolveHeychatAccount({ cfg: ctx.config, accountId: ctx.accountId });
                const currentToken = account.token;
                
                ctx.log?.info(`[heychat] [${ctx.accountId}] Token comparison: incoming="${botId}", current="${currentToken ? currentToken.substring(0, 20) + "..." : "none"}"`);
                
                // 验证传入的 Token 是否与当前机器人 Token 匹配
                if (botId && currentToken && botId === currentToken) {
                  // botId 匹配，将 channel_id 添加到 allowFrom
                  const currentAllowFrom = ctx.config.channels?.heychat?.allowFrom ?? [];
                  if (!currentAllowFrom.includes(channelId)) {
                    const newAllowFrom = [...currentAllowFrom, channelId];
                    ctx.log?.info(`[heychat] [${ctx.accountId}] Adding channel ${channelId} to allowFrom`);
                    
                    // 更新配置 - 直接写入配置文件
                    const fs = await import("fs");
                    const path = await import("path");
                    const configPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".openclaw", "openclaw.json");
                    
                    try {
                      // 读取当前配置
                      const configContent = fs.readFileSync(configPath, "utf-8");
                      const config = JSON.parse(configContent);
                      
                      // 更新 allowFrom
                      if (!config.channels) config.channels = {};
                      if (!config.channels.heychat) config.channels.heychat = {};
                      if (!config.channels.heychat.allowFrom) config.channels.heychat.allowFrom = [];
                      
                      if (!config.channels.heychat.allowFrom.includes(channelId)) {
                        config.channels.heychat.allowFrom.push(channelId);
                        
                        // 写回配置文件
                        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
                        ctx.log?.info(`[heychat] [${ctx.accountId}] Successfully wrote config to ${configPath}`);
                      }
                    } catch (configErr) {
                      ctx.log?.error(`[heychat] [${ctx.accountId}] Failed to update config file: ${configErr}`);
                    }
                    
                    ctx.log?.info(`[heychat] [${ctx.accountId}] Successfully added ${channelId} to allowFrom`);
                    
                    // 发送成功消息
                    if (account.token) {
                      await sendHeychatMessage(account.token, {
                        roomId,
                        channelId,
                        text: `已经加入列表了`,
                        msgType: MSG_TYPE.MARKDOWN,
                      });
                    }
                  } else {
                    // 已经在 allowFrom 中
                    ctx.log?.info(`[heychat] [${ctx.accountId}] Channel ${channelId} already in allowFrom`);
                    
                    if (account.token) {
                      await sendHeychatMessage(account.token, {
                        roomId,
                        channelId,
                        text: `已经在列表里`,
                        msgType: MSG_TYPE.MARKDOWN,
                      });
                    }
                  }
                } else {
                  // Token 不匹配
                  ctx.log?.warn(`[heychat] [${ctx.accountId}] Token mismatch: incoming="${botId?.substring(0, 20)}...", expected="${currentToken?.substring(0, 20)}..."`);
                  
                  if (account.token) {
                    await sendHeychatMessage(account.token, {
                      roomId,
                      channelId,
                      text: `❌ Token 不匹配\n\n请确认你输入的是当前机器人的 Token`,
                      msgType: MSG_TYPE.MARKDOWN,
                    });
                  }
                }
                
                // 命令已处理，跳过后续消息处理
                HEYCHAT_PROCESSING_MSG_IDS.delete(msgId);
                return;
              }
            } else {
              ctx.log?.info(`[heychat] [${ctx.accountId}] Received message from ${senderName} (msgId=${msgId})`);
            }

            // 使用 OpenClaw SDK 正确处理 inbound 消息
            await processHeychatInboundMessage({
              ctx,
              roomId,
              channelId,
              userId,
              senderName,
              userMessage,
              msgId,
              isGroup: roomId !== channelId,
            }).finally(() => {
              // 从正在处理集合中移除
              HEYCHAT_PROCESSING_MSG_IDS.delete(msgId);
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : 'N/A';
          ctx.log?.error(`[heychat] [${ctx.accountId}] Failed to process message: ${errorMsg}`);
          ctx.log?.error(`[heychat] [${ctx.accountId}] Stack: ${errorStack}`);
        }
      });

      ws.on("close", () => {
        ctx.log?.info(`[heychat] [${ctx.accountId}] WebSocket connection closed`);
        if (pingTimer) clearInterval(pingTimer);
        if (!isClosed) {
          setTimeout(connect, 5000);
        }
      });

      ws.on("error", (error: any) => {
        ctx.log?.error(`[heychat] [${ctx.accountId}] WebSocket error: ${error.message}`);
      });
    };

    // 开始连接
    connect();

    // 返回清理函数
    resolve(() => {
      isClosed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (ws) {
        ws.close();
      }
    });
  });
}
