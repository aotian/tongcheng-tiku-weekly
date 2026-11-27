/**
 * The verified write contract, in one place.
 *
 * Every function here performs exactly one request and takes a token plus
 * plain data. Nothing in this module decides *whether* to write — the runner
 * and the dry-run plan do that — so a preview and a real run reach the same
 * request bodies.
 *
 * Field names are copied from the verified contract and must not be
 * "improved": no extra keys, no renamed keys.
 */

import { DEFAULT_HOSTS, requestJson, signCourseAsset, postSignedObject, WeeklyError } from './http.js';

// Teacher management routes are served by Tiku. Teach hosts the classroom and /sb.
function teacherApiHost(host) {
  return host === DEFAULT_HOSTS.teach ? DEFAULT_HOSTS.tiku : host;
}

/** Same-origin Supabase proxy base. */
export function sbBase(host) {
  return `${String(host).replace(/\/+$/, '')}/sb`;
}

/** PostgREST base under the same-origin proxy. */
export function restBase(host) {
  return `${sbBase(host)}/rest/v1`;
}

const MAX_COURSEWARE_BYTES = 3 * 1024 * 1024;
const MAX_COURSE_WORK_HTML_BYTES = 50 * 1024 * 1024;

// ── Reads used to fill the context bar ─────────────────────────────────────

/** Decode the JWT payload without verifying it; verification is the backend's job. */
export function decodeClaims(token) {
  try {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** The signed-in user's id, from the token claims. */
export function currentUserId(token) {
  const claims = decodeClaims(token);
  if (!claims?.sub) throw new WeeklyError('登录令牌缺少用户标识，请重新登录', { code: 'NO_SUB' });
  return claims.sub;
}

/** Read `profiles` for the signed-in user. Role comes from this column, never from user_metadata. */
export async function readProfile(host, token) {
  const rows = await requestJson({
    base: restBase(host),
    pathname: '/profiles',
    token,
    apikey: true,
    params: { select: 'id,username,email,full_name,role', id: `eq.${currentUserId(token)}`, limit: 1 },
  });
  const profile = Array.isArray(rows) ? rows[0] : null;
  return {
    id: profile?.id ?? currentUserId(token),
    role: profile?.role ?? null,
    username: profile?.username ?? null,
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? null,
  };
}

/** Whether a role may use the teacher surfaces at all. */
export function isTeacherRole(role) {
  return role === 'teacher' || role === 'admin';
}

/** The platform resolves teacher ownership, administrator scope and school access. */
export async function listClasses(host, token, userId) {
  const result = await requestJson({ base: teacherApiHost(host), pathname: '/api/teacher/classes', token });
  if (result?.success !== true || !Array.isArray(result.data)) {
    throw new WeeklyError('无法确认当前账号可管理的班级', { code: 'CLASS_SCOPE_UNAVAILABLE' });
  }
  const now = Date.now();
  return result.data.map((row) => {
    const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
    return {
      id: row.id,
      name: row.name,
      teacherId: row.teacher_id,
      expiresAt: row.expires_at ?? null,
      ownedByMe: row.teacher_id === userId,
      expired: row.is_expired === true || (expiresAt !== null && expiresAt <= now),
    };
  });
}

/** Courses bound to a class through `class_courses`, plus the plan used. */
export async function listClassCourses(host, token, classId) {
  const rows = await requestJson({
    base: restBase(host),
    pathname: '/class_courses',
    token,
    apikey: true,
    params: {
      select: 'class_id,course_id,plan_id,courses(id,title,status)',
      class_id: `eq.${classId}`,
      limit: 100,
    },
  });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    courseId: row.course_id,
    planId: row.plan_id ?? null,
    title: row.courses?.title ?? '（未命名课程）',
    status: row.courses?.status ?? null,
  }));
}

/** Courses created by this teacher, for the "append to an existing course" mode. */
export async function listMyCourses(host, token) {
  const rows = await requestJson({
    base: restBase(host),
    pathname: '/courses',
    token,
    apikey: true,
    params: {
      select: 'id,title,status,category_id,created_at',
      order: 'created_at.desc',
      limit: 100,
    },
  });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status ?? null,
    categoryId: row.category_id ?? null,
  }));
}

/** Chapters of a course, ordered. */
export async function listChapters(host, token, courseId) {
  const rows = await requestJson({
    base: restBase(host),
    pathname: '/chapters',
    token,
    apikey: true,
    params: {
      select: 'id,course_id,title,order_no,plan_id',
      course_id: `eq.${courseId}`,
      order: 'order_no.asc',
      limit: 200,
    },
  });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    orderNo: row.order_no ?? null,
    planId: row.plan_id ?? null,
  }));
}

/** Read a single topic row (used after creation to show a preview link). */
export async function readTopic(host, token, topicId) {
  const rows = await requestJson({
    base: restBase(host),
    pathname: '/topics',
    token,
    apikey: true,
    params: { select: '*', id: `eq.${topicId}`, limit: 1 },
  });
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** The current `lesson_sidebar` binding plus candidate questions for a keyword. */
export async function readBinding(host, token, { lessonId, classId, courseId, keyword }) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/course-lessons/${lessonId}/binding`,
    token,
    params: { class_id: classId, course_id: courseId, include: 'candidates', q: keyword },
  });
}

/** The current task chain of a lesson. */
export async function readTasks(host, token, { lessonId, classId, courseId }) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/course-lessons/${lessonId}/tasks`,
    token,
    params: { class_id: classId, course_id: courseId },
  });
}

// ── Step 1: course, chapter, lesson, plan, cross-class chain ───────────────

/** `POST /api/teach/courses/{courseId}/plans` — create a plan, optionally copied. */
export function createPlan(host, token, courseId, plan) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/courses/${courseId}/plans`,
    method: 'POST',
    token,
    body: { name: plan.name, copy_from_plan_id: plan.copyFromPlanId ?? undefined },
  });
}

/** Preview a cross-class task-chain copy. Read-only. */
export function previewClassTaskChainCopy(host, token, { courseId, sourceClassId, targetClassId }) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/courses/${courseId}/class-task-chain/copy-preview`,
    token,
    params: { source_class_id: sourceClassId, target_class_id: targetClassId },
  });
}

/** Apply a previously previewed cross-class task-chain copy. */
export function applyClassTaskChainCopy(host, token, courseId, input) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/courses/${courseId}/class-task-chain/apply`,
    method: 'POST',
    token,
    body: {
      source_class_id: input.sourceClassId,
      target_class_id: input.targetClassId,
      copy_bindings: Boolean(input.copyBindings),
      copy_feedback: Boolean(input.copyFeedback),
      expected_preview_hash: input.expectedPreviewHash,
    },
  });
}

/** `POST /api/teach-admin?action=add-lesson` — append a lesson to a chapter. */
export function addLesson(host, token, input) {
  return requestJson({
    base: host,
    pathname: '/api/teach-admin',
    method: 'POST',
    token,
    params: { action: 'add-lesson' },
    body: { chapterId: input.chapterId, topicId: input.topicId, title: input.title },
  });
}

/** `POST /sb/rest/v1/courses` — create a course row. */
export function createCourse(host, token, input) {
  return requestJson({
    base: restBase(host),
    pathname: '/courses',
    method: 'POST',
    token,
    apikey: true,
    prefer: 'return=representation',
    body: { title: input.title, category_id: input.categoryId, python_lab_enabled: false },
  }).then(firstRow);
}

/** `PATCH /sb/rest/v1/courses` — publish or unpublish. */
export function setCourseStatus(host, token, courseId, status) {
  if (status !== 'published' && status !== 'draft') {
    throw new WeeklyError('课程状态只能是 published 或 draft', { code: 'BAD_STATUS' });
  }
  return requestJson({
    base: restBase(host),
    pathname: '/courses',
    method: 'PATCH',
    token,
    apikey: true,
    prefer: 'return=representation',
    params: { id: `eq.${courseId}` },
    body: { status },
  }).then(firstRow);
}

/** `POST /sb/rest/v1/chapters` — create a chapter. */
export function createChapter(host, token, input) {
  const body = { course_id: input.courseId, title: input.title, order_no: input.orderNo };
  if (input.planId) body.plan_id = input.planId;
  return requestJson({
    base: restBase(host),
    pathname: '/chapters',
    method: 'POST',
    token,
    apikey: true,
    prefer: 'return=representation',
    body,
  }).then(firstRow);
}

/** `POST /sb/rest/v1/classes` — create a class owned by the signed-in teacher. */
export function createClass(host, token, input) {
  const body = { name: input.name, teacher_id: input.teacherId };
  if (input.expiresAt) body.expires_at = input.expiresAt;
  return requestJson({
    base: restBase(host),
    pathname: '/classes',
    method: 'POST',
    token,
    apikey: true,
    prefer: 'return=representation',
    body,
  }).then(firstRow);
}

/** `POST /sb/rest/v1/class_courses` — bind a course (and optional plan) to a class. */
export function bindCourseToClass(host, token, input) {
  const body = { class_id: input.classId, course_id: input.courseId };
  if (input.planId) body.plan_id = input.planId;
  return requestJson({
    base: restBase(host),
    pathname: '/class_courses',
    method: 'POST',
    token,
    apikey: true,
    prefer: 'return=representation',
    body,
  }).then(firstRow);
}

// ── Step 2: courseware ─────────────────────────────────────────────────────

/** `POST /sb/rest/v1/topics` — write a courseware topic row. */
export function createTopic(host, token, input) {
  const body = { name: input.name };
  if (input.category !== undefined) body.category = input.category;
  if (input.content !== undefined) body.content = input.content;
  if (input.htmlUrl !== undefined) body.html_url = input.htmlUrl;
  if (input.videoUrl !== undefined) body.video_url = input.videoUrl;
  if (input.resourceUrl !== undefined) body.resource_url = input.resourceUrl;
  if (input.htmlVisibleToStudents !== undefined) body.html_visible_to_students = input.htmlVisibleToStudents;
  if (input.videoVisible !== undefined) body.video_visible = input.videoVisible;
  if (input.resourceVisible !== undefined) body.resource_visible = input.resourceVisible;
  if (input.type !== undefined) body.type = input.type;
  if (input.resourceType !== undefined) body.resource_type = input.resourceType;
  if (input.resourceId !== undefined) body.resource_id = input.resourceId;
  if (input.resourceMeta !== undefined) body.resource_meta = input.resourceMeta;
  return requestJson({
    base: restBase(host),
    pathname: '/topics',
    method: 'POST',
    token,
    apikey: true,
    prefer: 'return=representation',
    body,
  }).then(firstRow);
}

/** `PATCH /sb/rest/v1/topics` — adjust a topic after it exists. */
export function patchTopic(host, token, topicId, patch) {
  const body = { ...patch };
  return requestJson({
    base: restBase(host),
    pathname: '/topics',
    method: 'PATCH',
    token,
    apikey: true,
    prefer: 'return=representation',
    params: { id: `eq.${topicId}` },
    body,
  }).then(firstRow);
}

/**
 * Update an existing courseware topic in place.
 * Only the supplied fields are sent, so an omitted resource_meta is left alone.
 */
export function updateCoursewareTopic(host, token, input) {
  const patch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.htmlUrl !== undefined) patch.html_url = input.htmlUrl;
  if (input.htmlVisibleToStudents !== undefined) patch.html_visible_to_students = input.htmlVisibleToStudents;
  if (input.resourceMeta !== undefined) patch.resource_meta = input.resourceMeta;
  if (!Object.keys(patch).length) throw new WeeklyError('没有要更新的课件主题字段', { code: 'TOPIC_PATCH_EMPTY' });
  return patchTopic(host, token, input.topicId, patch);
}

/** The lesson row plus the courseware topic currently linked to it. */
export async function readLessonCourseware(host, token, lessonId) {
  const lessons = await requestJson({
    base: restBase(host),
    pathname: '/lessons',
    token,
    apikey: true,
    params: { select: 'id,title,topic_id', id: `eq.${lessonId}`, limit: 1 },
  });
  const lesson = firstRow(lessons);
  if (!lesson) {
    return { lessonId, lessonTitle: null, coursewareTopicId: null, html_url: null, topicName: null };
  }
  let htmlUrl = null;
  let topicName = null;
  if (lesson.topic_id) {
    const topic = await readTopic(host, token, lesson.topic_id);
    htmlUrl = topic?.html_url ?? null;
    topicName = topic?.name ?? null;
  }
  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title ?? null,
    coursewareTopicId: lesson.topic_id ?? null,
    html_url: htmlUrl,
    topicName,
  };
}

/**
 * Point a lesson at a courseware topic and optionally rename it.
 * The returned row is checked so a silent no-op cannot be treated as success.
 */
export async function linkLessonCourseware(host, token, input) {
  const body = {};
  if (input.topicId !== undefined && input.topicId !== null && input.topicId !== '') body.topic_id = Number(input.topicId);
  if (input.title) body.title = input.title;
  if (!Object.keys(body).length) throw new WeeklyError('课次绑定缺少主题或标题', { code: 'LESSON_LINK_EMPTY' });
  const row = await requestJson({
    base: restBase(host),
    pathname: '/lessons',
    method: 'PATCH',
    token,
    apikey: true,
    prefer: 'return=representation',
    params: { id: `eq.${input.lessonId}`, select: 'id,title,topic_id' },
    body,
  }).then(firstRow);
  if (body.topic_id !== undefined && String(row?.topic_id) !== String(body.topic_id)) {
    throw new WeeklyError('课次课件绑定未确认成功', {
      code: 'LESSON_TOPIC_UNCONFIRMED',
      status: 409,
    });
  }
  return row;
}

/** Sign, then upload a student-visible asset to OSS. Returns the public URL to store. */
export async function uploadStudentCourseware(host, token, file) {
  if (file.size > MAX_COURSE_WORK_HTML_BYTES) {
    throw new WeeklyError('学生版课件的单文件上限是 50MB', { code: 'FILE_TOO_LARGE' });
  }
  const signature = await signCourseAsset(host, token, file);
  const result = await postSignedObject(signature, file);
  if (!result.publicUrl) {
    throw new WeeklyError('上传成功但签名没有返回 public_url，无法写入课件', { code: 'NO_PUBLIC_URL' });
  }
  return { publicUrl: result.publicUrl, key: signature.fields?.key ?? null };
}

/** Upload the teacher-private HTML deck; the backend writes `topics.resource_meta.courseware_html`. */
export async function uploadTeacherCourseware(host, token, input) {
  if (input.size > MAX_COURSEWARE_BYTES) {
    throw new WeeklyError('教师私有版课件上限是 3MB', { code: 'FILE_TOO_LARGE' });
  }
  const head = Buffer.from(input.bytes).subarray(0, 2000).toString('utf8').toLowerCase();
  if (!head.includes('<!doctype html') && !head.includes('<html')) {
    throw new WeeklyError('教师私有版课件必须是 HTML 文件（需包含 <!doctype html 或 <html）', {
      code: 'NOT_HTML',
    });
  }
  return requestJson({
    base: host,
    pathname: '/api/teach-admin',
    method: 'POST',
    token,
    params: { action: 'courseware-upload' },
    body: {
      course_id: input.courseId,
      lesson_id: input.lessonId,
      topic_id: String(input.topicId),
      file_name: input.fileName,
      content_base64: Buffer.from(input.bytes).toString('base64'),
    },
    timeoutMs: 120_000,
  });
}

// ── Step 3a: lesson_sidebar binding ────────────────────────────────────────

/**
 * Build a `question_refs` payload under schema_version 2.
 *
 * The contract allows only `placement: "lesson_sidebar"` here, requires both a
 * `subject` and `groups[]`, and each question carries its response mode and
 * ordering. A question that is not in the supplied candidate set is refused
 * before anything is sent.
 */
const BINDING_SUBJECTS = new Set(['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'programming']);
const SUBJECT_ALIASES = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '编程': 'programming', '信息科技': 'programming' };
const RESPONSE_MODES = new Set(['single_choice', 'multiple_choice', 'judge', 'short_text', 'code', 'oj']);

export function buildQuestionRefs({ subject, questions, candidateIds }) {
  if (!subject) throw new WeeklyError('随堂绑题需要subject（学科）', { code: 'NO_SUBJECT' });
  subject = SUBJECT_ALIASES[subject] ?? subject;
  if (!BINDING_SUBJECTS.has(subject)) throw new WeeklyError('随堂绑题学科不在允许的枚举中', { code: 'BAD_SUBJECT' });
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new WeeklyError('随堂绑题至少选择一道题', { code: 'NO_QUESTIONS' });
  }
  const allowed = candidateIds ? new Set(candidateIds) : null;
  const seen = new Set();
  const items = questions.map((question, index) => {
    const questionId = String(question.questionId ?? '').trim();
    if (!questionId) throw new WeeklyError(`第 ${index + 1} 题缺少 question_id`, { code: 'BAD_QUESTION' });
    if (allowed && !allowed.has(questionId)) {
      throw new WeeklyError(
        `题目 ${questionId} 不在本次候选题中（候选题由接口返回，且要求 school_id IS NULL）`,
        { code: 'QUESTION_NOT_A_CANDIDATE' },
      );
    }
    if (seen.has(questionId)) {
      throw new WeeklyError(`题目 ${questionId} 被重复选择`, { code: 'DUPLICATE_QUESTION' });
    }
    seen.add(questionId);
    const responseMode = question.responseMode ?? 'single_choice';
    if (!RESPONSE_MODES.has(responseMode)) throw new WeeklyError(`第 ${index + 1} 题的作答模式不合法`, { code: 'BAD_RESPONSE_MODE' });
    return {
      question_id: questionId,
      response_mode: responseMode,
      sort_order: index + 1,
    };
  });
  const group = { id: 'in_class_1', placement: 'lesson_sidebar', question_refs: items };
  if (questions[0]?.title) group.title = questions[0].title;
  return { schema_version: 2, subject, groups: [group] };
}

/** `PUT .../binding` — save the draft (only while not published). */
export function saveBindingDraft(host, token, { lessonId, classId, courseId, resourceTopicId, questionRefs }) {
  const topicId = Number(resourceTopicId);
  if (!Number.isSafeInteger(topicId) || topicId <= 0) {
    throw new WeeklyError('随堂绑题必须选择有效课件（resource_topic_id 正整数）', { code: 'BAD_RESOURCE_TOPIC_ID' });
  }
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/course-lessons/${lessonId}/binding`,
    method: 'PUT',
    token,
    body: { class_id: classId, course_id: courseId, resource_topic_id: topicId, question_refs: questionRefs },
  });
}

/** `POST .../binding` — publish or withdraw. Published rows must be withdrawn before editing. */
export function changeBindingState(host, token, { lessonId, classId, courseId, action }) {
  if (action !== 'publish' && action !== 'withdraw') {
    throw new WeeklyError('绑题动作只能是 publish 或 withdraw', { code: 'BAD_ACTION' });
  }
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/course-lessons/${lessonId}/binding`,
    method: 'POST',
    token,
    body: { class_id: classId, course_id: courseId, action },
  });
}

// ── Step 3b: homework v2 ───────────────────────────────────────────────────

/** Normalise the homework input into the exact v2 body. */
export function buildHomeworkBody(input) {
  const latePolicy = input.latePolicy ?? 'closed';
  if (!['closed', 'allow', 'allow_penalty'].includes(latePolicy)) {
    throw new WeeklyError('补交策略只能是 closed / allow / allow_penalty', { code: 'BAD_LATE_POLICY' });
  }
  if (!input.title) throw new WeeklyError('作业标题不能为空', { code: 'NO_TITLE' });
  if (!input.classId) throw new WeeklyError('作业必须指定班级', { code: 'NO_CLASS' });
  if (!input.dueDate) throw new WeeklyError('作业必须指定截止时间', { code: 'NO_DUE_DATE' });
  const publishType = input.publishType ?? 'public';
  if (!['public', 'targeted'].includes(publishType)) {
    throw new WeeklyError('发布范围只能是 public 或 targeted', { code: 'BAD_PUBLISH_TYPE' });
  }
  const status = input.status ?? 'draft';
  if (!['draft', 'published', 'closed'].includes(status)) {
    throw new WeeklyError('作业状态只能是 draft / published / closed', { code: 'BAD_STATUS' });
  }
  if (publishType === 'targeted' && (!Array.isArray(input.assignedTo) || input.assignedTo.length === 0)) {
    throw new WeeklyError('定向发布至少要选一名学生', { code: 'NO_ASSIGNED' });
  }

  const items = (input.items ?? []).map((item, index) => ({
    ...Object.fromEntries(['id','title','prompt_md','response_kinds','code_languages','max_files'].filter(k=>item[k]!=null).map(k=>[k,item[k]])),
    item_type: item.itemType ?? 'question',
    question_id: item.questionId,
    score: Number(item.score ?? 0),
    order_index: item.orderIndex ?? index,
    is_required: item.isRequired !== false,
  }));
  if (items.length === 0) throw new WeeklyError('作业至少要包含一道题', { code: 'NO_ITEMS' });

  return {
    homework: {
      title: input.title,
      class_id: input.classId,
      subject: input.subject,
      description: input.description ?? '',
      due_date: input.dueDate,
      status,
      publish_type: publishType,
      assigned_to: input.assignedTo ?? [],
      late_policy: latePolicy,
      late_until: input.lateUntil ?? null,
      late_penalty_percent: Number(input.latePenaltyPercent ?? 0),
    },
    items,
  };
}

/** `POST /api/teacher/homework-v2` — create. */
export function createHomeworkV2(host, token, input) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: '/api/teacher/homework-v2',
    method: 'POST',
    token,
    body: buildHomeworkBody(input),
  });
}

/** `PATCH /api/teacher/homework-v2/{id}` — edit, change due date, switch status. */
export function updateHomeworkV2(host, token, homeworkId, input) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teacher/homework-v2/${homeworkId}`,
    method: 'PATCH',
    token,
    body: buildHomeworkBody(input),
  });
}

/** `DELETE /api/teacher/homework-v2/{id}?confirm=1` — soft delete. */
export function deleteHomeworkV2(host, token, homeworkId) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teacher/homework-v2/${homeworkId}`,
    method: 'DELETE',
    token,
    params: { confirm: 1 },
  });
}

// ── Step 3c: exams ─────────────────────────────────────────────────────────

const TASK_TYPES = new Set(['exam', 'homework', 'video']);
const STAGES = new Set(['entrance', 'in_class', 'exit', 'homework', 'after_class']);

/** Validate the mutually exclusive pair across the entire lesson task chain. */
export function taskChainConflict(tasks) {
  const hasHomework = tasks.some((task) => task.taskType === 'homework' && task.stage === 'homework');
  const hasExam = tasks.some((task) => task.taskType === 'exam' && task.stage === 'after_class');
  return hasHomework && hasExam
    ? '同一课次的「课后作业（homework）」与「课后拓展考试（after_class）」互斥，只能选择其中一种'
    : null;
}

/** Validate and normalise a task chain before it is drafted or published. */
export function buildTaskChain({ classId, courseId, tasks }) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new WeeklyError('任务链至少需要一个任务', { code: 'NO_TASKS' });
  }
  const conflict = taskChainConflict(tasks);
  if (conflict) throw new WeeklyError(conflict, { code: 'TASK_STAGE_CONFLICT' });
  const seen = new Set();
  return tasks.map((task) => {
    if (!TASK_TYPES.has(task.taskType)) {
      throw new WeeklyError(`任务类型只能是 exam / homework / video，收到「${task.taskType}」`, { code: 'BAD_TASK_TYPE' });
    }
    if (!STAGES.has(task.stage)) {
      throw new WeeklyError(`阶段只能是 entrance / in_class / exit / homework / after_class，收到「${task.stage}」`, { code: 'BAD_STAGE' });
    }
    if (task.taskType === 'video') {
      if (!['in_class', 'after_class'].includes(task.stage)) {
        throw new WeeklyError('视频任务只能挂在课中（in_class）或课后拓展（after_class）阶段', { code: 'INVALID_VIDEO_STAGE' });
      }
      const topicId = Number(task.refId);
      if (!Number.isInteger(topicId)) throw new WeeklyError('video 任务的 ref_id 必须是 topics.id 整数', { code: 'BAD_REF' });
    } else if (!task.refId) {
      throw new WeeklyError(`${task.taskType} 任务需要 exam/homework 的 UUID`, { code: 'BAD_REF' });
    }
    const key = `${task.taskType}:${task.stage}`;
    if (seen.has(key)) throw new WeeklyError(`阶段「${task.stage}」上重复挂载了 ${task.taskType}`, { code: 'DUPLICATE_TASK' });
    seen.add(key);
    return {
      class_id: classId,
      course_id: courseId,
      task_type: task.taskType,
      stage: task.stage,
      ref_id: task.taskType === 'video' ? Number(task.refId) : task.refId,
    };
  });
}

/** `PUT .../tasks` — save the task chain as a draft. */
export async function saveTaskChainDraft(host, token, { lessonId, classId, courseId, tasks }) {
  const saved = [];
  for (const body of buildTaskChain({ classId, courseId, tasks })) {
    const result = await requestJson({ base: teacherApiHost(host), pathname: `/api/teach/course-lessons/${lessonId}/tasks`, method: 'PUT', token, body });
    saved.push(result?.data?.task ?? result?.task ?? result);
  }
  return { tasks: saved };
}

/** `POST .../tasks` — publish, batch publish, or withdraw. */
export function changeTaskChainState(host, token, { lessonId, classId, courseId, action, task }) {
  if (!['publish', 'publish_batch', 'withdraw'].includes(action)) {
    throw new WeeklyError('任务链动作只能是 publish / publish_batch / withdraw', { code: 'BAD_ACTION' });
  }
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teach/course-lessons/${lessonId}/tasks`,
    method: 'POST',
    token,
    params: { class_id: classId, course_id: courseId },
    body: { action, class_id: classId, course_id: courseId, ...(task ? { task_type: task.taskType, stage: task.stage, ref_id: task.refId } : {}) },
  });
}

/** Normalise the exam row + question rows. */
export function buildExamBody(input, userId) {
  const items = input.items ?? [];
  if (items.length === 0) throw new WeeklyError('考试至少要包含一道题', { code: 'NO_ITEMS' });
  const totalScore = items.reduce((sum, item) => sum + Number(item.score ?? 0), 0);
  const status = input.status ?? 'draft';
  if (!['published', 'draft'].includes(status)) {
    throw new WeeklyError('考试状态只能是 published 或 draft', { code: 'BAD_STATUS' });
  }
  return {
    exam: {
      title: input.title,
      description: input.description ?? '',
      class_id: input.classId,
      time_limit: Number(input.timeLimit ?? 0),
      pass_score: Number(input.passScore ?? 0),
      total_score: totalScore,
      question_count: items.length,
      show_analysis: Boolean(input.showAnalysis),
      is_published: status === 'published',
      status,
      due_date: input.dueDate ?? null,
      created_by: userId,
      publish_type: input.publishType ?? 'public',
      assigned_to: input.assignedTo ?? [],
    },
    questions: items.map((item, index) => ({
      problem_id: item.problemId ?? item.questionId,
      score: Number(item.score ?? 0),
      sort_order: item.sortOrder ?? index,
    })),
  };
}

/** `POST /sb/rest/v1/exams` — create the exam row. */
export function createExam(host, token, input, userId) {
  const { exam } = buildExamBody(input, userId);
  return requestJson({
    base: restBase(host),
    pathname: '/exams',
    method: 'POST',
    token,
    apikey: true,
    prefer: 'return=representation',
    body: exam,
  }).then(firstRow);
}

/** `POST /sb/rest/v1/exam_questions` — attach questions in one array insert. */
export function createExamQuestions(host, token, examId, rows) {
  return requestJson({
    base: restBase(host),
    pathname: '/exam_questions',
    method: 'POST',
    token,
    apikey: true,
    prefer: 'return=representation',
    body: rows.map((row) => ({ ...row, exam_id: examId })),
  });
}

// ── Step 3d: group chat task card (optional) ───────────────────────────────

/** `POST /api/teacher/chat/groups/{groupId}/tasks` — push a task card to a class group. */
export function pushGroupTask(host, token, groupId, input) {
  const kind = input.kind;
  if (!['homework', 'exam', 'checkin', 'oj'].includes(kind)) {
    throw new WeeklyError('群任务卡片类型只能是 homework / exam / checkin / oj', { code: 'BAD_KIND' });
  }
  const body = { kind, note: input.note ?? '', client_msg_id: input.clientMsgId };
  if (kind === 'homework') body.homework_id = input.refId;
  if (kind === 'exam') body.exam_id = input.refId;
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teacher/chat/groups/${groupId}/tasks`,
    method: 'POST',
    token,
    body,
  });
}

/** `POST /api/teacher/chat/tasks/{postId}/due` — change the card's due date. */
export function changeGroupTaskDue(host, token, postId, input) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teacher/chat/tasks/${postId}/due`,
    method: 'POST',
    token,
    body: { due_date: input.dueDate, notify_group: Boolean(input.notifyGroup) },
  });
}

/** `POST /api/teacher/chat/tasks/{postId}/withdraw`. */
export function withdrawGroupTask(host, token, postId) {
  return requestJson({
    base: teacherApiHost(host),
    pathname: `/api/teacher/chat/tasks/${postId}/withdraw`,
    method: 'POST',
    token,
    body: {},
  });
}

function firstRow(payload) {
  if (Array.isArray(payload)) return payload[0] ?? null;
  return payload ?? null;
}
