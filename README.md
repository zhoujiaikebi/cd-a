# Claude Chat - 私有多用户聊天站

用 Next.js 15 + PostgreSQL + Prisma 搭建的私有多用户 Claude 聊天站，支持联网搜索和文生图。

## 快速启动

### 方式一：Docker Compose（推荐）

```bash
cp .env.example .env
# 编辑 .env，填入所有 API Key 和配置
docker compose up --build
```

首次启动会自动执行数据库迁移并创建管理员账号。

### 方式二：本地开发

```bash
cp .env.example .env
# 编辑 .env，填入所有配置

npm install
npx prisma migrate dev
npx prisma db seed   # 创建管理员账号
npm run dev
```

## 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `CLAUDE_API_KEY` | ✅ | Claude API Key |
| `CLAUDE_BASE_URL` | | Claude 网关地址（默认 `https://api.zhangsan.cool/v1`） |
| `CLAUDE_MODEL` | | Claude 模型名（默认 `claude-opus-4-6`） |
| `GEMINI_API_KEY` | ✅ | Gemini 生图 API Key |
| `GEMINI_BASE_URL` | | Gemini 网关地址 |
| `GEMINI_MODEL` | | Gemini 模型名（默认 `gemini-3-pro-image-preview`） |
| `ANESPIRE_API_KEY` | ✅ | Anspire 联网搜索 API Key |
| `ANSRIPE_ENDPOINT` | | Anspire 搜索接口地址 |
| `SEARCH_POINTS_PER_CALL` | | 每次搜索消耗点数（默认 0） |
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `NEXTAUTH_SECRET` | ✅ | NextAuth 加密密钥 |
| `NEXTAUTH_URL` | | 站点 URL（生产必填） |
| `ADMIN_USERNAME` | ✅ | 管理员用户名 |
| `ADMIN_PASSWORD` | ✅ | 管理员密码 |

## 功能特性

- **普通对话**：Claude 流式对话，支持 Markdown、代码高亮、LaTeX 公式
- **联网搜索**：Anspire 搜索 → Claude 总结，强制引用参考来源
- **多文件上传**：单次最多 7 个文件，单文件最大 50MB
- **文生图**：Gemini 模型生成图片
- **上下文记忆**：最近 10 条消息影响模型回答
- **会话管理**：新建、重命名、删除、切换会话
- **管理后台**：用户管理、额度管理、用量统计

## 技术栈

- 前端：Next.js 15 App Router + TypeScript + Tailwind CSS
- 后端：Next.js API Routes
- 数据库：PostgreSQL + Prisma ORM
- 鉴权：NextAuth.js（Credentials Provider）
- 样式：shadcn/ui 组件库

## 项目结构

```
src/
├── app/
│   ├── api/               # API 路由
│   │   ├── auth/          # NextAuth 路由
│   │   ├── chat/          # 对话 API
│   │   ├── sessions/      # 会话管理 API
│   │   ├── image/         # 文生图 API
│   │   └── admin/         # 管理后台 API
│   ├── (auth)/login/      # 登录页
│   ├── (chat)/chat/       # 聊天页
│   └── (admin)/admin/     # 管理后台
├── components/
│   └── ui/               # shadcn/ui 组件
└── lib/
    ├── auth.ts           # NextAuth 配置
    ├── prisma.ts         # Prisma Client
    ├── env.ts            # 环境变量
    └── utils.ts          # 工具函数
```

## 常见问题

**Q: 忘记管理员密码怎么办？**

删除数据库中的管理员用户，重新运行 `npx prisma db seed`。

**Q: 如何重置用户额度？**

在管理后台编辑用户，将 Token 上限和搜索次数上限设为 0（无限制）。

**Q: Docker 启动失败？**

```bash
docker compose down -v   # 删除数据卷
docker compose up --build
```

## 许可证

MIT