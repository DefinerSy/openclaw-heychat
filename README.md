# Heychat (黑盒语音) OpenClaw 插件

[Heychat](https://www.xiaoheihe.cn/) (黑盒语音) channel plugin for [OpenClaw](https://github.com/openclaw-ai/openclaw)

---

## 概述

本插件支持 OpenClaw 与 Heychat (黑盒语音) 平台集成，支持消息收发、卡片消息、表情反应、群组管理等功能。

---

## 功能特性

- ✅ 支持私信和群组消息
- ✅ 多账户配置
- ✅ 群组策略控制（开放/白名单/阻止）
- ✅ 消息去重
- ✅ WebSocket 自动重连
- ✅ 与 OpenClaw AI 聊天集成
- ✅ 卡片消息支持
- ✅ 自动表情反应
- ✅ Room-Channel 自动映射缓存

---

## 安装

### 前提条件

1. 已安装 [OpenClaw](https://github.com/openclaw-ai/openclaw)
2. 已获取 Heychat App Token

### 安装步骤

```bash
# 克隆插件到 OpenClaw 扩展目录
git clone https://github.com/DefinerSy/openclaw-heychat.git ~/.openclaw/extensions/heychat

# 或者安装到全局 node_modules
cd ~/.openclaw/extensions/heychat
npm install
```

---

## 获取 Heychat Token

1. 打开黑盒语音 APP
2. 进入设置 -> 开发者选项
3. 创建机器人应用
4. 复制 App Token（格式如：`YOUR_TOKEN_HERE`）

---

## 配置

### 方式一：通过 UI 面板配置（推荐）

1. 启动 OpenClaw：`openclaw`
2. 打开浏览器访问：http://127.0.0.1:18789
3. 进入 **Channels** -> **Heychat**
4. 填写 Token 和其他配置

### 方式二：编辑配置文件

编辑 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "heychat": {
      "enabled": true,
      "token": "YOUR_HEYCHAT_APP_TOKEN",
      "dmPolicy": "pairing",
      "groupPolicy": "allowlist",
      "allowFrom": ["群组 ID 1", "群组 ID 2"],
      "groups": {
        "*": {
          "requireMention": true
        }
      }
    }
  }
}
```

### 方式三：环境变量（推荐用于生产环境）

**临时设置（当前终端会话）：**
```bash
export HEYCHAT_APP_TOKEN="YOUR_HEYCHAT_APP_TOKEN"
openclaw
```

**永久设置（添加到 shell 配置文件）：**

~/.bashrc、~/.zshrc 或 ~/.profile：
```bash
export HEYCHAT_APP_TOKEN="YOUR_HEYCHAT_APP_TOKEN"
```

**使用 .env 文件：**
```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件，填入你的 Token
nano .env
```

> **Token 优先级**：环境变量 > openclaw.json 配置 > tokenFile 文件

---

## 🔐 安全最佳实践

### Token 存储方式对比

| 方式 | 安全性 | 适用场景 |
|------|--------|----------|
| **环境变量** | ⭐⭐⭐⭐⭐ | 生产环境、服务器部署 |
| **Token 文件** | ⭐⭐⭐⭐ | 本地开发、多账户管理 |
| **openclaw.json** | ⭐⭐⭐ | 快速测试、个人使用 |

### 推荐做法

1. **生产环境**：使用环境变量
   ```bash
   # /etc/environment 或 systemd 服务配置
   HEYCHAT_APP_TOKEN=your_token_here
   ```

2. **本地开发**：使用 .env 文件（不要提交到 Git）
   ```bash
   # .env 文件已添加到 .gitignore
   HEYCHAT_APP_TOKEN=your_token_here
   ```

3. **Token 文件权限**：
   ```bash
   # 设置文件仅所有者可读写
   chmod 600 ~/.secrets/heychat_token
   ```

4. **不要提交敏感信息**：
   - ✅ `.env.example` - 可以提交（包含占位符）
   - ❌ `.env` - 不要提交（包含真实 Token）
   - ❌ `openclaw.json` - 不要提交（如果包含 Token）

---

## 配置项说明

### 基础配置

| 配置项 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `enabled` | boolean | 否 | 是否启用此账户 | `true` |
| `token` | string | 是* | Heychat 机器人 Token | `"YOUR_TOKEN_HERE"` |
| `tokenFile` | string | 是* | Token 文件路径 | `"~/.secrets/heychat_token"` |

\* `token` 和 `tokenFile` 二选一，或者使用环境变量 `HEYCHAT_APP_TOKEN`
| `name` | string | 否 | 账户显示名称 | `"我的黑盒助手"` |

### 私信策略 (dmPolicy)

| 值 | 说明 |
|-----|------|
| `pairing` | 配对模式 - 需要用户先配对才能对话（默认） |
| `open` | 开放模式 - 任何用户都可以直接对话 |
| `allowlist` | 白名单模式 - 只有 allowFrom 列表中的用户可以对话 |

### 群组策略 (groupPolicy)

| 值 | 说明 |
|-----|------|
| `open` | 开放模式 - 任何群组成员都可以触发机器人 |
| `allowlist` | 白名单模式 - 只有 allowFrom 列表中的群组可以对话 |
| `disabled` | 阻止模式 - 禁止所有群组对话 |

### 白名单 (allowFrom)

数组类型，允许对话的用户/群组 ID 列表。

### 群组配置 (groups)

针对特定群组的精细控制：

```json
{
  "groups": {
    "*": {
      "requireMention": true  // 所有群组需要 @机器人 才能触发
    },
    "YOUR_CHANNEL_ID": {
      "requireMention": false  // 特定群组不需要 @
    }
  }
}
```

---

## 多账户配置

支持配置多个 Heychat 账户：

```json
{
  "channels": {
    "heychat": {
      "enabled": true,
      "token": "default-token",
      "accounts": {
        "客服 1 号": {
          "name": "客服账号 1",
          "token": "token-xxx-1",
          "enabled": true,
          "dmPolicy": "pairing",
          "groupPolicy": "allowlist",
          "allowFrom": ["group-id-1"]
        },
        "客服 2 号": {
          "name": "客服账号 2",
          "token": "token-xxx-2",
          "enabled": false
        }
      }
    }
  }
}
```

---

## /pair 配对指令

### 功能说明

`/pair` 指令用于**将当前群组添加到机器人的允许列表 (allowFrom)**，使机器人可以在该群组中收发消息。

### 使用方法

在 Heychat 群组中直接发送 `/pair` 命令：

```
/pair <机器人 Token>
```

**示例：**
```
/pair YOUR_BOT_TOKEN_HERE
```

### 工作流程

1. **用户在群组中发送 `/pair <Token>`**
2. **插件验证 Token**：
   - 比较传入的 Token 与当前机器人的 Token 是否匹配
   - ✅ 匹配 → 将当前群组的 `channel_id` 添加到 `allowFrom` 列表
   - ❌ 不匹配 → 返回错误提示
3. **自动更新配置**：
   - 读取 `~/.openclaw/openclaw.json`
   - 将当前 `channel_id` 添加到 `channels.heychat.allowFrom` 数组
   - 写回配置文件
4. **发送确认消息**：
   - ✅ 成功：`✅ 配对成功！已在允许列表中`
   - ❌ 失败：`❌ Token 不匹配，请确认你输入的是当前机器人的 Token`

### 验证逻辑

```typescript
// 获取当前机器人 Token
const currentToken = account.token;

// 验证传入的 Token 是否匹配
if (botId && currentToken && botId === currentToken) {
  // Token 匹配，添加 channel_id 到 allowFrom
  config.channels.heychat.allowFrom.push(channelId);
}
```

### 注意事项

- ⚠️ **Token 验证**：必须输入当前机器人的 Token，而不是用户 ID
- ⚠️ **配置重载**：修改配置后需要重启 Gateway 才能生效
  ```bash
  openclaw gateway restart
  ```
- ⚠️ **权限要求**：只有机器人管理员才能执行配对操作

---

## 核心概念

### Room 与 Channel 的关系

Heychat 采用 **Room-Channel** 两级结构：

```
Room (房间)
├── Channel 1 (频道/群组 1)
├── Channel 2 (频道/群组 2)
└── Channel 3 (频道/群组 3)
```

- **room_id**: 房间 ID，一个房间可以包含多个频道
- **channel_id**: 频道 ID，每个频道有独立的 ID
- **关系**: 多个 channel 共享同一个 room_id

### 示例

你的房间：
- **room_id**: `YOUR_ROOM_ID`
- **channel_id** (群组 1): `YOUR_CHANNEL_ID_1`
- **channel_id** (群组 2): `YOUR_CHANNEL_ID_2`

---

## 自动 Room-Channel 映射

### WebSocket 自动缓存

插件会在收到 WebSocket 消息时**自动缓存** room_id 和 channel_id 的映射关系：

```typescript
// 收到消息时自动缓存
{
  room_id: "YOUR_ROOM_ID",
  channel_id: "YOUR_CHANNEL_ID"
}
// → 缓存到内存：roomToChannelMap.set(room_id, channel_id)
```

### 发送消息时自动查找

发送消息时，插件会自动根据缓存查找对应的 ID：

```typescript
// 只提供 channel_id → 自动查找 room_id
await sendText({ to: "YOUR_CHANNEL_ID", text: "你好" });
// → 自动查找 room_id: "YOUR_ROOM_ID"

// 只提供 room_id → 自动查找 channel_id
await sendText({ to: "YOUR_ROOM_ID", text: "你好" });
// → 自动查找 channel_id: "YOUR_CHANNEL_ID" (第一个缓存的)

// 提供完整格式 → 直接使用
await sendText({ to: "YOUR_ROOM_ID:YOUR_CHANNEL_ID", text: "你好" });
// → room_id: "YOUR_ROOM_ID", channel_id: "YOUR_CHANNEL_ID"
```

---

## 使用方法

### 发送文本消息

```typescript
import { heychatPlugin } from './heychat';

// 简单用法 - 只提供 channel_id (推荐)
await heychatPlugin.outbound.sendText({
  to: "YOUR_CHANNEL_ID",
  text: "你好，这是一条消息",
  cfg: config
});

// 提供完整格式
await heychatPlugin.outbound.sendText({
  to: "YOUR_ROOM_ID:YOUR_CHANNEL_ID",
  text: "你好",
  cfg: config
});
```

### 发送卡片消息

```typescript
import { HeychatCardBuilder, heychatPlugin } from './heychat';

// 使用 Builder 构建卡片
const card = HeychatCardBuilder.createCard([
  HeychatCardBuilder.header("🤖 标题"),
  HeychatCardBuilder.markdown("**粗体文本**\n*斜体文本*"),
  HeychatCardBuilder.plainText("纯文本段落"),
  HeychatCardBuilder.buttonGroup([
    { text: "B 站", url: "https://bilibili.com", theme: "default" },
    { text: "GitHub", url: "https://github.com", theme: "success" }
  ])
]);

// 发送卡片
await heychatPlugin.outbound.sendCard({
  to: "YOUR_CHANNEL_ID",  // 只需 channel_id
  cardData: card,
  cfg: config
});
```

---

## 表情反应功能

### 自动反应流程

插件实现了**自动表情反应**功能：

```
收到消息 → 添加表情 → 开始处理 → 发送回复 → 取消表情
```

### 配置表情

**位置：** `~/.openclaw/openclaw.json`

```json
{
  "channels": {
    "heychat": {
      "reactions": {
        "enabled": true,
        "processing": "[7_👀]"
      }
    }
  }
}
```

**配置项说明：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `reactions.enabled` | boolean | `true` | 是否启用表情反应功能 |
| `reactions.processing` | string | `[7_👀]` | 处理中表情（收到消息时添加，回复后取消） |

**禁用表情反应：**
```json
{
  "channels": {
    "heychat": {
      "reactions": {
        "enabled": false
      }
    }
  }
}
```

### 可用表情

**官方表情格式：** `[7_表情符号]`

| 表情 | 代码 | 适用场景 |
|------|------|----------|
| 👀 | `[7_👀]` | 处理中（默认） |
| 👍 | `[7_👍]` | 点赞 |
| ❤ | `[7_❤]` | 爱心 |
| 😂 | `[7_😂]` | 大笑 |
| 😮 | `[7_😮]` | 惊讶 |
| 😢 | `[7_😢]` | 伤心 |
| 😠 | `[7_😠]` | 生气 |
| ⏳ | `[7_⏳]` | 等待中 |
| ✅ | `[7_✅]` | 成功 |
| ❌ | `[7_❌]` | 失败 |

**自定义表情格式：** `[custom{ID}_{名称}]`

```json
{
  "reactions": {
    "processing": "[custom3348654035061186560_学习]"
  }
}
```

> 💡 **提示**：查看可用表情请参考 [房间表情包文档](https://s.apifox.cn/43256fe4-9a8c-4f22-949a-74a3f8b431f5/5252750m0)

---

## 卡片消息格式

### 完整 JSON 结构

```json
{
  "data": [{
    "type": "card",
    "border_color": "#4A90D9",
    "size": "medium",
    "modules": [
      {
        "type": "header",
        "content": {
          "type": "plain-text",
          "text": "标题"
        }
      },
      {
        "type": "section",
        "paragraph": [{
          "type": "markdown",
          "text": "**粗体** *斜体*"
        }]
      },
      {
        "type": "images",
        "urls": [{
          "url": "https://example.com/image.jpg"
        }]
      },
      {
        "type": "button-group",
        "btns": [{
          "type": "button",
          "event": "link-to",
          "value": "https://example.com",
          "text": "按钮文本",
          "theme": "default"
        }]
      }
    ]
  }]
}
```

### 支持的模块类型

| 模块类型 | 说明 | 示例 |
|----------|------|------|
| `header` | 标题 | 显示卡片标题 |
| `section` + `plain-text` | 纯文本段落 | 普通文本内容 |
| `section` + `markdown` | Markdown 文本 | 支持**粗体**、*斜体* |
| `section` + `image` | 单图 | 显示一张图片 |
| `images` | 多图网格 | 显示多张图片 |
| `button-group` + `button` | 按钮组 | 可点击的按钮 |

### 按钮主题

- `default` - 默认样式
- `success` - 绿色主题
- `primary` - 蓝色主题
- `danger` - 红色主题

---

## HeychatCardBuilder API

### 方法

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `createCard(modules)` | `CardModule[]` | `CardData` | 创建卡片 |
| `header(text)` | `string` | `CardModule` | 标题模块 |
| `plainText(text)` | `string` | `CardModule` | 纯文本模块 |
| `markdown(text)` | `string` | `CardModule` | Markdown 模块 |
| `singleImage(url)` | `string` | `CardModule` | 单图模块 |
| `imageGrid(urls)` | `string[]` | `CardModule` | 多图网格 |
| `button(text, url, theme?)` | `string, string, string` | `Button` | 创建按钮 |
| `buttonGroup(buttons)` | `Button[]` | `CardModule` | 按钮组模块 |

### 使用示例

```typescript
const card = HeychatCardBuilder.createCard([
  HeychatCardBuilder.header("🎮 游戏通知"),
  HeychatCardBuilder.markdown("**《致命多巴胺》** 已上线！\n\n快来体验吧~"),
  HeychatCardBuilder.singleImage("https://example.com/cover.jpg"),
  HeychatCardBuilder.buttonGroup([
    HeychatCardBuilder.button("Steam 商店", "https://store.steampowered.com/...", "primary"),
    HeychatCardBuilder.button("B 站视频", "https://bilibili.com/...", "default")
  ])
]);
```

---

## API 端点

### 发送消息

```
POST https://chat.xiaoheihe.cn/chatroom/v2/channel_msg/send
```

### 请求参数

```json
{
  "heychat_ack_id": "YOUR_ACK_ID",
  "msg_type": 20,  // 卡片消息 / 4: 普通消息
  "msg": "{\"data\":[...]}",  // 卡片 JSON 字符串
  "channel_id": "YOUR_CHANNEL_ID",
  "room_id": "YOUR_ROOM_ID",
  "reply_id": ""
}
```

### 响应

```json
{
  "msg": "",
  "result": {
    "chatmobile_ack_id": "",
    "heychat_ack_id": "0",
    "msg_id": "2026607597894049792",
    "msg_seq": "2026607597894049792"
  },
  "status": "ok"
}
```

---

## 故障排除

### Token 无效

- 确认 Token 格式正确（Base64 编码）
- 确认 Token 未过期
- 检查环境变量 `HEYCHAT_APP_TOKEN` 是否覆盖配置

### 群组消息无响应

- 检查 `groupPolicy` 配置
- 如果在白名单模式，确认群组 ID 在 `allowFrom` 中
- 检查是否需要 @机器人

### WebSocket 频繁断连

- 检查网络连接
- 确认 Token 有效
- 查看 OpenClaw 日志：`openclaw logs --follow`

### 私信消息无响应

**问题描述**：直接发送私信消息时，机器人没有响应。

**原因**：Heychat 平台的 WebSocket 只推送通知事件（event: "80"），不包含实际的消息内容。私信消息需要使用 `/chat` 命令触发才会通过 WebSocket 推送。

**解决方案**：

1. **使用 `/chat` 命令发送私信**（推荐）：
   ```
   /chat 你好，这是一条测试消息
   ```

2. **确认配置正确**：
   - `dmPolicy` 设置为 `open`（开放模式）或 `pairing`（配对模式）
   - 如果使用 `allowlist` 模式，确保用户 ID 在 `allowFrom` 列表中

3. **查看日志确认事件**：
   ```bash
   openclaw logs --follow
   ```
   正常收到消息时应该看到 `Type 5` 或 `Type 50` 事件。

**技术说明**：
- Heychat WebSocket 推送的事件类型：
  - `event: "80", type: "notify"` - 心跳/状态通知，仅包含机器人 ID，无消息内容
  - `type: "50"` - Bot 命令事件（如 `/chat` 命令）
  - `type: "5"` - 普通消息事件
- 只有 Type 5 和 Type 50 事件才包含实际消息内容

### Q: 提示"请加入房间后再发送消息"

**原因**: 
- room_id 或 channel_id 不正确
- Bot 未被添加到该房间

**解决**:
1. 确认 room_id 和 channel_id 正确
2. 确保 Bot 已加入房间
3. 使用完整格式 `room_id:channel_id`

### Q: 提示"包含违禁词"

**原因**: 内容触发言论审核

**解决**:
- 简化内容，避免敏感词
- 使用纯文本代替 Markdown

### Q: 如何获取 room_id 和 channel_id？

**方法**:
1. 在群里发一条消息，插件会自动缓存
2. 查看 WebSocket 消息日志
3. 使用 Heychat 开发者工具查看

---

## 项目结构

```
heychat/
├── index.ts              # 插件入口
├── package.json          # 依赖配置
├── README.md             # 本文档
├── src/
│   ├── channel.ts        # 频道主逻辑
│   ├── accounts.ts       # 账户解析
│   ├── config-schema.ts  # 配置 Schema
│   ├── policy.ts         # 群组策略
│   ├── reactions.ts      # 表情反应管理模块
│   ├── types.ts          # 类型定义
│   └── runtime.ts        # 运行时
```

---

## 开发

```bash
# 克隆仓库
git clone https://github.com/DefinerSy/openclaw-heychat.git

# 安装依赖
cd openclaw-heychat
npm install

# 修改代码后重启 OpenClaw
openclaw gateway restart
```

---

## 更新日志

### 2026-02-25
- ✅ 添加卡片消息支持 (`msg_type: 20`)
- ✅ 添加 `HeychatCardBuilder` 辅助类
- ✅ 实现 Room-Channel 自动映射缓存
- ✅ 支持自动查找 room_id/channel_id
- ✅ 添加 `sendCard` 方法
- ✅ 添加表情反应功能（参考飞书插件实现）
- ✅ 实现自动添加/删除表情反应流程
- ✅ 创建 `reactions.ts` 独立模块
- ✅ 提供常用表情常量 `HeychatEmoji`
- ✅ 添加 `/pair` 配对指令支持（Token 验证）

---

## 许可证

MIT License

---

## 开发者

- **插件**: OpenClaw Heychat Extension
- **文档版本**: 1.0.0
- **最后更新**: 2026-02-25

---

## 相关链接

- [GitHub 仓库](https://github.com/DefinerSy/openclaw-heychat)
- [OpenClaw 文档](https://docs.openclaw.ai/)
- [Heychat 开发者平台](https://bot.xiaoheihe.cn)
- [问题反馈](https://github.com/DefinerSy/openclaw-heychat/issues)
