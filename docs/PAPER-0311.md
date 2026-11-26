# 0.3.11 原卷复用与定向作业

先部署同分支 AI-practice 后端，再发布插件。EDU 服务凭据由 Tiku 后端持有，教师使用原有 DSH 会话。旧草稿可直接打开，原有题号、配图、执行记录和小问 reference_answer 继续有效。旧卷可用 paper_student 的 totalScore 补录预期总分；缺省时预检展示逐题求和。

## 易柠君老师的 Windows 验收

1. 更新源提供 0.3.11 后，在每周课程插件检查更新、应用更新，重启 DSH 并核对版本。用原教师账号打开《闵行一模数学卷》草稿，设置预期总分 150。
2. 在对话中说「先按数学、九年级、分类 26 一模试卷 查题库，再查 EDU 的闵行一模并预览到第 25 题」。Tiku 分类按知识树节点名及子节点检索，EDU 用卷名关键词。若 25 题均已入 Tiku，直接使用题库 ID；仅 EDU 有卷时，选择目标章节，预览并确认 questions 模式、保留查重。核对 failed 为 0，并保存有序的 question_ids 和逐题 question_matches。
3. 说「预览这 25 组绑定，按小问标签回填标准答案」。逐题核对低置信度项和第 14、23、25 题。需要换图时上传清晰原图，再按题号替换。题库复用只引用现有记录，草稿换图只改草稿；正式复用题自身的答案和图片也须通过预检。
4. 说「预检并预演，展示题数、总分和接收学生」。应显示 25 道复用、0 道新建、150 分、错误 0、接收人数 1。教师核实学生身份和截止时间后再确认执行，核对返回的存档卷 ID 和定向作业 ID。

## 工具参数

名称统一使用前缀 `tiku_weekly_`。

| 工具 | 用法 |
| --- | --- |
| edu_list / edu_preview | 列表支持 keyword、page、limit、status、type。按 assessmentId 预览整卷。 |
| edu_import | assessmentId、targetKnowledgeId 必填。默认预览，确认后传 confirm=true。mode 默认 exam，也支持 questions。duplicateCheck 默认 true，publish 默认 false。支持 title、description、duration、totalScore、scorePerQuestion。 |
| bank_search / bank_get | 按 subject、grade、category、keyword、fromNumber、toNumber、page、limit 查找。按 questionId 或 questionIds 获取题干、选项、标准答案、小问、来源与配图。历史行缺少原题号或分值时返回 null，题号区间仅包含有原题号的记录。 |
| paper_bind | bindings 每项含 questionNumber（草稿顺序，从 1 起）、bankQuestionId。dryRun=true 查看依据。overwriteAnswers=true 按相同且唯一的小问 label 回填。低置信度须核对后传 confirmLowConfidence=true。 |
| paper_image_upload / paper_set_images | 上传传 path 或 url，使用返回的 HTTPS URL。替换传 questionNumbers、images 和可选 oldUrl。remainingReferences 统计整份草稿，questionImageReferences 仅统计题目配图。原始页图仍可作为来源引用。 |
| paper_preflight / paper_execute | 前者只读，后者在写入前重复检查。共享图片超过 3 题提示核对。422 问题保留教师可识别的题号和字段。 |

新错误码：BANK_NOT_FOUND（题目不存在或不可见）、BANK_AUTH_FAILED（会话或教师权限无效）、BIND_CONFIDENCE_LOW（需核对匹配）、IMAGE_TOO_SMALL（尺寸或字节数过小）、IMAGE_UNREACHABLE（无法取得有效图片）、PREFLIGHT_BLOCKED（卷面预检有错误）。

题目配图默认要求宽高各至少 200 px、至少 80,000 像素且位图至少 2,048 字节；支持原 QUESTION_IMAGE_MIN_WIDTH / HEIGHT / PIXELS / BYTES 环境变量。预检与提交共享服务端实际配置。尺寸检查无法判断图中文字是否可辨，老师仍应按原图核对细线和标注。
