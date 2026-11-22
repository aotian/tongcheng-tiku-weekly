/**
 * Dry-run planning.
 *
 * A plan is a pure compile step: same inputs in, same step list out, no
 * network calls and no writes. The runner executes the same step list, so
 * what the teacher previews is what will run — including the exact request
 * bodies, which the preview shows key by key.
 */

import {requestJson} from './http.js';
import {
  addLesson, applyClassTaskChainCopy, bindCourseToClass, buildHomeworkBody, buildQuestionRefs,
  buildTaskChain, buildExamBody, changeBindingState, changeGroupTaskDue, changeTaskChainState,
  createChapter, createClass, createCourse, createExam, createExamQuestions, createHomeworkV2,
  createPlan, createTopic, deleteHomeworkV2, patchTopic, pushGroupTask, saveBindingDraft,
  saveTaskChainDraft, setCourseStatus, updateHomeworkV2, uploadStudentCourseware,
  uploadTeacherCourseware, withdrawGroupTask, sbBase,
} from './api.js';

/** Stable step ids; the UI shows them and retry/withdraw key off them. */
export const STEP_ORDER = [
  'course.create',
  'course.status',
  'chapter.create',
  'class.create',
  'class_course.bind',
  'plan.create',
  'chain.apply',
  'lesson.add',
  'courseware.student',
  'courseware.student.topic',
  'courseware.teacher',
  'topic.patch',
  'binding.save',
  'binding.publish',
  'exam.create',
  'exam.questions',
  'homework.create',
  'tasks.save',
  'tasks.publish',
  'chat.push',
  'chat.due',
];

/** Markers for ids that an earlier step in the same batch will create. */
const DEPENDS_ON_COURSE_CREATE = '@course.create';
const DEPENDS_ON_TOPIC_CREATE = '@courseware.student.topic';
const DEPENDS_ON_LESSON = '@lesson.add';
const DEPENDS_ON_CHAPTER_CREATE = '@chapter.create';

const STEP_LABELS = {
  'course.create': '创建课程',
  'course.status': '课程上下架',
  'chapter.create': '创建章节',
  'class.create': '创建班级',
  'class_course.bind': '课程挂到班级',
  'plan.create': '复制/新建教学计划',
  'chain.apply': '跨班复制任务链',
  'lesson.add': '往章节追加课次',
  'courseware.student': '学生版课件上传 OSS',
  'courseware.student.topic': '写入课件主题',
  'courseware.teacher': '教师私有版课件上传',
  'topic.patch': '修改课件主题',
  'binding.save': '保存随堂绑题草稿',
  'binding.publish': '发布随堂绑题',
  'exam.create': '创建考试',
  'exam.questions': '写考试题目',
  'homework.update':'修改已发布作业',
  'homework.create': '创建课后作业',
  'tasks.save': '保存课次任务链',
  'tasks.publish': '发布课次任务链',
  'chat.push': '推送群任务卡片',
  'chat.due': '修改群卡片截止',
};

/** One plain-language line per step for the teacher-facing preview table. */
const STEP_WHAT_HAPPENS = {
  'course.create': '新建一门课程',
  'course.status': '把课程上架或改成草稿',
  'chapter.create': '在课程里新建一个章节',
  'class.create': '新建一个班级，归属当前老师',
  'class_course.bind': '把这门课挂到班级上',
  'plan.create': '新建或复制一份教学计划',
  'chain.apply': '把源班的任务链复制到目标班',
  'lesson.add': '在章节里加一节本周课',
  'courseware.student': '上传学生版课件',
  'courseware.student.topic': '把学生版课件登记成课件主题',
  'courseware.teacher': '上传教师私有版课件',
  'topic.patch': '修改已有课件主题',
  'binding.save': '保存随堂练习的题目',
  'binding.publish': '把随堂练习发到学生端',
  'exam.create': '新建一份考试',
  'exam.questions': '把题目放进考试',
  'homework.create': '发布课后作业',
  'tasks.save': '保存课次任务安排',
  'tasks.publish': '把任务安排发到学生端',
  'chat.push': '在班级群发一条任务卡片',
  'chat.due': '修改群卡片的截止时间',
};

/** Human-readable labels for the preview table. */
export function stepLabel(id) {
  return STEP_LABELS[id] ?? id;
}

/** Strip secrets from a request body before it reaches a preview or a log. */
function redact(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'content_base64') copy[key] = `（${String(value ?? '').length} 字符 base64，预览不展示）`;
    else copy[key] = value;
  }
  return copy;
}

/** A preview that reads well for both objects and arrays of rows. */
function previewOf(body) {
  if (Array.isArray(body)) {
    const rows = body.slice(0, 3).map((row) => jsonKeys(redact(row)));
    return { 行数: body.length, 前几行: rows };
  }
  return jsonKeys(redact(body));
}

function jsonKeys(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 1) return value;
  if (Array.isArray(value)) return value.slice(0, 3).map((item) => jsonKeys(item, depth + 1));
  const out = {};
  for (const [key, inner] of Object.entries(value)) out[key] = jsonKeys(inner, depth + 1);
  return out;
}

/**
 * @typedef {object} PlanStep
 * @property {string} id - one of STEP_ORDER
 * @property {string} title - Chinese label
 * @property {'write'|'upload'} kind
 * @property {string} method - HTTP method the runner will use
 * @property {string} endpoint - safe endpoint (host + pathname, no query)
 * @property {object} body - redacted request body
 * @property {object} meta - extra facts for the UI table
 */

/**
 * Compile one weekly batch into steps.
 *
 * @param {object} input
 * @param {string} input.teacherId - signed-in uid
 * @param {object} input.context - `{ classId, courseId, planId, lessonId }`
 * @param {object} input.step1 - course/chapter/lesson/plan/cross-class inputs
 * @param {object} input.step2 - courseware inputs
 * @param {object} input.step3 - binding/homework/exam/task chain inputs
 * @param {string} input.host - API host used only for display
 * @returns {{ steps: PlanStep[], warnings: string[], blocked: { id: string, reason: string }[] }}
 */
export function compilePlan(input) {
  const { teacherId, context = {}, step1 = {}, step2 = {}, step3 = {}, host = '' } = input;
  const steps = [];
  const warnings = [];
  const blocked = [];

  // The plan keeps the real body for execution and a redacted copy for display,
  // so a preview and the actual run can never drift apart.
  const add = (id, kind, method, pathname, body, meta = {}) => {
    steps.push({
      id,
      title: stepLabel(id),
      kind,
      method,
      endpoint: `${host}${pathname}`,
      pathname,
      body,
      preview: previewOf(body),
      // `whatHappens` is the one line a teacher reads; the endpoint and body
      // stay available under "技术细节" for the rare debugging case.
      whatHappens: STEP_WHAT_HAPPENS[id] ?? stepLabel(id),
      meta,
    });
  };

  const lessonId = context.lessonId ?? null;
  const classId = context.classId ?? null;
  const courseId = context.courseId ?? null;

  // ── Step 1 ──────────────────────────────────────────────────────────────
  if (step1.mode === 'new-course' || step1.createCourse) {
    if (!step1.courseTitle) blocked.push({ id: 'course.create', reason: '请填写课程标题' });
    else {
      add('course.create', 'write', 'POST', '/sb/rest/v1/courses', {
        title: step1.courseTitle,
        category_id: step1.categoryId ?? null,
        python_lab_enabled: false,
      }, { note: '课程归属当前登录账号' });
    }
  }
  if (step1.courseStatus) {
    add('course.status', 'write', 'PATCH', `/sb/rest/v1/courses?id=eq.${courseId ?? '<courseId>'}`, {
      status: step1.courseStatus,
    });
  }
  // A step that depends on an id created earlier in the same batch never gets a
  // fabricated value: it says which earlier step supplies it, and the runner
  // fills the real id in. Nothing is written with a placeholder.
  const needsCourse = !courseId;
  if (step1.chapterTitle) {
    add('chapter.create', 'write', 'POST', '/sb/rest/v1/chapters', {
      course_id: needsCourse ? DEPENDS_ON_COURSE_CREATE : courseId,
      title: step1.chapterTitle,
      order_no: Number(step1.chapterOrderNo ?? 1),
      ...(context.planId ? { plan_id: context.planId } : {}),
    }, needsCourse ? { dependsOn: 'course.create', note: '课程 ID 由上一步「创建课程」提供' } : {});
  }
  if (step1.newClass) {
    add('class.create', 'write', 'POST', '/sb/rest/v1/classes', {
      name: step1.newClass.name,
      teacher_id: teacherId,
      ...(step1.newClass.expiresAt ? { expires_at: step1.newClass.expiresAt } : {}),
    }, { note: 'teacher_id 固定写入当前登录账号' });
  }
  if (step1.bindCourseToClass) {
    add('class_course.bind', 'write', 'POST', '/sb/rest/v1/class_courses', {
      class_id: step1.bindCourseToClass.classId ?? classId ?? '<classId>',
      course_id: step1.bindCourseToClass.courseId ?? courseId ?? '<courseId>',
      ...(context.planId ? { plan_id: context.planId } : {}),
    });
  }
  if (step1.plan?.name) {
    add('plan.create', 'write', 'POST', `/api/teach/courses/${courseId ?? '<courseId>'}/plans`, {
      name: step1.plan.name,
      copy_from_plan_id: step1.plan.copyFromPlanId ?? undefined,
    });
  }
  if (step1.chainCopy) {
    const chain = step1.chainCopy;
    if (!chain.expectedPreviewHash) {
      blocked.push({
        id: 'chain.apply',
        reason: '跨班复制必须先点「预览差异」拿到 expected_preview_hash，不能跳过预览直接套用',
      });
    } else if (!chain.sourceClassId || !chain.targetClassId) {
      blocked.push({ id: 'chain.apply', reason: '请选择源班和目标班' });
    } else {
      add('chain.apply', 'write', 'POST', `/api/teach/courses/${courseId ?? DEPENDS_ON_COURSE_CREATE}/class-task-chain/apply`, {
        source_class_id: chain.sourceClassId,
        target_class_id: chain.targetClassId,
        copy_bindings: Boolean(chain.copyBindings),
        copy_feedback: Boolean(chain.copyFeedback),
        expected_preview_hash: chain.expectedPreviewHash,
      });
    }
  }
  if (step1.addLesson) {
    // A chapter created in this same batch has no id yet; the lesson follows it.
    const chapterFromBatch = Boolean(step1.chapterTitle);
    if (!step1.addLesson.chapterId && !chapterFromBatch) {
      blocked.push({ id: 'lesson.add', reason: '还没有可用的章节：请在第①步填章节标题，或从「追加到哪个章节」里选一个' });
    } else if (courseId === null && !step1.chapterTitle) {
      blocked.push({ id: 'lesson.add', reason: '找不到课次所属的课程，请先选课程或新建课程' });
    } else {
      // A brand-new chapter has no id until `chapter.create` runs, so the
      // preview names that dependency and the runner injects the real id.
      const chapterId = chapterFromBatch ? DEPENDS_ON_CHAPTER_CREATE : step1.addLesson.chapterId;
      add('lesson.add', 'write', 'POST', '/api/teach-admin?action=add-lesson', {
        chapterId,
        topicId: step1.addLesson.topicId,
        title: step1.addLesson.title,
      }, chapterId === DEPENDS_ON_CHAPTER_CREATE
        ? { dependsOn: 'chapter.create', note: '章节由上一步「创建章节」提供' }
        : {});
    }
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────
  if (step2.student) {
    add('courseware.student', 'upload', 'POST', '/api/upload/sign → OSS PostObject', {
      purpose: 'course-asset',
      fileName: step2.student.fileName,
      contentType: step2.student.contentType,
      size: step2.student.size,
    }, { note: '签名后 multipart 直传 OSS，fields 在前、file 在后' });
    add('courseware.student.topic', 'write', 'POST', '/sb/rest/v1/topics', {
      name: step2.student.topicName ?? step2.student.fileName,
      category: step2.student.category ?? null,
      html_url: '<上一步返回的 public_url>',
      html_visible_to_students: step2.student.htmlVisibleToStudents !== false,
      resource_meta: { source: 'tiku-weekly', uploadedFileName: step2.student.fileName },
    });
  }
  if (step2.teacher) {
    const teacherTopicId = step2.teacher.topicId ?? (step2.student ? DEPENDS_ON_TOPIC_CREATE : null);
    if (!teacherTopicId) {
      blocked.push({
        id: 'courseware.teacher',
        reason: '教师私有版需要一个课件主题：先上传学生版（会自动新建主题），或选择一个已有课件',
      });
    }
    if (step2.teacher.size > 3 * 1024 * 1024) {
      blocked.push({ id: 'courseware.teacher', reason: '教师私有版课件不能超过 3MB' });
    } else {
      add('courseware.teacher', 'upload', 'POST', '/api/teach-admin?action=courseware-upload', {
        course_id: needsCourse ? DEPENDS_ON_COURSE_CREATE : courseId,
        lesson_id: lessonId ?? DEPENDS_ON_LESSON,
        topic_id: teacherTopicId === DEPENDS_ON_TOPIC_CREATE ? teacherTopicId : String(teacherTopicId),
        file_name: step2.teacher.fileName,
        content_base64: `<${step2.teacher.size} 字节 base64>`,
      }, {
        note: teacherTopicId === DEPENDS_ON_TOPIC_CREATE ? '自动挂到本次新建的课件主题' : '挂到选中的已有课件',
        dependsOn: teacherTopicId === DEPENDS_ON_TOPIC_CREATE ? 'courseware.student.topic' : undefined,
      });
    }
  }
  if (step2.topicPatch) {
    add('topic.patch', 'write', 'PATCH', `/sb/rest/v1/topics?id=eq.${step2.topicPatch.topicId ?? '<topicId>'}`, {
      ...step2.topicPatch.patch,
    });
  }

  // ── Step 3a: lesson_sidebar binding ─────────────────────────────────────
  if (step3.binding?.questions?.length) {
    const questionRefs = buildQuestionRefs({
      subject: step3.binding.subject,
      questions: step3.binding.questions,
      candidateIds: step3.binding.candidateIds,
    });
    const resourceTopicId = step3.binding.resourceTopicId ?? step1.addLesson?.topicId ?? (step2.student ? DEPENDS_ON_TOPIC_CREATE : null);
    const validTopic = resourceTopicId === DEPENDS_ON_TOPIC_CREATE || (Number.isSafeInteger(Number(resourceTopicId)) && Number(resourceTopicId) > 0);
    if (!lessonId) blocked.push({ id: 'binding.save', reason: '随堂绑题要先在第①步创建课次，并选中它' });
    else if (!validTopic) blocked.push({ id: 'binding.save', reason: '随堂绑题必须选择有效课件（resource_topic_id 正整数）' });
    else add('binding.save', 'write', 'PUT', `/api/teach/course-lessons/${lessonId}/binding`, {
      class_id: classId, course_id: courseId, resource_topic_id: resourceTopicId, question_refs: questionRefs,
    }, { note: '存在已发布绑题时必须先撤回再改' });
    if (step3.binding.publish && lessonId && validTopic) {
      add('binding.publish', 'write', 'POST', `/api/teach/course-lessons/${lessonId}/binding`, {
        class_id: classId, course_id: courseId, action: 'publish',
      });
    }
  }

  // ── Step 3c: exam ───────────────────────────────────────────────────────
  let examId = step3.exam?.existingExamId ?? null;
  if (step3.exam && !step3.exam.existingExamId) {
    const compiled = buildExamBody(step3.exam, teacherId);
    examId = '<examId>';
    add('exam.create', 'write', 'POST', '/sb/rest/v1/exams', compiled.exam, {
      note: `共 ${compiled.exam.question_count} 题，总分 ${compiled.exam.total_score}`,
    });
    add('exam.questions', 'write', 'POST', '/sb/rest/v1/exam_questions', compiled.questions.map((row) => ({
      exam_id: '<上一步返回的 exam id>',
      ...row,
    })));
  }

  // ── Step 3b: homework v2 ────────────────────────────────────────────────
  let homeworkId = step3.homework?.existingHomeworkId ?? null;
  if (step3.homework?.existingHomeworkId) {
    add('homework.update','write','PATCH','/api/teacher/homework-v2/'+homeworkId,buildHomeworkBody({...step3.homework,classId}));
  } else if (step3.homework) {
    const body = buildHomeworkBody({ ...step3.homework, classId: step3.homework.classId ?? classId });
    homeworkId = '<homeworkId>';
    const total = body.items.reduce((sum, item) => sum + item.score, 0);
    add('homework.create', 'write', 'POST', '/api/teacher/homework-v2', body, {
      note: `共 ${body.items.length} 题，总分 ${total}`,
    });
  }

  // ── Step 3d: task chain ─────────────────────────────────────────────────
  if (step3.tasks?.length) {
    // A task may point at the exam/homework created earlier in this same batch,
    // so `refId: null` is resolved to a preview placeholder, never to a random id.
    const tasksForThisBatch = step3.tasks.map((task) => ({
      ...task,
      refId: task.refId ?? (task.taskType === 'exam' ? (examId ?? undefined) : task.taskType === 'homework' ? (homeworkId ?? undefined) : undefined),
    }));
    const normalized = buildTaskChain({ classId, courseId, tasks: tasksForThisBatch });
    if (!lessonId) blocked.push({ id: 'tasks.save', reason: '任务链要挂在课次上，先在第①步创建并选中课次' });
    else add('tasks.save', 'write', 'PUT', `/api/teach/course-lessons/${lessonId}/tasks`, {
      tasks: normalized,
    }, { note: `阶段：${[...new Set(normalized.map((t) => t.stage))].join(' / ')}` });
    if (lessonId) add('tasks.publish', 'write', 'POST', `/api/teach/course-lessons/${lessonId}/tasks`, {
      action: 'publish',
    });
  }

  // ── Step 3e: group chat card (optional) ─────────────────────────────────
  // The card is pushed before new homework/exam rows exist, so it must point at
  // an existing id the teacher supplied; a null ref is a blocking error, never
  // a guess.
  if (step3.chat?.groupId) {
    const chat = step3.chat;
    if (!chat.clientMsgId) {
      chat.clientMsgId = `tiku-weekly-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const kind = chat.kind ?? (chat.refId ? 'exam' : 'homework');
    const refId = chat.refId ?? null;
    if (kind !== 'exam' && kind !== 'homework') {
      blocked.push({ id: 'chat.push', reason: '向导一次只推送 homework / exam 两种群卡片；打卡和 OJ 请单独操作' });
    } else if (!refId) {
      blocked.push({
        id: 'chat.push',
        reason: '推送群卡片需要已存在的作业或考试 ID；本批次新建的作业/考试还没 ID，请先发布一次再推送，或填已有 ID',
      });
    } else {
      // The id is fixed at preview time, so a retry of the push re-sends the
      // same id and the backend can drop the duplicate instead of double posting.
      add('chat.push', 'write', 'POST', `/api/teacher/chat/groups/${chat.groupId}/tasks`, {
        kind,
        [kind === 'exam' ? 'exam_id' : 'homework_id']: refId,
        note: chat.note ?? '',
        client_msg_id: chat.clientMsgId,
      });
    }
    if (chat.dueDate) warnings.push('群卡片改截止会在推送之后单独执行，失败不影响已发布内容。');
  }

  if (steps.length === 0 && blocked.length === 0) {
    warnings.push('还没有任何可执行步骤：请至少完成一步配置。');
  }
  const digest = {
    step1: step1.courseTitle || step1.chapterTitle || step1.addLesson || step1.plan || step1.chainCopy ? '已填写' : '未填写',
    step2: step2.student || step2.teacher || step2.topicPatch ? `${step2.student ? 1 : 0} 个学生版文件，${step2.teacher ? 1 : 0} 个教师版文件` : '未上传',
    step3: [
      step3.binding?.questions?.length ? `随堂 ${step3.binding.questions.length} 题` : null,
      step3.homework ? '1 份作业' : null,
      step3.exam ? '1 份考试' : null,
      step3.tasks?.length ? `任务链 ${step3.tasks.length} 项` : null,
      step3.chat?.groupId ? '群卡片 1 条' : null,
    ].filter(Boolean).join('，') || '未填写',
  };
  return { steps, warnings, blocked, digest };
}

/**
 * Which steps can be undone, and with which endpoint.
 * A step without an entry here is not undoable and the UI says so.
 */
export function undoFor(step, context) {
  const classId = context.classId ?? '<classId>';
  const courseId = context.courseId ?? '<courseId>';
  const lessonId = context.lessonId ?? '<lessonId>';
  switch (step.id) {
    case 'binding.publish':
      return {
        label: '撤回随堂绑题',
        run: (host, token) => changeBindingState(host, token, { lessonId, classId, courseId, action: 'withdraw' }),
      };
    case 'tasks.publish':
      return {
        label: '撤回任务链',
        run: (host, token) => changeTaskChainState(host, token, { lessonId, classId, courseId, action: 'withdraw' }),
      };
    case 'homework.create':
      return {
        label: '软删除作业',
        needsResult: true,
        run: (host, token, result) => deleteHomeworkV2(host, token, result.id),
      };
    case 'chat.push':
      return {
        label: '撤回群卡片',
        needsResult: true,
        run: (host, token, result) => withdrawGroupTask(host, token, result.id ?? result.postId),
      };
    default:
      return null;
  }
}

/** Dispatch one compiled step to its single API function. */
/**
 * Replace an `@step.id` dependency marker with the id that step really returned.
 * A marker that cannot be resolved throws instead of sending a placeholder.
 */
function resolveId(value, resolved, stepTitle) {
  if (typeof value !== 'string' || !value.startsWith('@')) return value;
  const key = value.slice(1);
  const map = {
    'course.create': resolved.courseId,
    'chapter.create': resolved.chapterId,
    'lesson.add': resolved.lessonId,
    'courseware.student.topic': resolved.topicId,
  };
  const id = map[key];
  if (!id) throw new Error(`「${stepTitle}」需要上一步的结果，但那一步还没有成功，请先重试上一步`);
  return id;
}

const pendingHomework = new Set();
export async function runStep(step, ctx) {
  const { host, token, teacherId, context, step1, step2, step3, resolved } = ctx;
  const courseId = resolved.courseId ?? context.courseId;
  const classId = resolved.classId ?? context.classId;
  const lessonId = resolved.lessonId ?? context.lessonId;
  const planId = resolved.planId ?? context.planId;

  switch (step.id) {
    case 'course.create': {
      const row = await createCourse(host, token, { title: step1.courseTitle, categoryId: step1.categoryId });
      return { id: row?.id ?? null, link: null };
    }
    case 'course.status': {
      const row = await setCourseStatus(host, token, courseId, step1.courseStatus);
      return { id: row?.id ?? courseId, link: null };
    }
    case 'chapter.create': {
      const row = await createChapter(host, token, {
        courseId: resolveId(step.body.course_id, resolved, step.title),
        title: step1.chapterTitle,
        orderNo: step1.chapterOrderNo ?? 1,
        planId,
      });
      return { id: row?.id ?? null, link: null };
    }
    case 'class.create': {
      const row = await createClass(host, token, {
        name: step1.newClass.name, teacherId, expiresAt: step1.newClass.expiresAt,
      });
      return { id: row?.id ?? null, link: null };
    }
    case 'class_course.bind': {
      const row = await bindCourseToClass(host, token, {
        classId: step1.bindCourseToClass.classId ?? classId,
        courseId: step1.bindCourseToClass.courseId ?? courseId,
        planId,
      });
      return { id: row?.class_id ?? null, link: null };
    }
    case 'plan.create': {
      const payload = await createPlan(host, token, courseId, step1.plan);
      return { id: payload?.id ?? payload?.plan?.id ?? null, link: null };
    }
    case 'chain.apply': {
      const payload = await applyClassTaskChainCopy(host, token, courseId, step1.chainCopy);
      return { id: null, link: null, payload };
    }
    case 'lesson.add': {
      const lessonInput = { ...step1.addLesson, chapterId: resolveId(step.body.chapterId, resolved, step.title) };
      const payload = await addLesson(host, token, lessonInput);
      const id = payload?.data?.[0]?.id ?? payload?.lesson?.id ?? payload?.id ?? payload?.lesson_id ?? null;
      resolved.lessonId = id;
      return { id, link: null, payload };
    }
    case 'courseware.student': {
      const uploaded = await uploadStudentCourseware(host, token, step2.student.file);
      resolved.publicUrl = uploaded.publicUrl;
      return { id: uploaded.key ?? null, link: uploaded.publicUrl };
    }
    case 'courseware.student.topic': {
      const row = await createTopic(host, token, {
        name: step2.student.topicName ?? step2.student.fileName,
        category: step2.student.category,
        htmlUrl: resolved.publicUrl,
        type: "html",
        resourceType: "html",
        htmlVisibleToStudents: step2.student.htmlVisibleToStudents !== false,
        resourceMeta: { source: 'tiku-weekly', uploadedFileName: step2.student.fileName },
      });
      resolved.topicId = row?.id ?? null;
      return { id: row?.id ?? null, link: resolved.publicUrl ?? null };
    }
    case 'courseware.teacher': {
      const payload = await uploadTeacherCourseware(host, token, {
        courseId: resolveId(step.body.course_id, resolved, step.title),
        lessonId: resolveId(step.body.lesson_id, resolved, step.title),
        topicId: resolveId(step.body.topic_id, resolved, step.title),
        fileName: step2.teacher.fileName,
        bytes: step2.teacher.file.bytes,
        size: step2.teacher.size,
      });
      return { id: step2.teacher.topicId, link: null, payload };
    }
    case 'topic.patch': {
      const row = await patchTopic(host, token, step2.topicPatch.topicId, step2.topicPatch.patch);
      return { id: row?.id ?? step2.topicPatch.topicId, link: null };
    }
    case 'binding.save': {
      const questionRefs = buildQuestionRefs({
        subject: step3.binding.subject,
        questions: step3.binding.questions,
        candidateIds: step3.binding.candidateIds,
      });
      const payload = await saveBindingDraft(host, token, { lessonId, classId, courseId, resourceTopicId: resolveId(step.body.resource_topic_id, resolved, step.title), questionRefs });
      return { id: null, link: null, payload };
    }
    case 'binding.publish': {
      const payload = await changeBindingState(host, token, { lessonId, classId, courseId, action: 'publish' });
      return { id: null, link: null, payload };
    }
    case 'exam.create': {
      const row = await createExam(host, token, step3.exam, teacherId);
      resolved.examId = row?.id ?? null;
      return { id: resolved.examId, link: null };
    }
    case 'exam.questions': {
      const compiled = buildExamBody(step3.exam, teacherId);
      if (!resolved.examId) throw new Error('上一步未返回考试 ID，无法写入题目');
      const rows = await createExamQuestions(host, token, resolved.examId, compiled.questions);
      return { id: resolved.examId, link: null, count: Array.isArray(rows) ? rows.length : null };
    }
    case 'homework.update': {
      const id = step3.homework.existingHomeworkId;
      await updateHomeworkV2(host,token,id,{...step3.homework,classId});
      return {id};
    }
    case 'homework.create': {
      // The homework section may be absent (a batch that only touches lessons),
      // so the class always falls back to the batch context.
      const homework = step3.homework ?? {};
      if(homework.classId && homework.classId!==classId) throw Error('作业班级与预演班级不一致');
      const key=JSON.stringify([classId,homework.title]);
      if(pendingHomework.has(key))throw Error('同名作业正在发布，请稍后刷新');
      pendingHomework.add(key);
      let payload;
      try {
        const rows=await requestJson({base:sbBase(host)+'/rest/v1',pathname:'/homework',token,apikey:true,params:{select:'id,assigned_to,publish_type',class_id:'eq.'+classId,title:'eq.'+homework.title}});
        if(rows.some(h=>h.publish_type!=='targeted'||homework.publishType!=='targeted'||h.assigned_to?.some(id=>homework.assignedTo?.includes(id))))throw Error('已存在发给相同学生的同名作业，请从已有作业修改');
        payload=await createHomeworkV2(host,token,{...homework,classId});
      } finally {pendingHomework.delete(key)}
      resolved.homeworkId = payload?.homework_id ?? payload?.homework?.id ?? payload?.id ?? null;
      return { id: resolved.homeworkId, link: null, payload };
    }
    case 'tasks.save': {
      const tasks=step3.tasks.map(t=>({...t,refId:t.refId ?? (t.taskType==='homework'?resolved.homeworkId ?? step3.homework?.existingHomeworkId:resolved.examId)}));
      const saved=step.savedTaskCount ?? 0;
      for(let i=saved;i<tasks.length;i++){
        await saveTaskChainDraft(host,token,{lessonId,classId,courseId,tasks:[tasks[i]]});
        step.savedTaskCount=i+1;
      }
      const payload={count:tasks.length};
      return { id: null, link: null, payload };
    }
    case 'tasks.publish': {
      const payload = [];
      for (let i=step.publishedTaskCount ?? 0;i<step3.tasks.length;i++) {
        const t=step3.tasks[i];
        const task={...t,refId:t.refId ?? (t.taskType==="homework"?resolved.homeworkId ?? step3.homework?.existingHomeworkId:resolved.examId)};
        payload.push(await changeTaskChainState(host, token, { lessonId, classId, courseId, action: 'publish', task }));
        step.publishedTaskCount=i+1;
      }
      return { id: null, link: null, payload };
    }
    case 'chat.push': {
      const chat = step3.chat;
      const kind = chat.kind ?? (step3.exam ? 'exam' : 'homework');
      const payload = await pushGroupTask(host, token, chat.groupId, {
        kind,
        refId: kind === 'exam' ? resolved.examId : resolved.homeworkId,
        note: chat.note,
        clientMsgId: chat.clientMsgId,
      });
      resolved.chatPostId = payload?.id ?? payload?.post_id ?? null;
      return { id: resolved.chatPostId, link: null, payload };
    }
    case 'chat.due': {
      const payload = await changeGroupTaskDue(host, token, resolved.chatPostId, {
        dueDate: step3.chat.dueDate, notifyGroup: step3.chat.notifyGroup,
      });
      return { id: resolved.chatPostId, link: null, payload };
    }
    default:
      throw new Error(`未知步骤：${step.id}`);
  }
}
