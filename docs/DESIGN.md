# 童澄每周课程发布与课件制作助手 — 设计与交互说明

> 阶段 A 交付物：目录结构、界面与交互流程、Dry-Run 演示说明。
> 本版本不向童澄生产环境写入任何数据；所有写操作在 Dry-Run 模式与真实执行模式之间共用同一套代码路径。

---

## 1. 目录结构

```
tiku-weekly/
├── package.json            # bundle 清单：Host 半 + Client 半 + locale + icon
├── cordis.patch.yml        # 插入 Host 行（require 真实 dsh-* 包）
├── index.js                # Host 半入口：inject tools, webServer, credentials
├── client.js               # Client 半：侧边栏面板 + 主工作区（1~4 步向导）
├── locale/{zh,en}.json     # 插件在「插件管理」里的标题/描述/详情
├── icon.svg                # 侧边栏与插件卡片图标
├── web/teacher.html        # 教师 Web 向导（独立窗口，屏幕更大，支持拖拽上传）
├── lib/
│   ├── http.js             # 极薄 fetch 封装：/sb 同源反代、超时、中文错误、JWT 刷新
│   ├── session.js          # 凭据持久化（ctx.credentials record），从不落配置/日志
│   ├── api.js              # 已核实接口契约的唯一封装（每个 action 一个函数）
│   ├── plan.js             # Dry-Run：把各步骤输入编译成「计划步骤清单」
│   ├── runner.js           # 执行器：逐项执行、状态机、单步重试、撤回
│   ├── router.js           # 教师 Web 的 HTTP 路由（/tiku-weekly/*）
│   └── state.js            # 服务端内存工作草稿（按教师 uid 隔离，进程内）
├── test/
│   ├── contract.mjs        # 契约测试：请求体字段与已核实契约逐字比对
│   └── dryrun-demo.mjs     # Dry-Run 演示脚本（不联网，产出计划清单）
└── docs/
    ├── DESIGN.md
    └── DETAIL.md           # 插件管理里的详情页（功能/用法/边界）
```

Host 半提供服务方法 `tikuWeekly`，三个调用面共用同一个实现：

| 调用面 | 用途 |
|---|---|
| 教师 Web 向导（`/tiku-weekly/*`） | 老师日常主界面，就是「可视化操作界面」本身 |
| DSH 侧边栏面板（Client 半） | 在 DSH 内同样可视化操作，顶部常驻上下文栏 |
| Agent 工具 `tiku_weekly_*` | 让模型可以调用同一批操作并回读结果 |

---

## 2. 界面与交互流程

### 2.1 两种入口，同一份状态

```
┌──────────────────────────────────────────────┐
│ 顶部常驻上下文栏（每一步都可见）              │
│ [老师 · teacher · 已登录] [班级▾] [课程▾]    │
│ [教学计划▾] [目标课次▾]  [刷新] [退出]        │
└──────────────────────────────────────────────┘
   ① 建课/排课次/跨班复制
   ② 课件制作与双版上传
   ③ 随堂绑题 + 课后作业/考试 + 任务链
   ④ 发布前预演 → 一键发布 → 进度看板
```

未登录时，整页只显示登录卡（账号/密码），其余步骤灰显并提示「先登录」。登录成功后自动拉班级列表；班级过期或不属于当前老师时，在下拉项旁直接标注，选中后给出中文原因并禁用后续步骤。

### 2.2 Step 1：建课 / 排课次 / 跨班复制

- 模式切换：`新建课程` / `在原课程追加课次` / `复制教学计划` / `跨班复制任务链`
- 新建课程：标题、分类、是否上下架；随后可追加章节（标题 + 排序）
- 追加课次：选章节 → 标题 → 可选绑定已有课件主题（`topicId`）
- 复制教学计划：选源课程 → 填新计划名 → 可勾选「从已有计划复制」
- 跨班复制：选源班/目标班 → 先点「预览差异」，页面展示将复制/跳过/冲突三类清单 → 勾选是否连绑定一起复制、是否带反馈 → 套用时自动带上预览哈希，防止两次预览之间数据变化

### 2.3 Step 2：课件制作与双版上传

- 拖拽或选择文件，页面自动判定投递目标：
  - 学生版 HTML/资料 → `purpose=course-asset` 签名直传 OSS → 写 `topics`
  - 教师私有版 HTML → `teach-admin?action=courseware-upload`，超过 3MB 或不是 HTML 时前端直接拦截并说明
- 表单：课件名称、分类、学生可见开关、资源类型/ID、预览链接
- 上传完成后显示 `public_url`、私有课件回写结果与可点击预览

### 2.4 Step 3：随堂绑题 + 作业/考试 + 任务链

**随堂练习（`lesson_sidebar`）**
- 关键词检索候选题 → 勾选 → 上下移动排序 → 每题设作答模式
- 保存草稿 / 发布 / 撤回三态；已发布状态下尝试修改时，界面提示「先撤回再改」
- 保存前自动校验：只允许 `lesson_sidebar`、`question_id` 必须出现在候选集中。
- PUT/POST 的 `class_id`、`course_id` 放 JSON body；PUT 必须带正整数 `resource_topic_id`。`question_refs.groups[]` 包含唯一非空 `id` 和 `question_refs[]`，题序从 1 开始。学科使用英文枚举（信息科技映射为 `programming`），作答模式为 `single_choice / multiple_choice / judge / short_text / code / oj`。

**课后作业（作业 v2）**
- 标题、学科、说明、截止时间、补交策略（关闭 / 允许 / 允许但扣分）及扣分比例
- 公开 / 定向学生勾选；选题与每题分值
- 若账号缺少 `quiz_school_members` 默认 `school_id`，后端返回 409，界面显示中文修复指引而不是裸报错

**随堂/课后考试（可选）**
- 时长、及格分、截止时间、选题与分值；总分与题数由选题自动算出

**课次任务链**
- 五个阶段勾选式排布：`entrance / in_class / exit / homework / after_class`
- 任务类型：`exam / homework / video`
- 前端与整条任务链共同校验：
  1. `(homework, homework)` 与 `(exam, after_class)` 在同一课次互斥；任一项单独存在均允许。
  2. `video` 仅允许在 `in_class` 或 `after_class` 阶段；其它阶段以 `INVALID_VIDEO_STAGE` 拦截。
- 可勾选「发布后顺手推送班级群任务卡片」并填写群 ID 与备注

### 2.5 Step 4：Dry-Run 与执行看板

点「发布前预演」后展示：

```
#  步骤                     目标            关键参数
1  创建课程                 课程            标题=三年级第12周
2  创建章节                 课程            order_no=3
3  追加课次                 章节            topic_id=123
4  学生版课件直传            OSS             文件名/大小/类型
5  写入 topics              课程课次        可见性=学生
6  教师私有课件上传          课次            3MB 限制
7  保存随堂绑题             lesson_sidebar  5 题
8  发布随堂绑题             lesson_sidebar  —
9  创建作业 v2              班级            截止/补交策略/总分
10 课次任务链发布           课次            4 个阶段
11 推送群任务卡片           群              可选
```

- 预演不写库；每步带 `dryRunUrl`，可以直接看到将要发出的请求体（键名逐一列出）
- 确认后「一键发布」：逐步显示 等待/进行中/成功/失败，成功项显示返回 ID 与跳转链接
- 失败项显示中文原因 + 原始状态码 + 保留上下文，可**单步重试**
- 已发布项可**撤回**（绑题撤回、任务链撤回、作业软删、群卡片撤回按类型分别处理）

---

## 3. 鉴权与请求红线（代码强制）

1. 所有 PostgREST/Auth 请求只走 `https://teach.tongchengweilai.com/sb/`（可配置为 tiku 主机），**代码中不出现 `*.supabase.co`**。
2. 只使用登录后的 JWT `Authorization: Bearer`；anon key 仅作 `apikey` 头用于 `sb/rest`，**不使用 service_role**。
3. 角色读 `profiles.role` 并同步到 UI；班级归属只在 `classes.teacher_id === uid` 且未过期时视为可用。
4. 新建班级时强制写入 `teacher_id = 当前 uid`。
5. `PATCH /api/admin/classes/{id}/teacher` 不实现（仅 admin，且当前需求不涉及转交）。

## 4. Dry-Run 演示

见 `test/dryrun-demo.mjs`：它用真实契约编译一组示例输入，打印完整步骤清单和每步请求体键名，不发出任何网络请求。命令：

```bash
node test/dryrun-demo.mjs
```

## 5. 评审后的修订（对老师可见的变化）

初版评审发现 5 个高严重度问题，已全部修复并有回归测试：

| 问题 | 修订 |
|---|---|
| 课次要老师手填 UUID | 顶部改为「本周课次」下拉，来自 `GET /sb/rest/v1/lessons`（按章节筛选），显示「章节 · 课次标题」 |
| 教师私有版要手填 topicId | 改为下拉，默认「本次新建的学生版课件」，也可选已有课件 |
| 新建课程时章节拿到假 ID | 依赖步骤改用 `@course.create` / `@chapter.create` / `@courseware.student.topic` 标记，执行时由上一步真实返回值替换；上一步没成功则给出中文原因 |
| 另存某一节会丢草稿 | 保存某一节时始终带上其余两节；Host 侧对空分节不再覆盖 |
| 拖入非 HTML 不拦截 | 教师私有版在拖拽/选择时即拒绝非 `.html`，并在界面上说明 |

同时按建议调整：第 ④ 步主表改为「会发生什么 / 对象 / 状态」，「技术细节」折叠；按钮改为「检查一下（不会真的发布）」与「确认发布给学生」；增加请求进行中的进度条与按钮禁用；与宿主主题变量 `--dsw-alias-*` 对齐；清掉界面上的 `UUID / topic_id / OSS / 写库 / resource_meta` 等工程词。

## 6. 尚待联调确认的点

- `topics` 与课次绑定的具体字段组合（`type/resource_type/resource_id` 取值枚举）
- `add-lesson` 返回结构
- `homework-v2` 创建响应里作业 ID 的字段名
- 跨班复制 `expected_preview_hash` 的摘要输入是否就是预览响应原文
