import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { resolveHeychatAccount } from "./accounts.js";

export type HeychatReaction = {
  reactionId: string;
  emoji: string;
  userId: string;
};

/**
 * Add a reaction (emoji) to a message.
 * @param emoji - Heychat emoji format, e.g., "[7_👀]" or "[custom3348654035061186560_学习]"
 */
export async function addReactionHeychat(params: {
  cfg: ClawdbotConfig;
  roomId: string;
  channelId: string;
  msgId: string;
  emoji: string;
  accountId?: string;
}): Promise<{ reactionId: string }> {
  const { cfg, roomId, channelId, msgId, emoji, accountId } = params;
  const account = resolveHeychatAccount({ cfg, accountId });
  
  if (!account.token) {
    throw new Error("Heychat token not configured");
  }

  const url = "https://chat.xiaoheihe.cn/chatroom/v2/channel_msg/emoji/reply?client_type=heybox_chat&x_client_type=web&os_type=web&x_os_type=bot&x_app=heybox_chat&chat_os_type=bot&chat_version=1.30.0";

  const body = {
    msg_id: msgId,
    emoji: emoji,
    is_add: 1,
    channel_id: channelId,
    room_id: roomId,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": account.token,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.status !== "ok") {
      throw new Error(`Heychat add reaction failed: ${result.msg || `status ${result.status}`}`);
    }

    // Heychat doesn't return reaction_id, use msgId + emoji as identifier
    return { reactionId: `${msgId}:${emoji}` };
  } catch (error) {
    throw new Error(`Heychat add reaction failed: ${error}`);
  }
}

/**
 * Remove a reaction from a message.
 */
export async function removeReactionHeychat(params: {
  cfg: ClawdbotConfig;
  roomId: string;
  channelId: string;
  msgId: string;
  emoji: string;
  accountId?: string;
}): Promise<void> {
  const { cfg, roomId, channelId, msgId, emoji, accountId } = params;
  const account = resolveHeychatAccount({ cfg, accountId });
  
  if (!account.token) {
    throw new Error("Heychat token not configured");
  }

  const url = "https://chat.xiaoheihe.cn/chatroom/v2/channel_msg/emoji/reply?client_type=heybox_chat&x_client_type=web&os_type=web&x_os_type=bot&x_app=heybox_chat&chat_os_type=bot&chat_version=1.30.0";

  const body = {
    msg_id: msgId,
    emoji: emoji,
    is_add: 0,
    channel_id: channelId,
    room_id: roomId,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": account.token,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.status !== "ok") {
      throw new Error(`Heychat remove reaction failed: ${result.msg || `status ${result.status}`}`);
    }
  } catch (error) {
    // Silently fail - removing reaction is not critical
    console.log(`[heychat] failed to remove reaction: ${error}`);
  }
}

/**
 * Common Heychat emoji formats for convenience.
 */
export const HeychatEmoji = {
  // Official emojis
  EYES: "[7_👀]",
  THUMBSUP: "[7_👍]",
  HEART: "[7_❤]",
  LAUGH: "[7_😂]",
  SURPRISED: "[7_😮]",
  SAD: "[7_😢]",
  ANGRY: "[7_😠]",
  
  // Typing indicator (if available)
  TYPING: "[7_⏳]",
};
