# 私有 Claude 多用户聊天站 —— 完整产品说明

## 项目概述
用 Next.js（App Router）+ PostgreSQL + Prisma 搭建一个私有的多用户 Web 聊天站，供你的朋友体验 Claude。生图和联网搜索能力均已集成。外观参考简洁浅色双栏 UI（左侧会话列表 + 右侧对话区）。

---

## 一、技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端 | Next.js 15 App Router、TypeScript、Tailwind CSS、shadcn/ui |
| 后端 | Next.js API Routes（所有上游调用均经服务端代理，浏览器不接触任何 sk-） |
| 数据库 | PostgreSQL + Prisma ORM |
| 鉴权 | NextAuth.js（Credentials Provider），bcrypt 密码哈希 |
| 部署 | Docker Compose（app + db）；生产强制 HTTPS + 域名（Nginx / Caddy） |

---

## 二、环境变量（.env.example）

```env
# ════════════════════════════════════════════════════════
# 上游 API Key（仅服务端持有，不暴露给前端）
# ════════════════════════════════════════════════════════

# ── Claude 对话（OpenAI 兼容网关）────────────────────────
CLAUDE_BASE_URL=https://api.zhangsan.cool/v1
CLAUDE_MODEL=claude-opus-4-6
CLAUDE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Gemini 生图（令牌按模型隔离，需单独一把 Key）─────────
GEMINI_BASE_URL=https://api.zhangsan.cool/v1
GEMINI_MODEL=gemini-3-pro-image-preview
GEMINI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── 联网搜索 Anspire ────────────────────────────────────
#  GET https://plugin.anspire.cn/api/ntsearch/search
#  Header: Authorization: Bearer {ANESPIRE_API_KEY}
#  参数：query（≤64中英文字符）, top_k（10/20/30/40/50，默认10）,
#        Insite（站点限流，最多20个，逗号分隔，可空）,
#        FromTime/ToTime（YYYY-MM-DD HH:MM:SS，可空）
ANESPIRE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANESPIRE_ENDPOINT=https://plugin.anspire.cn/api/ntsearch/search
# 每次成功搜索若平台按点扣费，在此配置每次消耗点数（否则填0）
SEARCH_POINTS_PER_CALL=0

# ════════════════════════════════════════════════════════
# 数据库与应用
# ════════════════════════════════════════════════════════
DATABASE_URL=postgresql://user:password@localhost:5432/chatdb

NEXTAUTH_SECRET=随机加密字符串
NEXTAUTH_URL=https://你的域名
ADMIN_USERNAME=管理员用户名
ADMIN_PASSWORD=管理员密码
```

---

## 三、数据库模型（Prisma Schema）

```prisma
model User {
  id               String   @id @default(cuid())
  username         String   @unique
  passwordHash     String
  role             String   @default("user") // "admin" | "user"
  tokenLimit       BigInt   @default(0)     // 0=无限制
  tokenUsed        BigInt   @default(0)
  searchCallCount  Int      @default(0)     // 联网搜索调用次数
  searchPointsUsed Int      @default(0)     // 若平台按点扣费，在此累加
  searchMonthlyLimit Int    @default(0)     // 每月搜索次数上限，0=无限制
  disabled         Boolean  @default(false)
  createdAt        DateTime @default(now())

  sessions   Session[]
  logs       UsageLog[]
  searchLogs SearchUsageLog[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String   @default("新对话")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages Message[]
}

model Message {
  id          String   @id @default(cuid())
  sessionId   String
  session     Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role        String   // "system" | "user" | "assistant" | "tool"
  content     String
  attachments Json?    // [{ name: string, size: number, type: string, url: string }]
  model       String?  // 本条所用模型
  tokenCount  Int?     // 本次调用消耗 token 数（若上游返回）
  createdAt   DateTime @default(now())
}

model UsageLog {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  model            String
  promptTokens     Int
  completionTokens Int
  totalTokens      Int
  createdAt        DateTime @default(now())
}

model SearchUsageLog {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  query      String   // 搜索词（可截断脱敏）
  topK       Int?
  statusCode Int?
  pointsUsed Int      @default(0)   // 本次消耗点数（若平台按点扣费）
  createdAt  DateTime @default(now())
}
```

---

## 四、用户前台功能

### 4.1 账号登录
- 用户名 + 密码（bcrypt 校验）登录后进入聊天界面。
- 未登录访问任意页面（/chat、/admin 等）一律重定向到 /login。
- 用户注册：管理员在后台创建账号并设置初始密码，用户首次登录后可自行修改。

### 4.2 会话管理
- 左侧栏展示当前用户所有会话（按最近更新时间排序）。
- 支持新建、重命名、删除会话。
- 切换会话时前端加载历史消息（仅展示，不重复请求模型）。

### 4.3 对话：两个并列模式（参考 DeepSeek）

#### 模式 A：普通对话
- 直接发消息，走 OpenAI 兼容 `/chat/completions`，模型为 `claude-opus-4-6`。
- 流式输出（打字机效果）。
- 支持 Markdown 渲染、代码高亮（highlight.js）、LaTeX 公式（KaTeX / mathjax）。

#### 模式 B：联网增强（Anspire 搜索 → Claude 总结）
- 用户发送消息后，后端自动执行以下流程：
  1. 调用 `GET https://plugin.anspire.cn/api/ntsearch/search`，参数取用户 query，其余留空走默认（top_k=10）。
  2. 将搜索结果（标题 + 摘要 + 链接）格式化为上下文片段：

     ```
     [以下为搜索结果摘要]
     1. 《标题》 — https://xxx.com
        摘要节选……
     2. 《标题2》 — https://yyy.com
        摘要节选……
     ```

  3. 将该片段作为 system prompt 的前缀，并附加以下强制约束（**不得被 user prompt 覆盖**）：

     ```
     你是一个联网增强的 AI 助手。请严格遵守以下规则：
     1. 回答必须以「以下为搜索结果摘要」开篇，逐条引用搜索内容。
     2. 若搜索结果与用户问题无关或不足，请诚实说明「搜索结果未找到相关信息」。
     3. 回答末尾必须列出参考来源，格式：[编号] 《标题》 — URL
     4. 禁止捏造搜索结果中不存在的 URL 或内容。
     ```

  4. 流式返回 Claude 的回答，并在回答底部注明参考来源链接。
- 联网模式 UI 上显示「联网搜索中…」加载态；搜索失败时提示用户并允许重试（不调用 Claude）。

### 4.4 上下文记忆
- 每个会话维护消息列表（包含 system / user / assistant / tool 等所有 role）。
- 每次请求模型时，截取**最近 10 条消息**（按列表顺序从尾往前数 10 条）。
- 固定 system prompt 不占 10 条名额（单独拼接）。

### 4.5 多文件上传
- 使用 Next.js 原生 `Request.formData()`（或 `@multipartjs/multer`）接收 Multipart。
- **单文件最大 50MB**；单次消息至少支持 **7 个文件**；格式不限（.pdf/.doc/.docx/.txt/.csv/.json/.png/.jpg/.jpeg/.gif/.webp 等）。
- **后端文件处理逻辑**（按顺序优先尝试）：
  - 若上游网关支持 OpenAI `content` 中的 file/image 对象类型 → 直接以对应结构转发。
  - 若网关不支持：
    - 文本类文件（.txt/.csv/.json/.md/.pdf/.docx 等）→ 读取为 UTF-8 文本，拼入 content 字符串前缀：`[附件：{filename}]\n{文件内容}\n[/附件]`，**截断至前 50,000 字符**（防止超出上下文上限）。
    - 图片（.png/.jpg/.jpeg/.gif/.webp）→ 转为 Base64（`data:image/{mime};base64,{b64}`）作为 `image_url` 传入。
- 校验：单个文件 > 50MB → 返回 413 + 「单文件不能超过 50MB」；文件数 > 7 → 返回 400 + 「单次最多上传 7 个文件」；不支持的 MIME 类型 → 返回 415 + 「该文件格式暂不支持」。
- 前端：图片实时预览缩略图；文档显示文件名 + 大小。

### 4.6 文生图（Gemini 模式）
- 聊天区提供独立的「文生图」入口按钮。
- 用户输入图片描述 → 后端调用 Gemini 生图接口（模型 `gemini-3-pro-image-preview`）。
- 图片返回后在前端展示（支持 base64 内嵌 `data:image/png;base64,...` 或 URL 两种格式）；提供下载按钮。
- 成功生图后记录 token 用量（若上游返回 usage）。

---

## 五、管理后台（/admin）

### 入口
- 管理员访问 /admin 登录（非管理员不可访问，跳转至 /chat 并提示无权限）。

### 功能模块
1. **用户管理**：创建用户 / 重置密码 / 启用或禁用账号 / 设置角色（admin/user）。
2. **额度管理**：
   - 对话 token 额度（`tokenLimit`）：超额用户发起对话请求时 → 403 + 「对话额度已用完」。
   - 每月联网搜索次数上限（`searchMonthlyLimit`）：超额用户发起联网请求时 → 403 + 「本月搜索次数已用完」（普通对话不受影响）。
3. **用量明细**：按用户查看历史调用记录（时间、模型、token 消耗、联网次数及估算点数）。
4. **全局概览**：总调用次数 / 总 token 消耗 / 各模型占比 / 联网调用总次数及估算点数。

---

## 六、计费与额度校验流程

### 对话（Claude / Gemini）
1. 用户发起请求 → 后端查 `User.tokenUsed` vs `User.tokenLimit`（两者均为 BigInt）。
2. 若 `tokenLimit > 0` 且 `tokenUsed >= tokenLimit` → HTTP 403，前端提示「对话额度已用完」。
3. 若通过 → 发请求给上游 → 拿到 `usage.total_tokens`。
4. 原子更新：`User.tokenUsed += totalTokens`；写入 `UsageLog`。
5. 下次请求重复校验。

### 联网搜索（Anspire）
1. 用户触发联网模式 → 后端查 `User.searchCallCount` vs `User.searchMonthlyLimit`。
2. 若 `searchMonthlyLimit > 0` 且 `searchCallCount >= searchMonthlyLimit` → 返回 403，前端提示「本月搜索次数已用完」。
3. 若通过 → 调用 Anspire 搜索 API → 成功（2xx）后：
   - `User.searchCallCount += 1`
   - 若 `SEARCH_POINTS_PER_CALL > 0`：`User.searchPointsUsed += SEARCH_POINTS_PER_CALL`
   - 写入 `SearchUsageLog`
4. 失败时不扣量，允许重试。

---

## 七、技术实施准则

### 7.1 BigInt / JSON 序列化（必做）
Prisma 模型中的 `tokenLimit`、`tokenUsed` 使用 `BigInt`，直接 `JSON.stringify` 会报错。在 `lib/prisma.ts`（或 `lib/utils.ts`）**顶部**全局注册以下代码，放在 Prisma Client 实例化之前：

```typescript
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
```

之后所有通过 API 返回用户的对象（含 tokenLimit / tokenUsed）均无需手动转换。

### 7.2 环境变量校验（启动时必检）
在 `src/lib/env.ts`（或 `app/api/.../route.ts` 顶部）中检查所有必填变量：

```typescript
const required = [
  'CLAUDE_API_KEY',
  'GEMINI_API_KEY',
  'ANESPIRE_API_KEY',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[Env] 缺少必填环境变量: ${key}`);
    process.exit(1);
  }
}
```

可选变量（`SEARCH_POINTS_PER_CALL` 等）以默认值兜底，不阻断启动。

### 7.3 流式传输（Streaming）
- **优先使用 `ai` SDK**（`vercel/ai`）处理 OpenAI 兼容流式响应，搭配 `useChat` / `useCompletion` 确保前端打字机效果稳定。
- 若上游网关（api.zhangsan.cool）对 `stream: true` 的响应格式不兼容 `ai` SDK，回退到原生 `ReadableStream` 手动转发上游 chunk。
- 无论哪种方式，流式响应头必须设置为：

  ```
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  Transfer-Encoding: chunked
  X-Accel-Buffering: no   // Nginx 反代时必须
  ```

- 非流式错误（4xx / 5xx）统一返回 JSON：`{ error: "可读错误信息" }`。

### 7.4 外部 API 错误处理（统一规范）
所有对 Claude / Gemini / Anspire 的请求必须包裹 `try-catch`，错误映射规则：

| 上游状态码 | 前端提示文案 |
|-----------|------------|
| 401 / 403 | 「API Key 无效或权限不足，请联系管理员」 |
| 429 | 「上游限流，请稍后重试」 |
| 500 / 502 / 503 | 「上游服务异常，请稍后重试」 |
| 网络超时 | 「请求超时，请检查网络后重试」 |
| 其他未捕获错误 | 「发生未知错误，请联系管理员」 |

错误统一通过前端 Toast（如 `sonner`）展示，**禁止使用 `alert()`**。

### 7.5 前端渲染
- Markdown 渲染：`react-markdown` + `remark-math` + `rehype-highlight`
- 公式严格格式：
  - 行内：`$...$`
  - 行间：`$$...$$`
- 代码块：` ```语言名 ` 自动高亮。

### 7.6 Docker Compose 一键启动
`docker-compose.yml` 包含 app 和 postgres 两个服务：

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    depends_on: [db]
    env_file: [.env]
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: chatdb
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

`docker compose up --build` 一键启动，自动执行 Prisma migrate。

---

## 八、验收标准

1. 未登录 → 访问 /chat 或 /admin → 强制跳转 /login。
2. 同一用户可多标签页各开独立会话，历史切换后上下文不丢失。
3. 普通模式连续对话超过 10 轮后，仅最近 10 条消息影响模型回答（早期消息不在展示区但历史记录已截断）。
4. 单次消息附 7 个文件（总计 ≤ 350MB）可正常提交；单个文件 50MB+ → 明确 413 错误提示；超过 7 个文件 → 明确 400 提示。
5. 联网模式下，Claude 回答以「以下为搜索结果摘要」开篇，末尾有带编号的参考来源列表。
6. 文生图输入描述后展示生成图片（30 秒内）。
7. 管理员将用户 tokenLimit 设为 1 → 用户发起请求得到 403 + 「对话额度已用完」提示。
8. 管理员将用户 searchMonthlyLimit 设为 5 → 连续 5 次联网请求后，第 6 次触发「本月搜索次数已用完」，普通对话不受影响。
9. Docker Compose 一键 `up --build` 正常启动，数据库 migrations 成功，前端可访问。

---

## 九、已知前提与可调整项

- **Claude 附件兼容性**：网关对 `claude-opus-4-6` 的附件处理能力以实际测试为准；若不支持，按第 4.5 节 fallback 逻辑处理文件；若返回错误码则前端提示「当前模型不支持该文件格式」。
- **Anspire 点数计费**：以官方「产品计费逻辑」文档为准；若每次固定扣 N 点，在 `.env` 中填入 `SEARCH_POINTS_PER_CALL=N`。
- **Gemini 生图 API 格式**：若返回 base64，前端用 `<img src="data:image/png;base64,...">` 展示；若返回 URL，用 `<img src={url}>` 展示；下载按钮直接指向对应 src。
- **模型选择**：当前固定 `claude-opus-4-6` 和 `gemini-3-pro-image-preview`，后续若需支持多模型切换，将模型名存入 `Message.model` 并在 API Route 中动态读取。
