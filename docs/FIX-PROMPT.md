# 任务：修复「童澄每周课程发布助手」插件的 7 个问题

问题 1~3 是阻塞级（会让老师卡住或写入错误数据），4~5 是交互问题，6 是流程缺口，7 是测试不同步。建议按这个顺序处理。

## 插件位置

`/Users/tongcheng/Documents/Codex/2026-11-05/task/comparison/dsh-economy/tiku-weekly/`

这是一个 DSH 插件，给一线老师做每周备课与发布：建课/排课次 → 双版课件 → 随堂绑题/作业/考试/任务链 → 发布前预演 → 一键执行（失败可单步重试，已发布可撤回）。

面向老师的是 Host 自己服务的一个页面（`/tiku-weekly`），侧边栏另有一个面板。核心约束：

- 所有写操作必须先 Dry-Run 预演，确认后才执行；预演与执行共用同一份步骤清单。
- 请求体字段名来自已核实的接口契约，**严禁猜测、改名或增加未核实的字段**。
- 所有 Supabase/PostgREST 请求走同源反代 `{teach 主机}/sb/`，只带教师 JWT，不使用 service_role。
- 界面文案面向老师，不能出现 `topicId`、`UUID`、`写库`、`OSS`、`expected_preview_hash` 这类工程词。

## 代码结构

| 文件 | 职责 |
|---|---|
| `lib/api.js` | 接口契约封装，每个函数一次请求 |
| `lib/plan.js` | Dry-Run 编译：把草稿编译成步骤清单 |
| `lib/runner.js` | 执行器：逐步状态、单步重试、撤回 |
| `lib/service.js` | Host 服务 `tikuWeekly`，界面/Agent 工具共用 |
| `lib/teacher-page.js` | 老师界面（HTML 字符串 + 内联脚本，无构建步骤） |
| `lib/router.js` | 页面与 API 路由 |
| `test/contract.mjs` | 契约测试，当前 27/28 通过 |
| `test/dryrun-demo.mjs` | Dry-Run 演示，不联网 |

**只改这个插件目录内的文件。不要碰 `~/Projects/AI-practice`、`~/Projects/TEACH-platform`，也不要改 profile 配置。**

**注意：代码库近期已被改过（班级权限改走 `/api/teacher/classes`、教师端路由改走 tiku 主机、任务链改成「一个任务一次 PUT」）。以现在的文件内容为准，不要按旧版本假设。**

---

## 问题 1（阻塞）任务链返回值解构写死，接口返回结构一变就抛英文错

`lib/api.js:612-619`：

```js
export async function saveTaskChainDraft(host, token, { lessonId, classId, courseId, tasks }) {
  const saved = [];
  for (const body of buildTaskChain({ classId, courseId, tasks })) {
    const result = await requestJson({ base: teacherApiHost(host), pathname: `/api/teach/course-lessons/${lessonId}/tasks`, method: 'PUT', token, body });
    saved.push(result.data.task);   // ← 这里
  }
  return { tasks: saved };
}
```

`result.data.task` 在 `data` 缺失时抛 `Cannot read properties of undefined (reading 'task')`，而且是在**已经写完前几个任务**的循环中间抛出，界面只显示英文报错，老师不知道哪一步成功了、哪一步失败。

**要求**：

1. 解构改成容错：`result?.data?.task ?? result?.task ?? result ?? null`，取不到时不要抛类型错误。
2. 循环里**每个任务单独 try**。某个任务失败时记录该任务失败并**继续处理剩下的任务**，最后把成功与失败一起返回：
   ```js
   { tasks: [...成功项], failures: [{ stage, taskType, error: { message, fix } }] }
   ```
   错误信息必须是中文，且要说明是哪个阶段的任务失败。
3. 如果**全部**任务都失败，抛出 `WeeklyError`，`fix` 里说明「N 个任务中有 M 个没保存成功，可以单独重试」。

---

## 问题 2（阻塞）只上传课件时会创建出没有归属的课件

`lib/plan.js:273-287`（学生版课件）与 `lib/plan.js:288-310`（教师私有版）。

**实测结论**：当草稿里只有 `step2.student`、既没有 `context.courseId` 也没有 `context.lessonId` 时，`compilePlan` 返回的 `blocked` 是**空数组**，步骤照常生成 `['courseware.student', 'courseware.student.topic']`。

后果：`topics` 写出来没有课程/课次关联，成了孤儿记录；而教师私有版反而会提示「先上传学生版」，两张卡片提示口径不一致。

**要求**：

1. 当步骤要写 `topics`、但既没有 `courseId` 也没有 `lessonId` 时，往 `blocked` 推一条：
   ```js
   { id: 'courseware.student.topic', reason: '课件要挂到课程或课次上，请先在第①步选好课程，或新建课程后添加课次' }
   ```
2. 教师私有版「没有 topic 就提示先上传学生版」这条逻辑保留，但要与上面这条口径统一，都说成「先在第①步准备课程和课次」。
3. **补一条契约测试**：只传学生版课件且无课程无课次时，`blocked` 非空且理由是上面那句中文。

---

## 问题 3（阻塞）新建课程 + 加课次时，章节是隐式必填但没说清

`lib/plan.js:250-269`。新建课程模式下，`step1.addLesson.chapterId` 为空且 `step1.chapterTitle` 也为空时，课次会被拦，理由是「还没有可用的章节：请在第①步填章节标题，或从「追加到哪个章节」里选一个」。

但 `lib/teacher-page.js:61-77` 的新建模式下，课程/章节/课次三块是**同时展开**的，老师只填课程名和课次名是很常见的操作，问题直到第④步预演才暴露。

**要求**（二选一，推荐第 1 种）：

1. **章节标题改为必填**：新建课程模式下，章节标题输入框加必填标记（红星或 `required`）；未填时「保存这一步」就地提示「新建课程时需要填章节标题，课次才能挂进去」，不要等到第④步。
2. 或者：把「课次」从新建课程模式里拆出去，新建课程只建课程+章节，课次统一在「追加到哪个章节」模式里做。

无论选哪种，都要同步调整 `lib/teacher-page.js` 的 `syncMode()` 里各区块的显隐，并在页面文案里说明清楚。

---

## 问题 4（交互）界面仍残留工程词与两处未完成的下拉改造

行号已核对：

| 位置 | 现状 | 要改成 |
|---|---|---|
| `lib/teacher-page.js:98`、`:136`、`:210` | 按钮文案「写入草稿」 | 「保存这一步」（页面上第①步的说明文字 `:49` 和第④步的 `:697` 已经是「保存这一步」，三处不一致） |
| `lib/teacher-page.js:77` | 「绑定课件主题 topicId（可选）」，`<input type="number">` | 改下拉，显示课件名称，不显示 ID。已有 `refreshTopicOptions()`（`:411`）会拉课程下的课件，但只喂给了 `teacherTopicId`（`:130`），需要让 `lessonTopicId` 也用同一份列表 |
| `lib/teacher-page.js:82` | 「从哪个计划复制（可选）」，placeholder「源计划 UUID」 | 改下拉。计划列表已在 `onCourseChange()`（`:372`）里从 `/plans?courseId=` 拉到并存进 `opt('selPlan', ...)`，把同一份数据喂给这个下拉即可 |
| `lib/teacher-page.js:604` | 跨班复制失败提示里含「预览哈希」 | 改成「这个比较结果在 10 分钟内有效」之类的白话（`:449` 已经有这句白话，两处口径要统一） |

同时把页面上剩余的工程词清掉：搜索 `topicId`、`UUID`、`写库`、`OSS`、`resource_meta`、`lesson_sidebar` 出现在**界面文案**（而不是注释、接口字段、测试断言）的地方，一并换成老师能懂的说法。注释和代码里的字段名不用动。

---

## 问题 5（交互）三处会让老师选错班或以为没生效

1. **切换班级后课程下拉不重置**（`lib/teacher-page.js:351-370`）：`onClassChange()` 里 `opt('selCourse', ...)` 会保留上一个班选中的课程（`opt()` 的 `keep` 逻辑）。老师从 A 班切到 B 班，课程框还停在 A 班的课，直接发布就会发错班。**要求**：切换班级时清空课程、计划、课次三个下拉，除非新课程列表里正好有同名项。
2. **保存第①步后，课次下拉没有真正刷新**（`:611` 调了 `await refreshLessonOptions()`）：新建课程/章节的课次是在第④步执行后才存在的，此刻刷新必然是空列表；等真正发布完，界面上的「本周课次」下拉仍是旧的。**要求**：在第④步执行成功后（`execute()` 拿到结果时）自动重新拉一次课次列表，并在界面上给一句提示「本周课次已创建，已加入课次下拉」。
3. **保存第②步后教师私有版课件下拉没有刷新**（`:630` 同样调了 `refreshTopicOptions()`）：同上，学生版课件的主题也是执行后才存在。**要求**：执行成功后重新拉课件列表。

---

## 问题 6（流程缺口）改已有作业这条线只做了一半

后端已经实现了：
- `lib/service.js:325` `async startEdit({ homeworkId, lessonId, classId, courseId })` — 从已有作业/任务链回填草稿
- `lib/router.js:155` `post(`${API_PATH}/homework/edit`, (body) => service.startEdit(body))`

但**页面上没有任何入口调用它**。后果：
- 老师想改一份已发布作业的截止时间，只能重新建一份 → 学生端出现**两份作业**
- `runner.undo` 的撤回只能在预演看板里操作，事后没有入口

**要求**：

1. 在第③步的作业卡片上加一条入口「从已有作业开始改」：
   - 需要一个作业选择器。作业列表可读 `/api/teacher/homework-v2`（GET），或 `lib/service.js` 里 `listHomeworkViaRest` 的等价实现；若 GET 不可读，退回 PostgREST `homework` 表按 `class_id` 过滤。
   - 选中后调 `/homework/edit`，把返回的草稿**回填到表单**（标题、说明、截止时间、补交策略、公开/定向、题目与分值）。
2. `startEdit` 回填的草稿里已有 `existingHomeworkId`。**预演编译时**（`lib/plan.js` 的 `step3.homework` 分支）遇到 `existingHomeworkId` 要走 `PATCH /api/teacher/homework-v2/{id}` 而不是 `POST`，预演清单里那一步的描述要写「修改已发布的作业」而不是「发布课后作业」。
3. 撤回入口：在第④步看板或第③步作业卡片上，给已发布作业一个「撤回并软删」的入口，调用已有的 `service.deleteHomework()`。
4. 改完后补一条契约测试：`compilePlan` 遇到 `step3.homework.existingHomeworkId` 时，生成的步骤是 `PATCH /api/teacher/homework-v2/{id}`，且不生成 `POST`。

---

## 问题 7（测试）契约测试与新代码不同步

`test/contract.mjs:186-197` 的「任务链 PUT 字段与契约一致」用例断言的是**旧契约**（一次 PUT 提交 `{ tasks: [...] }`），而代码已经改成「每个任务一次 PUT、每次提交一个任务对象」。所以现在测试是 `27/28`，挂在这一条上。

**要求**：更新这条断言为新契约：
- 调用次数等于任务数（两个任务 → 两次 PUT）
- 每次请求体是一个任务对象：`{ class_id, course_id, task_type, stage, ref_id }`
- URL 都是 `/api/teach/course-lessons/{lessonId}/tasks`

并补三条新用例：
- 返回结构异常时（`data` 缺失）不抛 TypeError，而是走问题 1 的失败收集逻辑
- 只传学生版课件且无课程无课次时 `blocked` 非空
- `compilePlan` 遇到 `existingHomeworkId` 生成 PATCH 步骤

---

## 验收方式

改完后依次跑：

```bash
cd /Users/tongcheng/Documents/Codex/2026-11-05/task/comparison/dsh-economy/tiku-weekly
node test/contract.mjs          # 必须 全部通过
node test/dryrun-demo.mjs       # 必须正常输出步骤清单
for f in index.js client.js lib/*.js; do node --check "$f"; done   # 必须无语法错误
```

另外检查页面内联脚本仍能跑通（`lib/teacher-page.js` 里是 `String.raw` 模板 + `SCRIPT` 常量，渲染后取出 `<script>` 内容做 `node --check`）。

**汇报要求**：说明每个问题怎么修的、契约测试条数变化、以及哪些改动仍需在真实测试班级上联调确认。**不要**为了让测试通过而删断言或放宽断言。
