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
  return tools;
}
