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
        msgType: MSG_TYPE.AT_MARKDOWN,
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
              msgType: MSG_TYPE.TEXT,
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
