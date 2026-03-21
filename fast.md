# 运营操作速查手册

本文档记录两条核心操作链路的完整步骤和命令，供日常运营使用。

---

## 一、前置：需要启动的服务

### 1. Web 应用（必须）

```bash
cd ~/Documents/starter/web
npm run dev
# 访问 http://localhost:3000
```

### 2. OpenClaw 浏览器自动化服务（运行真实工作流时必须）

OpenClaw 需要 browser + gateway 两个进程在后台运行。具体启动方式见 OpenClaw 项目自身文档：

```
~/.openclaw/workspace/README.md
~/.openclaw/workspace/BOOTSTRAP.md
```

> ⚠️  **仅在需要执行真实网络抓取时**才需要启动 OpenClaw 服务。
> 使用 `--mock` 模式或从已有数据加载时，不需要启动 OpenClaw。

---

## 二、客户发现任务（Discovery → 线索 → 客户池）

**链路概览：**

```
用户在页面发起发现任务
  → 后端创建 Job (queued)
  → 管理员 CLI 领取 → 执行 OpenClaw 工作流 → 回传结果
  → 审核确认 → 发布
  → 线索出现在「已发掘客户线索」页
  → 客户自动进入客户池
```

### 步骤一：用户在页面发起任务

1. 打开 http://localhost:3000/discover
2. 填写「品类方向」和「优先地区」
3. 点击「发起客户发现」

任务创建后状态为 `queued`，用户在发现页可看到进度。

### 步骤二：管理员执行任务（推荐：一键流程）

```bash
cd ~/Documents/starter/admin-cli

# 交互式：自动列出队列，选择任务和执行方式
python run.py

# 直接指定任务 ID + 执行方式（非交互）
python run.py <job_id> --run       # 执行真实 OpenClaw 工作流（需 OpenClaw 服务在运行）
python run.py <job_id> --mock      # 使用模拟数据（测试用）
python run.py <job_id> --from <openclaw_run_id>   # 从已有 OpenClaw run 的结果加载
python run.py <job_id> --new       # 从 company_master.tsv 中的 new 公司加载
python run.py <job_id> --tsv /path/to/file.tsv    # 从指定 TSV 文件加载
```

`run.py` 会自动完成以下全部步骤：
1. 领取任务（claim）
2. 标记开始（start）
3. 执行工作流 / 加载数据
4. 回传结果（review-ready），含质量指标
5. 显示审核预览
6. 交互确认：发布（publish）或拒绝（reject）

### 步骤二（可选）：分步执行

如需分步控制，可使用各子命令：

```bash
# 查看队列
python jobs.py list queued

# 单步：领取 → 开始 → 回传 → 发布
python jobs.py claim <job_id>
python jobs.py start <job_id>
python execute.py <job_id> --run        # 执行并生成 payload.json
python review.py review-ready <job_id> payload.json
python review.py review <job_id>        # 查看审核详情
python review.py publish <job_id>
# 或拒绝：
python review.py reject <job_id> "质量不达标"
```

### 步骤三：确认结果

发布后，线索自动出现在 http://localhost:3000/leads，客户同步进入客户池 http://localhost:3000/customer-pool。

执行成功后终端会输出**质量指标**摘要，例如：

```
结果: 12条线索 (推荐5 / 观察7)
质量指标: 平台8个 (可访问6) / 提取公司20 / 新公司15
```

---

## 三、深度画像构建（客户池 → 深度画像）

**链路概览：**

```
用户在客户池点击「构建深度画像」
  → 后端创建 ProfileRequest (queued)
  → 管理员 CLI 查看队列 → 执行 OpenClaw profile 工作流 → 回传结果
  → 客户池自动更新画像数据
```

### 步骤一：用户在页面提交画像请求

1. 打开 http://localhost:3000/customer-pool
2. 找到目标客户卡片
3. 点击右下角「构建深度画像」（或「重新构建画像」）
4. 按钮显示「请求已提交 ✓」即成功

### 步骤二：管理员处理画像请求

```bash
cd ~/Documents/starter/admin-cli

# 查看待处理队列
python profile_run.py --list

# 查看其他状态
python profile_run.py --list completed
python profile_run.py --list claimed
python profile_run.py --list running

# 交互式处理（逐步确认）
python profile_run.py

# 全自动处理所有 queued 请求（推荐日常使用）
# 若 company_profile.tsv 中没有该公司数据，自动调用 OpenClaw workflow 构建
python profile_run.py --auto

# 处理指定请求 ID
python profile_run.py <request_id>
```

`--auto` 模式的处理逻辑：
1. 领取请求（claim）
2. 标记开始（start）
3. 在该用户工作空间的 `company_profile.tsv` 中查找已有画像
4. 若找到 → 直接回传
5. 若未找到 → 自动调用 `company_workflow_controller.py profile <domain>` 构建，完成后回传
6. 写入数据库，客户池自动更新

### 步骤三：确认结果

处理完成后（约等待下一次轮询，≤ 10 秒），客户卡片状态自动变为「画像完成」，点击「查看详情」可在右侧抽屉看到：

- 采购信号（进口信号、核心产品、目标市场）
- 公司规模（员工、营收、认证）
- 联系方式（邮箱、电话、LinkedIn）
- 公司信息（买家匹配、商业模式、地区）
- 证据与备注

---

## 四、画像请求频率策略

通过 `web/.env` 里的 `PROFILE_REQUEST_POLICY` 控制：

```bash
# 测试阶段：无限制，可反复提交（当前）
PROFILE_REQUEST_POLICY="test"

# 上线后：每个客户每天最多提交一次
PROFILE_REQUEST_POLICY="once_per_day"

# 严格模式：有完整画像即不允许再提交
PROFILE_REQUEST_POLICY="once"
```

修改后重启 `npm run dev` 生效。

---

## 五、数据目录结构（用户隔离）

数据按用户手机号隔离，每个用户有独立工作空间：

```
~/.openclaw/workspace/
├── workflow/                          # 共享：OpenClaw 脚本（所有用户共用）
├── users/
│   └── 13800000001/                   # 用户手机号 = 目录名
│       ├── company_master.tsv         # 该用户的公司主表
│       ├── company_profile.tsv        # 该用户的画像数据
│       ├── review_queue.tsv           # 该用户的审核队列
│       ├── platform_master.tsv        # 该用户的平台主表
│       ├── platform_bucket_registry.json   # 该用户的品类探索词包
│       ├── platform_exploration_state.json # 平台探索状态
│       └── runs/                      # 该用户的运行目录
│           ├── run_xxxx_platform/     # 平台发现轮次
│           │   ├── platform_results.json     # 平台发现结果（新格式）
│           │   └── company_candidates.tsv    # 候选公司（新格式）
│           └── run_xxxx/              # 公司下钻轮次
```

CLI 脚本自动从 API payload 中读取 `userPhone`，路由到对应用户的工作空间，无需手动指定。

---

## 六、工作流执行模式

### 冷启动 vs 稳态

CLI 自动判断用户工作空间状态：

| 条件 | 模式 | 说明 |
|------|------|------|
| 无可下钻平台 & runs < 6 | **bootstrap**（冷启动） | 平台发现 → 快速验证 → 试钻，一轮内完成 |
| 已有可下钻平台 | **expansion**（稳态） | 常规平台扩展 + 公司下钻 |

冷启动模式调用 `platform_workflow_controller.py --mode bootstrap`，内部自动完成：
1. 选择探索词包 → 搜索引擎发现平台
2. 候选平台快速验证（bootstrap_validate）
3. 试钻一批公司（bootstrap_trial_drill）
4. 评分并更新 platform_master

### 两层线索输出

workflow 产出 `company_candidates.tsv`，包含两种证据级别：

| evidence_level | 含义 | 映射到 current_tier |
|----------------|------|---------------------|
| verified | 已验证，有完整公司信息 | recommended |
| candidate | 候选，来源可信但未完整验证 | observation |

fit_score ≥ 0.6 的 candidate 也会提升为 recommended。

### 品类词包（Bucket）

每个用户的 `platform_bucket_registry.json` 根据任务品类自动生成。已内置精准词包的品类：

- 宠物用品、消费电子、服装、家居用品、美妆个护、家具家装

未内置的品类使用通用模板自动生成（`<品类> accessories/components/wholesale/OEM/retail/B2B`）。

---

## 七、故障排查

**`python profile_run.py --list` 返回 500**

→ Web 服务器 Neon 连接空闲超时后重连失败。重新发起一次请求通常会自动恢复；若持续失败，重启 `npm run dev`。

**`画像已提交` 但客户池不更新**

→ `profile_run.py` 尚未处理请求。运行 `python profile_run.py --auto`。

**发起发现任务后无线索出现**

→ 任务可能还在 `queued` 状态，运行 `python run.py` 处理。可用 `python jobs.py list queued` 确认。

**OpenClaw 工作流超时**

→ 默认超时 10 分钟。若域名访问慢可在 `profile_run.py` 中调整 `timeout=600`。

**冷启动后 0 条线索**

→ 平台发现未找到可用平台。检查：
1. `platform_bucket_registry.json` 的 `sub_category_buckets` 是否合理
2. `platform_master.tsv` 是否有条目（即使状态为 discovered）
3. OpenClaw browser 服务是否正常运行

**质量指标显示平台可访问数为 0**

→ 平台验证阶段全部失败。可能是 OpenClaw browser 网络问题，或目标品类的平台需要登录才能访问。
