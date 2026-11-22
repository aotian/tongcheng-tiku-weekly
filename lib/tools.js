/**
 * Agent tools over the same `WeeklyService` the teacher UI uses.
 *
 * The tools add nothing of their own: they translate arguments, call the
 * service, and return a JSON result. Mutating tools are split into a preview
 * call and an execute call so a model cannot skip the teacher's confirmation.
 */

import { prepareSaturday } from './gesp.js';

const OBJECT_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
};

const STRING_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
};

function fail(error) {
  const payload = error && typeof error.toJSON === 'function' ? error.toJSON() : { message: String(error?.message ?? error) };
  return { ok: false, error: payload };
}

export function createTools(service) {
  const tools = [];

  tools.push({
    name: 'tiku_weekly_check_update',
    description: '检查每周课程插件版本及安装位置是否支持一键更新。',
    parameters: { type: 'object', properties: {} },
    output: OBJECT_OUTPUT,
    async execute() {
      try { return { ok: true, ...(await service.updater.check()) }; }
      catch (error) { return fail(error); }
    },
  });

  tools.push({
    name: 'tiku_weekly_status',
    description: '查看童澄教师登录状态、角色与是否具备发布权限。不返回令牌。',
    parameters: { type: 'object', properties: {} },
    output: OBJECT_OUTPUT,
    async execute() {
      try {
        return { ok: true, ...(await service.status()) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_classes',
    description: '列出当前老师可用班级（含是否过期、是否归属本人）。可管理范围由平台教师班级接口决定。',
    parameters: { type: 'object', properties: {} },
    output: OBJECT_OUTPUT,
    async execute() {
      try {
        return { ok: true, ...(await service.classes()) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_candidates',
    description: '按关键词读取某课次的随堂练习（lesson_sidebar）候选题，以及当前绑题状态。只返回接口给到的候选，不虚构题目。',
    parameters: {
      type: 'object',
      properties: {
        lessonId: { type: 'string', description: '课次 id' },
        classId: { type: 'string', description: '班级 id（用于权限与可见范围）' },
        courseId: { type: 'string', description: '课程 id' },
        keyword: { type: 'string', description: '题干关键词，可空' },
      },
      required: ['lessonId', 'classId', 'courseId'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.candidates(args ?? {})) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_chain_preview',
    description: '跨班复制任务链的差异预览（只读）。返回将复制/跳过/冲突清单与预览哈希；套用必须带回这个哈希。',
    parameters: {
      type: 'object',
      properties: {
        courseId: { type: 'string' },
        sourceClassId: { type: 'string' },
        targetClassId: { type: 'string' },
      },
      required: ['courseId', 'sourceClassId', 'targetClassId'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.previewChain(args ?? {})) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_draft',
    description:
      '写入本次发布草稿的某一节（step1 建课排课 / step2 课件 / step3 绑题作业考试任务链），并同步上下文（班级、课程、计划、课次）。只改草稿，不写童澄后台。',
    parameters: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: ['step1', 'step2', 'step3'], description: '草稿分节' },
        context: {
          type: 'object',
          description: '目标上下文：classId / courseId / planId / lessonId',
          properties: {
            classId: { type: 'string' },
            courseId: { type: 'string' },
            planId: { type: 'string' },
            lessonId: { type: 'string' },
          },
        },
        step1: { type: 'object', description: '建课/章节/课次/计划/跨班复制输入', additionalProperties: true },
        step2: { type: 'object', description: '课件输入（学生版、教师私有版、主题修改）', additionalProperties: true },
        step3: { type: 'object', description: '绑题、作业、考试、任务链、群卡片输入', additionalProperties: true },
      },
      required: ['section'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        const { section, ...rest } = args ?? {};
        if (!['step1', 'step2', 'step3'].includes(section)) {
          return { ok: false, error: { message: 'section 只能是 step1 / step2 / step3' } };
        }
        return { ok: true, ...(await service.putDraftSection(section, rest)) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_dry_run',
    description:
      '发布前预演：把当前草稿编译成待执行步骤清单（含每步请求体、被拦截项），不写库。执行前必须先把这份清单给老师确认。',
    parameters: { type: 'object', properties: {} },
    output: OBJECT_OUTPUT,
    async execute() {
      try {
        return { ok: true, ...(await service.dryRun()) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_execute',
    description:
      '执行一次已预演的批次（会真实写入童澄后台）。老师明确确认后才能调用；被拦截的批次会被拒绝。',
    parameters: {
      type: 'object',
      properties: { batchId: { type: 'string', description: 'tiku_weekly_dry_run 返回的批次 id' } },
      required: ['batchId'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.execute(args?.batchId)) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_retry',
    description: '单步重试一次失败或等待中的步骤，不重跑整批。',
    parameters: {
      type: 'object',
      properties: {
        batchId: { type: 'string' },
        stepId: { type: 'string', description: '步骤 id，例如 course.create、homework.create' },
      },
      required: ['batchId', 'stepId'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.retry(args?.batchId, args?.stepId)) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_undo',
    description: '撤回一个已成功步骤：随堂绑题、任务链、作业 v2 软删、群卡片撤回。其它步骤没有撤回接口。',
    parameters: {
      type: 'object',
      properties: { batchId: { type: 'string' }, stepId: { type: 'string' } },
      required: ['batchId', 'stepId'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.undo(args?.batchId, args?.stepId)) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_page',
    description: '返回可视化向导页面的地址。老师要在 DSH 里点开就会用这个页。',
    parameters: { type: 'object', properties: {} },
    output: STRING_OUTPUT,
    async execute() {
      return '可视化向导：打开 DSH 侧边栏的「每周课程」入口，或访问本机 Host 的 /tiku-weekly 路径。';
    },
  });

  tools.push({
    name: 'tiku_weekly_gesp', description: '二阶班续课：读取技能、交接、班籍、近期个人 OJ、已有作业和课程；keyword 检索真实 OJ 候选。',
    parameters: {type:'object', properties:{classId:{type:'string'},keyword:{type:'string'}}}, output:OBJECT_OUTPUT,
    async execute(args) { try { return await prepareSaturday(service,args || {}); } catch(e) { return fail(e); } },
  }, {
    name:'tiku_weekly_cards', description:'读取或保存单个学生的六题备课卡草稿。修改一题时读取当前版本并提交完整六题；班级必须一致。仅预演。',
    parameters:{type:'object',properties:{classId:{type:'string'}, studentId:{type:'string'}, revision:{type:'integer'}, lesson:{type:'string'}, questions:{type:'array',items:{type:'object',properties:{id:{type:'string'},title:{type:'string'},reason:{type:'string'}},required:['id','title','reason']}}}},output:OBJECT_OUTPUT,
    async execute(args) { try { return await service.lessonCards(args || {}); } catch(e) { return fail(e); } },
  }, {
    name:'tiku_weekly_card_preview',description:'从一张已审核的分层题单生成单生定向作业和课中任务预演。目标班及学生须单独指定；不会推群消息。',
    parameters:{type:'object',properties:Object.fromEntries(['sourceClassId','sourceStudentId','classId','studentId','courseId','lessonId','title','dueDate','revision'].map(k=>[k,{type:k==='revision'?'integer':'string'}])),required:['sourceClassId','sourceStudentId','classId','studentId','courseId','lessonId','title','dueDate','revision']},output:OBJECT_OUTPUT,
    async execute(args){try{return await service.prepareCard(args)}catch(e){return fail(e)}},
  },{
    name:'tiku_weekly_edit_homework', description:'按已核实的班级和作业读取原作业到共享草稿，修改后先预演 PATCH。',parameters:{type:'object',properties:{homeworkId:{type:'string'},classId:{type:'string'}},required:['homeworkId','classId']},output:OBJECT_OUTPUT,
    async execute(args){try{return await service.startEdit(args)}catch(e){return fail(e)}},
  });

  // ── paper intake & single-student targeted homework tools ───────────────

  tools.push({
    name: 'tiku_weekly_paper_ingest',
    description: '接收原卷（文本 PDF、扫描 PDF、单张或多张图片本地路径/URL）生成可编辑校卷草稿，不写正式题库。与界面共享同一草稿 ID。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '试卷与定向作业标题，如《分数运算专项练习》' },
        subject: { type: 'string', description: '学科，默认 math' },
        classId: { type: 'string', description: '目标班级 UUID' },
        studentName: { type: 'string', description: '目标学生姓名或称呼（如“张同学”）' },
        dueDate: { type: 'string', description: '截止时间 ISO 字符串' },
        targetKnowledgeId: { type: 'string', description: '题库目标知识点/章节 ID（新建题目入库时必填）' },
        files: {
          type: 'array',
          description: '原卷文件列表，每项提供 localPath 或 url（可选 fileName / mimeType）',
          items: {
            type: 'object',
            properties: {
              localPath: { type: 'string' },
              url: { type: 'string' },
              fileName: { type: 'string' },
              mimeType: { type: 'string' },
            },
          },
        },
        textContent: { type: 'string', description: '若无文件，可直接提供原卷纯文本' },
      },
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.paperIngest(args ?? {})) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_paper_get',
    description: '读取当前活跃的原卷校对草稿（与可视化面板实时共享同一版本），可按题号查看最新文案、配图、标记与收件人状态。',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: '可选草稿 ID，不填则读取当前活跃草稿' },
        questionNumber: { type: 'integer', description: '可选，只看第 N 题（从 1 开始）' },
      },
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        const res = await service.paperGet(args?.draftId ?? null);
        if (res.draft && Number.isInteger(Number(args?.questionNumber))) {
          const idx = Number(args.questionNumber) - 1;
          return {
            ok: true,
            draftId: res.draft.id,
            revision: res.draft.revision,
            title: res.draft.title,
            questionNumber: Number(args.questionNumber),
            question: res.draft.questions[idx] ?? null,
          };
        }
        return { ok: true, ...res };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_paper_student',
    description: '按班级与姓名精确匹配单个学生（重名时返回候选名单供老师选择），或设置试卷标题/截止时间/知识点等元信息。',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        classId: { type: 'string' },
        studentName: { type: 'string' },
        studentId: { type: 'string', description: '重名消歧时传入明确选中的学生 UUID' },
        title: { type: 'string' },
        dueDate: { type: 'string' },
        targetKnowledgeId: { type: 'string' },
      },
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        const a = args ?? {};
        if (a.title !== undefined || a.dueDate !== undefined || a.targetKnowledgeId !== undefined) {
          await service.paperUpdateMeta({
            draftId: a.draftId,
            ...(a.title !== undefined ? { title: a.title } : {}),
            ...(a.dueDate !== undefined ? { dueDate: a.dueDate } : {}),
            ...(a.targetKnowledgeId !== undefined ? { targetKnowledgeId: a.targetKnowledgeId } : {}),
          });
        }
        if (a.classId || a.studentName || a.studentId) {
          return { ok: true, ...(await service.paperResolveStudent(a)) };
        }
        return { ok: true, ...(await service.paperGet(a.draftId ?? null)) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_paper_edit',
    description: '按题号修改共享草稿中的某道题（题干、选项、答案、解析、分值、配图或复用已有题 ID），面板与对话立刻看到同一版本。',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        questionNumber: { type: 'integer', description: '题号（从 1 开始）' },
        questionId: { type: 'string' },
        patch: {
          type: 'object',
          description: '要更新的字段：content / options / correct_option / analysis / score / images / reuseQuestionId / needsReview',
          additionalProperties: true,
        },
      },
      required: ['patch'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.paperEditQuestion(args ?? {})) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_paper_split',
    description: '把识别粘连在一起的一道题拆成两道题。',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        questionNumber: { type: 'integer' },
        splitIndex: { type: 'integer' },
        secondContent: { type: 'string', description: '拆出作为第二题的题干文本' },
      },
      required: ['questionNumber'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.paperSplitQuestion(args ?? {})) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_paper_merge',
    description: '把错切的两道题合并为一道题（同时合并配图与小问）。',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        firstNumber: { type: 'integer' },
        secondNumber: { type: 'integer' },
      },
      required: ['firstNumber', 'secondNumber'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.paperMergeQuestions(args ?? {})) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_paper_preview',
    description: '单生定向发布前预演：展示试卷标题、题数、班级、学生姓名与「接收人数：1」，不写入正式题库或发布作业。',
    parameters: {
      type: 'object',
      properties: { draftId: { type: 'string' } },
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.paperPreview(args?.draftId ?? null)) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_paper_execute',
    description: '老师明确确认后执行：新题入库 -> 创建仅留存的正式试卷（不发考试）-> 按原题顺序发布单生定向作业。支持中断续做与幂等防重。',
    parameters: {
      type: 'object',
      properties: { draftId: { type: 'string' } },
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.paperExecute(args?.draftId ?? null)) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_courseware_templates',
    description: '列出插件内置的童澄全科统一课件模板 v2.1（含新概念英语 2、数学、化学、英语、语文精读、Python 创造课）及双端隔离规范。',
    parameters: { type: 'object', properties: {} },
    output: OBJECT_OUTPUT,
    async execute() {
      try {
        return { ok: true, ...service.coursewarePresets() };
      } catch (error) {
        return fail(error);
      }
    },
  });

  tools.push({
    name: 'tiku_weekly_courseware_generate',
    description: '按童澄全科统一课件模板 v2.1（童澄橙主视觉 + 官方取正无 TM Logo + 师生双端隔离）一键生成学生自学版与教师讲课版双版单文件 HTML，并自动填入第 ② 步草稿以便预演上传。不直接上传平台。',
    parameters: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          description: '学科模板：nce（新概念英语2）/ math / chem / eng / chn / python',
        },
        title: { type: 'string', description: '本讲标题，如 Lesson 84 · On strike' },
        headerTitle: { type: 'string', description: '顶栏显示标题，如 新概念英语 2 · Lesson 84 On strike' },
        coverGoal: { type: 'string', description: '本课学习目标' },
        topicName: { type: 'string', description: '写入平台课件主题 topics.name 的名称' },
        category: { type: 'string', description: '课件分类（如 英语 / 数学 / 信息科技）' },
        lessonLabel: { type: 'string', description: '封面徽章标签，如 nce2 / lesson-84' },
        words: {
          type: 'array',
          description: '英语/新概念翻面词卡：[{ emoji, en, ph, cn }]',
          items: { type: 'object', additionalProperties: true },
        },
        reciteLines: {
          type: 'array',
          description: '新概念 L0-L3 四级渐隐背诵句：[{ full, cn, blanks1, blanks2, lead }]',
          items: { type: 'object', additionalProperties: true },
        },
        sentences: {
          type: 'array',
          description: '英语句型精读：[{ en, cn, note }]',
          items: { type: 'object', additionalProperties: true },
        },
        segments: {
          type: 'array',
          description: '语文点词精注段落：[{ text } | { word, pinyin, meaning, note }]',
          items: { type: 'object', additionalProperties: true },
        },
        formula: { type: 'string', description: '数学/化学 KaTeX 核心公式' },
        points: { type: 'array', items: { type: 'string' }, description: '核心要点列表' },
        pitfall: { type: 'string', description: '高频易错提醒' },
        example: { type: 'object', description: '典型例题：{ title, problem, steps: [{ label, text }] }', additionalProperties: true },
        code: { type: 'string', description: 'Python PRIMM 预测代码' },
        quickCheck: { type: 'object', description: '随堂不计分自检题：{ title, question, options, answer, explain }', additionalProperties: true },
        entranceExam: { type: 'object', description: '仅教师版可见的进门考讲评页', additionalProperties: true },
        exitExam: { type: 'object', description: '仅教师版可见的出门清收口页', additionalProperties: true },
        context: {
          type: 'object',
          description: '同步写入草稿的上下文（classId / courseId / planId / lessonId）',
          additionalProperties: true,
        },
        saveToDraft: { type: 'boolean', description: '默认 true，生成后直接填入第 ② 步双版上传草稿' },
      },
      required: ['preset', 'title'],
    },
    output: OBJECT_OUTPUT,
    async execute(args) {
      try {
        return { ok: true, ...(await service.generateCoursewareV2(args ?? {})) };
      } catch (error) {
        return fail(error);
      }
    },
  });

  return tools;
}
