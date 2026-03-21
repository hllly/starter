# 实施计划（基于 v3 设计 + Schema/API 规格）

## 总览

共 6 个阶段，每阶段有明确的交付物和验收标准。
阶段之间有依赖关系，必须按序执行。

```
P0 项目初始化
 ↓
P1 数据库 + 认证 + API 骨架
 ↓
P2 发现页 + 线索页（前端）
 ↓
P3 管理员执行流程打通
 ↓
P4 端到端联调 + 冷启动
 ↓
P5 任务历史页 + 收尾上线
```

---

## P0：项目初始化

### 目标

从零建好项目骨架，能本地启动，能部署到 Vercel，能连到数据库。

### 任务清单

| # | 任务 | 说明 |
|---|------|------|
| 0.1 | 创建 Next.js 项目 | `npx create-next-app@latest`，App Router，TypeScript |
| 0.2 | 安装核心依赖 | tailwindcss, shadcn/ui, prisma, @prisma/client, zod, react-hook-form, @hookform/resolvers, next-auth |
| 0.3 | 配置 Tailwind + shadcn/ui | 初始化 shadcn，配置主题色（浅青绿 teal + 暖灰白） |
| 0.4 | 配置 Prisma | `prisma init`，连接 Supabase/Neon PostgreSQL |
| 0.5 | 配置环境变量 | DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, ADMIN_API_KEY, 邮件服务配置 |
| 0.6 | 配置 Sentry | 接入 Next.js 前后端错误监控 |
| 0.7 | 部署到 Vercel | 绑定 Git 仓库，配置环境变量，确认能访问 |
| 0.8 | 建立项目目录结构 | 按功能模块组织 |

### 建议目录结构

```
src/
├── app/
│   ├── (auth)/           # 登录相关页面
│   ├── (dashboard)/      # 主业务页面
│   │   ├── discover/     # 发现页
│   │   ├── leads/        # 线索页
│   │   └── history/      # 任务历史页
│   ├── api/
│   │   ├── auth/         # NextAuth 路由
│   │   ├── discovery-requests/
│   │   ├── leads/
│   │   └── admin/        # 管理员接口
│   └── layout.tsx
├── lib/
│   ├── prisma.ts         # Prisma client 单例
│   ├── auth.ts           # NextAuth 配置
│   ├── validations/      # Zod schema
│   └── utils/            # 工具函数（company 去重等）
├── components/
│   ├── ui/               # shadcn 组件
│   └── ...               # 业务组件
└── prisma/
    ├── schema.prisma
    └── migrations/
```

### 验收标准

- [ ] `npm run dev` 本地能启动，能看到默认页面
- [ ] Vercel 部署成功，能通过域名访问
- [ ] `npx prisma db push` 能连接远程数据库（Supabase/Neon）
- [ ] Sentry 能收到一条测试错误
- [ ] shadcn/ui 至少一个组件（如 Button）能正常渲染
- [ ] 环境变量全部配置到 Vercel 和 `.env.local`

---

## P1：数据库 + 认证 + API 骨架

### 目标

8 张表建好，认证跑通，所有 API 路由存在且能返回正确的 HTTP 状态码。

### P1.1 数据库建表

| # | 任务 | 说明 |
|---|------|------|
| 1.1.1 | 编写 Prisma schema | 按 schema-and-api-spec.md 中的完整 schema，包含全部 14 个 enum |
| 1.1.2 | 生成 migration | `npx prisma migrate dev --name init` |
| 1.1.3 | 添加补充 SQL | 手动创建 migration，添加 companies 的两条 partial unique index |
| 1.1.4 | 验证表结构 | 用 Prisma Studio 或 Supabase 控制台确认 8 张表和索引 |

**验收标准：**

- [ ] 8 张表全部在数据库中创建成功
- [ ] `npx prisma studio` 能打开并看到所有表
- [ ] companies 表有两条 partial unique index（通过 `\d companies` 或 Supabase SQL editor 确认）
- [ ] 枚举类型全部生效（通过 Prisma Studio 下拉选项确认）

### P1.2 认证

| # | 任务 | 说明 |
|---|------|------|
| 1.2.1 | 配置 NextAuth | Email provider（magic link），session strategy = jwt，适配 App Router |
| 1.2.2 | 实现 allowlist 校验 | 只有 users 表中 status=active 的邮箱能登录 |
| 1.2.3 | 实现登录页面 | 邮箱输入 → 发送 magic link → 回调登录 |
| 1.2.4 | 实现 session 中间件 | 保护用户侧 API（未登录返回 401） |
| 1.2.5 | 实现 admin 中间件 | 校验 ADMIN_API_KEY（Bearer token），不通过返回 401 |
| 1.2.6 | 手工插入种子用户 | 在数据库中插入 1-2 条 users 记录（status=active） |

**验收标准：**

- [ ] 种子用户邮箱能收到 magic link 邮件
- [ ] 点击 magic link 后成功登录，跳转到主页
- [ ] 非 allowlist 邮箱登录时被拒绝
- [ ] 未登录状态访问 `/api/discovery-requests` 返回 401
- [ ] 无 ADMIN_API_KEY 访问 `/api/admin/jobs` 返回 401
- [ ] 正确 ADMIN_API_KEY 访问 `/api/admin/jobs` 返回 200

### P1.3 用户侧 API

按 schema-and-api-spec.md §3.1 ~ §3.7 实现。

| # | 接口 | 关键逻辑 |
|---|------|----------|
| 1.3.1 | POST /api/discovery-requests | Zod 校验 → 创建 request + job → 防抖（30s 内同参数去重） |
| 1.3.2 | GET /api/discovery-requests | 分页查询当前用户的任务列表，leadCount 仅 published 时返回 |
| 1.3.3 | GET /api/discovery-requests/:id | 返回任务详情 + statusText 映射 + resultSummary（仅 published） |
| 1.3.4 | GET /api/discovery-requests/:id/leads | 仅 published 时返回，含 company 信息 + previouslyDiscovered 判断 |
| 1.3.5 | POST /api/leads/:id/feedback | Zod 校验 → 写入 lead_feedback → 自动映射更新 lead.status |
| 1.3.6 | PATCH /api/leads/:id/status | 校验 lead.status=contacted → 允许推进到 following/paused/no_interest |
| 1.3.7 | POST /api/discovery-requests/:id/feedback | Zod 校验 → 写入 batch_feedback |

**验收标准（可用 curl / Postman / API 测试工具）：**

- [ ] POST 创建任务，返回 201 + 正确 JSON
- [ ] 30 秒内同参数重复提交返回已有任务（防抖生效）
- [ ] GET 列表返回当前用户的任务，不返回其他用户的
- [ ] GET 详情在非 published 时 resultSummary 为 null
- [ ] GET leads 在非 published 时返回 403
- [ ] POST feedback 后 lead.status 自动更新（interested→interested, not_fit→dismissed, contacted→contacted）
- [ ] PATCH status 在 lead.status ≠ contacted 时返回 409
- [ ] PATCH status=following 在 contacted 后成功

### P1.4 管理员侧 API

按 schema-and-api-spec.md §3.8 ~ §3.17 实现。

| # | 接口 | 关键逻辑 |
|---|------|----------|
| 1.4.1 | GET /api/admin/jobs?status= | 按状态筛选任务列表，含 request 摘要 |
| 1.4.2 | GET /api/admin/jobs/:id/payload | 返回任务完整详情，用于本地执行 |
| 1.4.3 | GET /api/admin/jobs/:id/review | 返回结果摘要 + leads 预览 + 统计 |
| 1.4.4 | POST /api/admin/jobs/:id/claim | queued→claimed，写 claimed_at/claimed_by |
| 1.4.5 | POST /api/admin/jobs/:id/start | claimed→running，写 started_at |
| 1.4.6 | POST /api/admin/jobs/:id/review-ready | **最复杂接口**：Zod 校验 payload → company 去重（事务）→ 创建 leads → 创建 result_summary → running→awaiting_review |
| 1.4.7 | POST /api/admin/jobs/:id/publish | awaiting_review→published，leads 对用户可见 |
| 1.4.8 | POST /api/admin/jobs/:id/reject | awaiting_review→failed，记录 review_note |
| 1.4.9 | POST /api/admin/jobs/:id/fail | running→failed，记录 error_summary |
| 1.4.10 | POST /api/admin/jobs/:id/cancel | queued/claimed→cancelled |

**所有状态变更必须同事务更新 job.status 和 discovery_request.status。**

**验收标准：**

- [ ] 完整状态流转可跑通：queued → claim → start → review-ready → publish
- [ ] review-ready 回传 10 条 leads 后，数据库中 companies + leads + job_result_summaries 全部正确
- [ ] company 去重生效：同 website 不重复创建
- [ ] 非法状态转换返回 409（如 queued 直接 start）
- [ ] 幂等生效：published 后重复 publish 不报错
- [ ] reject 后 failure_type 和 review_note 正确写入
- [ ] discovery_request.status 与 job.status 始终同步

---

## P2：发现页 + 线索页（前端）

### 目标

两个核心页面可用，用户能提交任务、查看结果、做反馈。

### P2.1 全局布局

| # | 任务 | 说明 |
|---|------|------|
| 2.1.1 | 导航栏 | 左侧/顶部导航：发现 · 线索 · 历史（灰色标注"即将开放"）|
| 2.1.2 | 配色落地 | 按 v3 §13 配色系统设置 CSS 变量（teal 主色 + 暖灰白背景） |
| 2.1.3 | 登录态保护 | 未登录重定向到登录页，disabled 用户显示只读提示 |

### P2.2 发现页

| # | 任务 | 说明 |
|---|------|------|
| 2.2.1 | 顶部一句话 | "帮你持续发现潜在客户，并沉淀可维护线索。" |
| 2.2.2 | 最近任务入口 | 调 GET /api/discovery-requests（limit=1），展示最近任务状态 + "查看结果"链接 |
| 2.2.3 | 核心表单 | 4 必填字段 + 高级选项折叠，React Hook Form + Zod 校验 |
| 2.2.4 | 提交逻辑 | 调 POST /api/discovery-requests → 成功后提示 + 跳转线索页或停留 |
| 2.2.5 | 多任务弱提示 | 提交前检查是否有 running 任务，有则显示"新任务会排队等待" |
| 2.2.6 | localStorage 草稿 | 表单内容自动暂存，刷新不丢 |
| 2.2.7 | 底部弱存在区 | "正在内测的能力"小文字 |

**验收标准：**

- [ ] 填写 4 个必填字段 + 提交 → 数据库有对应 discovery_request + job
- [ ] 高级选项默认收起，展开后可填写排除项/供货能力/补充说明
- [ ] 必填字段留空时，提交按钮下方出现校验错误提示
- [ ] 刷新页面后表单内容从 localStorage 恢复
- [ ] 最近任务区块正确显示最新任务状态和线索数
- [ ] 点击"查看结果"跳转到线索页

### P2.3 线索页

| # | 任务 | 说明 |
|---|------|------|
| 2.3.1 | 任务选择 | 默认展示最近一次 published 任务的线索，支持切换历史任务 |
| 2.3.2 | 顶部状态条 | 显示任务状态文案 + 最近更新时间 + 手动刷新按钮 |
| 2.3.3 | 前端轮询 | queued/claimed/running/awaiting_review 时每 15 秒轮询 GET /api/discovery-requests/:id |
| 2.3.4 | 非 published 状态展示 | 显示对应状态文案（等待处理/正在整理/结果已生成…），不显示线索列表 |
| 2.3.5 | 线索卡片列表 | 展示公司名/网站/地区/客户类型/来源/推荐理由/状态标签 |
| 2.3.6 | 第一层动作按钮 | 感兴趣/不合适/已联系，点击调 POST /api/leads/:id/feedback |
| 2.3.7 | 不合适原因展开 | 点击"不合适"后展开原因选择（可选，不强迫） |
| 2.3.8 | 第二层维护按钮 | contacted 后出现：跟进中/暂不跟进/无意向，调 PATCH /api/leads/:id/status |
| 2.3.9 | 跨批次重复标注 | previouslyDiscovered=true 时显示"此前任务中已发现过" + 可展开历史 |
| 2.3.10 | 状态 Tab 筛选 | 全部/新线索/已关注/已联系/跟进中/暂停/已排除 |
| 2.3.11 | 批次反馈 | 页面底部"这批结果整体是否有帮助"三选一 + 可选备注 |

**验收标准：**

- [ ] 任务状态为 published 时，线索列表正常展示，卡片信息完整
- [ ] 任务状态为 queued/running 时，显示对应文案，不显示线索
- [ ] 轮询生效：管理员 publish 后，用户页面在 15 秒内自动刷新出结果
- [ ] 点击"感兴趣"后卡片状态标签变为"已关注"
- [ ] 点击"不合适"后展开原因选项，可选可不选
- [ ] 点击"已联系"后出现第二层按钮（跟进中/暂不跟进/无意向）
- [ ] 未 contacted 时不显示第二层按钮
- [ ] Tab 切换能正确筛选线索
- [ ] 跨批次重复标注显示正确
- [ ] 批次反馈提交成功

---

## P3：管理员执行流程打通

### 目标

管理员能通过 CLI 或脚本完成完整的 claim → execute → review → publish 流程。

### 任务清单

| # | 任务 | 说明 |
|---|------|------|
| 3.1 | 编写管理员 CLI 脚本 | Python 或 shell 脚本，封装管理员 API 调用 |
| 3.2 | 实现 claim + start 流程 | 脚本查看 queued 任务 → 选择 → claim → 拉取 payload → start |
| 3.3 | 对接 workflow_controller | 脚本调用本地 workflow_controller.py，传入 request 参数 |
| 3.4 | 实现结果转换 | 将 workflow 产出（TSV/JSON）转换为 review-ready payload 格式 |
| 3.5 | 实现 review-ready 回传 | 脚本将转换后的 payload POST 到云端 |
| 3.6 | 实现 review + publish | 脚本调用 review 接口查看结果摘要 → 确认后调用 publish |
| 3.7 | 实现 reject + fail 路径 | 结果不理想时调用 reject；执行出错时调用 fail |
| 3.8 | company 去重端到端验证 | 连续两次不同任务发现同一公司，确认 companies 不重复创建 |

### 建议 CLI 脚本结构

```
admin-cli/
├── config.py          # API_BASE_URL, ADMIN_API_KEY
├── jobs.py            # list / claim / start / fail / cancel
├── execute.py         # 调用 workflow_controller + 结果转换
├── review.py          # review-ready + review 详情 + publish / reject
└── run.py             # 一键编排：claim → execute → review-ready → 等待确认 → publish
```

### 验收标准

- [ ] `python run.py` 能一键完成：查看待处理 → claim → 拉取参数 → 本地执行 → 回传结果 → 等待确认 → publish
- [ ] publish 后用户在线索页能看到结果
- [ ] reject 后用户在线索页看到"本轮处理未完成"
- [ ] 同一公司出现在两次不同任务中，companies 表只有一条记录
- [ ] result_quality 正确计算（0 条结果 → empty，<5 条 → low_yield）
- [ ] review 接口能看到完整的结果摘要和 leads 预览

---

## P4：端到端联调 + 冷启动

### 目标

用真实数据走通完整闭环，验证从用户提交到查看结果到反馈的全流程。

### P4.1 冷启动数据导入

| # | 任务 | 说明 |
|---|------|------|
| 4.1.1 | 编写导入脚本 | 读取现有 runs 目录的 TSV/JSON |
| 4.1.2 | 提取 companies | 执行 website 规范化 + normalized_name 标准化 → 写入 companies |
| 4.1.3 | 提取 leads | 关联到 company_id 和 discovery_request_id → 写入 leads |
| 4.1.4 | 创建对应 request + job | status=published，让用户能直接看到历史数据 |

**验收标准：**

- [ ] 导入脚本执行无报错
- [ ] 导入后用户登录能在线索页看到历史结果
- [ ] companies 去重生效，无重复记录

### P4.2 端到端测试

| # | 测试场景 | 预期结果 |
|---|----------|----------|
| 4.2.1 | 用户提交 → 管理员全流程 → 用户看到结果 | 线索页正确展示，状态文案正确 |
| 4.2.2 | 用户对线索做反馈 → 状态变化 | lead.status 正确更新，feedback 记录写入 |
| 4.2.3 | 用户做批次反馈 | batch_feedback 记录写入 |
| 4.2.4 | 用户提交第二个任务 → 同公司再次出现 | "此前任务中已发现过"标注正确 |
| 4.2.5 | 管理员 reject 结果 | 用户看到"本轮处理未完成"，leads 不可见 |
| 4.2.6 | 用户提交 → 30s 内重复提交 | 防抖生效，不创建第二个任务 |
| 4.2.7 | disabled 用户登录 | 能看到历史数据，不能提交新任务 |
| 4.2.8 | 非 allowlist 邮箱登录 | 被拒绝 |

**验收标准：**

- [ ] 8 个测试场景全部通过
- [ ] 数据库中数据一致性正确（无孤立记录、状态不同步等）

### P4.3 部署验证

| # | 任务 | 说明 |
|---|------|------|
| 4.3.1 | Vercel 生产部署 | 确认所有环境变量配置正确 |
| 4.3.2 | 生产环境冒烟测试 | 在生产环境走一遍完整流程 |
| 4.3.3 | Sentry 验证 | 确认生产环境错误能在 Sentry 中看到 |
| 4.3.4 | 域名配置 | 绑定自定义域名（如有） |

**验收标准：**

- [ ] 生产环境完整流程走通
- [ ] Sentry 能收到生产环境的错误事件
- [ ] HTTPS 访问正常

---

## P5：任务历史页 + 收尾上线

### 目标

补上历史页，完成收尾优化，交付种子用户使用。

### P5.1 任务历史页

| # | 任务 | 说明 |
|---|------|------|
| 5.1.1 | 任务历史列表 | 调 GET /api/discovery-requests → 表格/卡片列表展示 |
| 5.1.2 | 状态标签 | 按 statusText 映射显示状态 |
| 5.1.3 | 点击跳转 | 点击任务跳转到线索页查看结果 |
| 5.1.4 | 当前开放能力区 | 弱存在卡片：客户发现(已开放)、结果反馈(已开放)、客户维护(内测中)… |
| 5.1.5 | 系统共建提示 | "你的反馈会直接影响后续推荐方向" |

**验收标准：**

- [ ] 能看到所有历史任务
- [ ] 状态文案正确
- [ ] 点击任务能跳转到对应线索页
- [ ] 能力区域和共建提示正确展示

### P5.2 收尾优化

| # | 任务 | 说明 |
|---|------|------|
| 5.2.1 | 任务积压监控 | Vercel Cron：每天检查 queued 超过 24h 的任务，发提醒 |
| 5.2.2 | 错误兜底页面 | 404 / 500 / 无权限的友好错误页面 |
| 5.2.3 | Loading 状态 | 列表加载、表单提交时的 loading 指示 |
| 5.2.4 | 空状态 | 无任务、无线索时的空状态引导 |
| 5.2.5 | 移动端适配 | 基础响应式，确保手机上能用 |
| 5.2.6 | 文案走查 | 所有状态文案、提示文案、按钮文案统一走查一遍 |

**验收标准：**

- [ ] 积压监控生效（手动触发 Cron 验证）
- [ ] 所有页面无 console error
- [ ] 空状态页面友好
- [ ] 手机浏览器上核心流程可用

### P5.3 种子用户交付

| # | 任务 | 说明 |
|---|------|------|
| 5.3.1 | 插入种子用户 | 在数据库中创建种子用户记录 |
| 5.3.2 | 导入冷启动数据 | 确保种子用户登录后能看到历史结果 |
| 5.3.3 | 发送邀请 | 发送 magic link 邀请邮件 |
| 5.3.4 | 首次任务陪跑 | 种子用户提交第一个任务后，管理员快速执行并发布 |

**验收标准（MVP 成功标准）：**

- [ ] 用户能在 2 分钟内完成任务提交
- [ ] 用户能在结果页理解为什么推荐这些线索
- [ ] 用户愿意对线索做一键反馈
- [ ] 用户能更新至少一部分线索状态
- [ ] 数据库中有结构化的任务、线索、反馈数据
- [ ] 用户感受到这是一个工作台，而不是单点找客户工具
- [ ] 管理员能顺畅完成"领取 → 执行 → 审核 → 发布"全流程
- [ ] 异常结果不会未经确认就暴露给用户

---

## 阶段依赖关系与预估工时

```
P0 项目初始化          ████                    ~1 天
P1 数据库+认证+API     ████████████████        ~4-5 天
P2 发现页+线索页       ████████████████        ~4-5 天
P3 管理员执行流程       ████████                ~2-3 天
P4 联调+冷启动         ████████                ~2-3 天
P5 历史页+收尾上线      ████████                ~2-3 天
                                              ──────
                                              ~15-20 天
```

### 关键路径

P1.4.6（review-ready 接口，含 company 去重事务）和 P3.4（workflow 结果转换为 payload）是全链路最复杂的两个点，建议预留额外 buffer。

### 可并行的工作

- P2 前端可以在 P1 API 完成后并行开发（先用 mock 数据）
- P3 CLI 脚本可以在 P1.4 管理员 API 完成后立刻开始
- P5.1 历史页可以在 P4 联调期间并行开发

---

## 阶段间切换检查清单

### P0 → P1 切换条件

- [ ] 项目能本地启动 + Vercel 部署成功
- [ ] 数据库可连接
- [ ] 所有依赖已安装

### P1 → P2 切换条件

- [ ] 8 张表已建
- [ ] 认证跑通
- [ ] 所有 17 个 API 端点返回正确 HTTP 状态码
- [ ] 完整状态流转 queued→claimed→running→awaiting_review→published 可通过 API 调用走通

### P2 → P3 切换条件

- [ ] 发现页能提交任务
- [ ] 线索页能展示 published 任务的线索
- [ ] 反馈动作和状态推进可用

### P3 → P4 切换条件

- [ ] CLI 脚本能完成 claim → execute → review-ready → publish 全流程
- [ ] workflow 产出能正确转换为 payload

### P4 → P5 切换条件

- [ ] 端到端 8 个测试场景全部通过
- [ ] 生产环境部署验证通过

### P5 → 上线条件

- [ ] MVP 成功标准全部满足
- [ ] 种子用户数据已导入
- [ ] 首次任务陪跑完成
