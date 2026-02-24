# OpenClaw Heychat Plugin

[Heychat](https://www.xiaoheihe.cn/) (黑盒语音) channel plugin for [OpenClaw](https://github.com/openclaw-ai/openclaw) - 集成 AI 聊天功能。

## 功能特性

- ✅ 支持私信和群组消息
- ✅ 多账户配置
- ✅ 群组策略控制（开放/白名单/阻止）
- ✅ 消息去重
- ✅ WebSocket 自动重连
- ✅ 与 OpenClaw AI 聊天集成

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

## 获取 Heychat Token

1. 打开黑盒语音 APP
2. 进入设置 -> 开发者选项
3. 创建机器人应用
4. 复制 App Token

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

### 方式三：环境变量

```bash
export HEYCHAT_APP_TOKEN="YOUR_HEYCHAT_APP_TOKEN"
openclaw
```

## 配置项说明

### 基础配置

| 配置项 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `enabled` | boolean | 否 | 是否启用此账户 | `true` |
| `token` | string | 是 | Heychat 机器人 Token | `"OTU3Mzg4..."` |
| `tokenFile` | string | 否 | Token 文件路径 | `"~/.heychat/token"` |
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
    "4052815029845475328": {
      "requireMention": false  // 特定群组不需要 @
    }
  }
}
```

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

## 使用示例

### 配对私信用户

```bash
# 1. 在配置中添加用户到 allowFrom
# 2. 用户发送消息触发配对
# 3. 配对成功后可正常对话
```

### 群组中使用

在群组中，默认需要 @机器人 才能触发回复：

```
@机器人 今天天气怎么样？
```

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

## 开发

```bash
# 克隆仓库
git clone https://github.com/DefinerSy/openclaw-heychat.git

# 安装依赖
cd openclaw-heychat
npm install

# 修改代码后重启 OpenClaw
```

## 项目结构

```
openclaw-heychat/
├── index.ts              # 插件入口
├── package.json          # 依赖配置
├── LICENSE               # MIT License
├── README.md             # 说明文档
└── src/
    ├── channel.ts        # 频道主逻辑
    ├── accounts.ts       # 账户解析
    ├── config-schema.ts  # 配置 Schema
    ├── policy.ts         # 群组策略
    ├── types.ts          # 类型定义
    └── runtime.ts        # 运行时
```

## 许可证

MIT License

## 致谢

- [OpenClaw](https://github.com/openclaw-ai/openclaw) - 基础框架
- [Heychat](https://www.xiaoheihe.cn/) - 黑盒语音平台

## 相关链接

- [GitHub 仓库](https://github.com/DefinerSy/openclaw-heychat)
- [OpenClaw 文档](https://docs.openclaw.ai/)
- [问题反馈](https://github.com/DefinerSy/openclaw-heychat/issues)
