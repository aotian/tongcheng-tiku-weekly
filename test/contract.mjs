/**
 * Contract tests: compare request bodies built by lib/api.js and lib/plan.js
 * against the verified contract in docs/DESIGN.md, key by key.
 *
 * No network, no credentials. A wrong field name fails here rather than in
 * production.
 *
 *   node test/contract.mjs
 */

import assert from 'node:assert/strict';
import {
  addLesson, applyClassTaskChainCopy, bindCourseToClass, buildExamBody, buildHomeworkBody,
  buildQuestionRefs, buildTaskChain, createChapter, createClass, createCourse, createHomeworkV2,
  createPlan, createTopic, pushGroupTask, saveBindingDraft, saveTaskChainDraft, setCourseStatus,
  changeBindingState, taskChainConflict, previewClassTaskChainCopy, uploadTeacherCourseware,
} from '../lib/api.js';
import { compilePlan } from '../lib/plan.js';

const calls = [];

/** Replace fetch for the duration of the test and record the parsed request. */
globalThis.fetch = async (url, init) => {
  const record = {
    url: String(url),
    method: init?.method ?? 'GET',
    headers: init?.headers ?? {},
    body: init?.body ? JSON.parse(init.body) : undefined,
  };
  if (record.url.includes('/sb/auth/v1/token')) {
    return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u', email: 'x@y' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  calls.push(record);
  const empty = record.method === 'DELETE' ? '' : JSON.stringify([{ id: 'row-1' }]);
  return new Response(empty, { status: 200, headers: { 'content-type': 'application/json' } });
};

const HOST = 'https://teach.tongchengweilai.com';
const TOKEN = 'header.payload.sig';

function last() {
  return calls[calls.length - 1];
}

const checks = [];
function check(name, fn) {
  checks.push([name, fn]);
}

const HOMEWORK_BODY = {
  homework: ['title', 'class_id', 'subject', 'description', 'due_date', 'status', 'publish_type', 'assigned_to', 'late_policy', 'late_until', 'late_penalty_percent'],
  items: ['item_type', 'question_id', 'score', 'order_index', 'is_required'],
};

const EXAM_KEYS = ['title', 'description', 'class_id', 'time_limit', 'pass_score', 'total_score', 'question_count', 'show_analysis', 'is_published', 'status', 'due_date', 'created_by', 'publish_type', 'assigned_to'];

check('所有请求都走 /sb 反代，从不直连 supabase.co', async () => {
  await setCourseStatus(HOST, TOKEN, 'c1', 'published');
  await createClass(HOST, TOKEN, { name: 'n', teacherId: 'u' });
  await previewClassTaskChainCopy(HOST, TOKEN, { courseId: 'c1', sourceClassId: 's', targetClassId: 't' });
  await createPlan(HOST, TOKEN, 'c1', { name: 'p' });
  for (const call of calls) {
    assert.ok(!/\.supabase\.co/.test(call.url), `直连了 supabase：${call.url}`);
  }
  const rest = calls.filter((call) => call.url.includes('/rest/v1'));
  assert.ok(rest.length > 0);
  for (const call of rest) assert.ok(call.url.includes('/sb/rest/v1/'));
  for (const call of rest) assert.equal(call.headers.apikey !== undefined, true, 'PostgREST 请求需要 apikey');
  for (const call of calls) assert.equal(call.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!('apikey' in calls.find((c) => c.url.includes('/api/teach/')).headers), '网关接口不带 apikey');
});

check('courses 创建字段与契约一致', async () => {
  await createCourse(HOST, TOKEN, { title: '课程', categoryId: 'cat' });
  assert.deepEqual(last().body, { title: '课程', category_id: 'cat', python_lab_enabled: false });
});

check('chapters 创建字段与契约一致', async () => {
  await createChapter(HOST, TOKEN, { courseId: 'c1', title: '章', orderNo: 3 });
  assert.deepEqual(last().body, { course_id: 'c1', title: '章', order_no: 3 });
  await createChapter(HOST, TOKEN, { courseId: 'c1', title: '章', orderNo: 1, planId: 'p1' });
  assert.deepEqual(last().body, { course_id: 'c1', title: '章', order_no: 1, plan_id: 'p1' });
});

check('classes 创建强写 teacher_id', async () => {
  await createClass(HOST, TOKEN, { name: '班', teacherId: 'teacher-uid' });
  assert.deepEqual(last().body, { name: '班', teacher_id: 'teacher-uid' });
});

check('class_courses 挂课字段与契约一致', async () => {
  await bindCourseToClass(HOST, TOKEN, { classId: 'cl', courseId: 'co', planId: 'pl' });
  assert.deepEqual(last().body, { class_id: 'cl', course_id: 'co', plan_id: 'pl' });
});

check('add-lesson 用 POST + action 查询参数', async () => {
  await addLesson(HOST, TOKEN, { chapterId: 'ch', topicId: 123, title: '课' });
  const call = last();
  assert.ok(call.url.endsWith('/api/teach-admin?action=add-lesson'), call.url);
  assert.deepEqual(call.body, { chapterId: 'ch', topicId: 123, title: '课' });
});

check('plans 创建与复制字段一致', async () => {
  await createPlan(HOST, TOKEN, 'c1', { name: '计划', copyFromPlanId: 'p0' });
  assert.ok(last().url.endsWith('/api/teach/courses/c1/plans'));
  assert.equal(last().method, 'POST');
  assert.deepEqual(last().body, { name: '计划', copy_from_plan_id: 'p0' });
  await createPlan(HOST, TOKEN, 'c1', { name: '计划2' });
  assert.deepEqual(last().body, { name: '计划2' });
});

check('跨班复制 apply 带 expected_preview_hash', async () => {
  await applyClassTaskChainCopy(HOST, TOKEN, 'c1', {
    sourceClassId: 's', targetClassId: 't', copyBindings: true, copyFeedback: false, expectedPreviewHash: 'abc',
  });
  assert.ok(last().url.endsWith('/class-task-chain/apply'));
  assert.deepEqual(last().body, {
    source_class_id: 's', target_class_id: 't', copy_bindings: true, copy_feedback: false, expected_preview_hash: 'abc',
  });
});

check('topics 写入用下划线字段、可见性开关不改名', async () => {
  await createTopic(HOST, TOKEN, { name: '课件', htmlUrl: 'https://oss/x.html', htmlVisibleToStudents: true, category: '信息科技' });
  assert.deepEqual(last().body, { name: '课件', category: '信息科技', html_url: 'https://oss/x.html', html_visible_to_students: true });
});

check('lesson_sidebar question_refs 使用后台枚举与分组契约', () => {
  const refs = buildQuestionRefs({ subject: '信息科技', candidateIds: ['q1', 'q2'], questions: [
    { questionId: 'q1', responseMode: 'single_choice' }, { questionId: 'q2', responseMode: 'multiple_choice' },
  ] });
  assert.equal(refs.schema_version, 2);
  assert.equal(refs.subject, 'programming');
  assert.equal(refs.groups.length, 1);
  assert.equal(refs.groups[0].id, 'in_class_1');
  assert.equal(refs.groups[0].placement, 'lesson_sidebar');
  assert.ok(!('questions' in refs.groups[0]));
  assert.deepEqual(refs.groups[0].question_refs, [
    { question_id: 'q1', response_mode: 'single_choice', sort_order: 1 },
    { question_id: 'q2', response_mode: 'multiple_choice', sort_order: 2 },
  ]);
  for (const mode of ['single_choice', 'multiple_choice', 'judge', 'short_text', 'code', 'oj']) {
    assert.equal(buildQuestionRefs({ subject: 'programming', questions: [{ questionId: 'q', responseMode: mode }] }).groups[0].question_refs[0].response_mode, mode);
  }
  for (const mode of ['single', 'multiple', 'manual', 'bad']) {
    assert.throws(() => buildQuestionRefs({ subject: 'programming', questions: [{ questionId: 'q', responseMode: mode }] }), { code: 'BAD_RESPONSE_MODE' });
  }
  for (const subject of ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'programming']) {
    assert.equal(buildQuestionRefs({ subject, questions: [{ questionId: 'q' }] }).subject, subject);
  }
  assert.throws(() => buildQuestionRefs({ subject: 'bad', questions: [{ questionId: 'q' }] }), { code: 'BAD_SUBJECT' });
  assert.throws(() => buildQuestionRefs({ subject: 'math', candidateIds: ['q1'], questions: [{ questionId: 'zz' }] }), /不在本次候选题/);
  assert.throws(() => buildQuestionRefs({ subject: 'math', questions: [{ questionId: 'q1' }, { questionId: 'q1' }] }), /重复/);
});

check('binding PUT/POST 的上下文均在 JSON body，PUT 必须带正整数课件 ID', async () => {
  const refs = buildQuestionRefs({ subject: 'math', questions: [{ questionId: 'q1' }] });
  await saveBindingDraft(HOST, TOKEN, { lessonId: 'L', classId: 'C', courseId: 'CO', resourceTopicId: 123, questionRefs: refs });
  assert.ok(last().url.endsWith('/api/teach/course-lessons/L/binding'));
  assert.equal(last().method, 'PUT');
  assert.deepEqual(last().body, { class_id: 'C', course_id: 'CO', resource_topic_id: 123, question_refs: refs });
  for (const resourceTopicId of [undefined, null, '', 0, -1, 1.5, 'bad']) {
    assert.throws(() => saveBindingDraft(HOST, TOKEN, { lessonId: 'L', resourceTopicId, questionRefs: refs }), { code: 'BAD_RESOURCE_TOPIC_ID' });
  }
  for (const action of ['publish', 'withdraw']) {
    await changeBindingState(HOST, TOKEN, { lessonId: 'L', classId: 'C', courseId: 'CO', action });
    assert.ok(last().url.endsWith('/api/teach/course-lessons/L/binding'));
    assert.equal(last().method, 'POST');
    assert.deepEqual(last().body, { class_id: 'C', course_id: 'CO', action });
  }
});

check('homework v2 键名逐字一致', async () => {
  const body = buildHomeworkBody({
    title: '作业', classId: 'C', subject: '信息科技', description: '', dueDate: '2026-11-27T15:00:00Z',
    status: 'draft', publishType: 'public', assignedTo: [], latePolicy: 'allow_penalty', lateUntil: null, latePenaltyPercent: 20,
    items: [{ itemType: 'question', questionId: 'q1', score: 10, orderIndex: 0, isRequired: true }],
  });
  assert.deepEqual(Object.keys(body).sort(), ['homework', 'items']);
  assert.deepEqual(Object.keys(body.homework).sort(), [...HOMEWORK_BODY.homework].sort());
  assert.deepEqual(Object.keys(body.items[0]).sort(), [...HOMEWORK_BODY.items].sort());
  assert.equal(body.homework.late_until, null);
  assert.equal(body.homework.late_penalty_percent, 20);
  await createHomeworkV2(HOST, TOKEN, {
    title: '作业', classId: 'C', dueDate: '2026-11-27T15:00:00Z', items: [{ questionId: 'q1', score: 10 }],
  });
  assert.ok(last().url.endsWith('/api/teacher/homework-v2'));
  assert.equal(last().method, 'POST');
});

check('作业校验：定向必须选人、补交策略枚举、必须有题', () => {
  assert.throws(() => buildHomeworkBody({ title: 't', classId: 'c', dueDate: 'd', publishType: 'targeted', items: [{ questionId: 'q' }] }), /定向/);
  assert.throws(() => buildHomeworkBody({ title: 't', classId: 'c', dueDate: 'd', latePolicy: 'nope', items: [{ questionId: 'q' }] }), /补交策略/);
  assert.throws(() => buildHomeworkBody({ title: 't', classId: 'c', dueDate: 'd', items: [] }), /至少/);
});

check('任务链：整链互斥，单独允许，视频阶段校验', () => {
  const hw = { taskType: 'homework', stage: 'homework', refId: 'h' };
  const exam = { taskType: 'exam', stage: 'after_class', refId: 'e' };
  for (const task of [hw, exam]) {
    assert.equal(taskChainConflict([task]), null);
    assert.equal(buildTaskChain({ tasks: [task] }).length, 1);
  }
  for (const tasks of [[hw, exam], [exam, hw]]) {
    assert.match(taskChainConflict(tasks), /互斥/);
    assert.throws(() => buildTaskChain({ tasks }), { code: 'TASK_STAGE_CONFLICT' });
  }
  for (const stage of ['entrance', 'exit', 'homework']) {
    assert.throws(() => buildTaskChain({ tasks: [{ taskType: 'video', stage, refId: 5 }] }), { code: 'INVALID_VIDEO_STAGE' });
  }
  for (const stage of ['in_class', 'after_class']) {
    assert.equal(buildTaskChain({ tasks: [{ taskType: 'video', stage, refId: 5 }] })[0].stage, stage);
  }
  assert.throws(() => buildTaskChain({ tasks: [{ taskType: 'video', stage: 'in_class', refId: 'abc' }] }), /整数/);
  assert.throws(() => buildTaskChain({ tasks: [{ taskType: 'oj', stage: 'entrance', refId: 1 }] }), /任务类型/);
});

check('任务链 PUT 字段与契约一致', async () => {
  await saveTaskChainDraft(HOST, TOKEN, {
    lessonId: 'L', classId: 'C', courseId: 'CO',
    tasks: [{ taskType: 'video', stage: 'in_class', refId: 5 }, { taskType: 'homework', stage: 'after_class', refId: 'hw' }],
  });
  assert.equal(last().method, 'PUT');
  assert.ok(last().url.includes('/api/teach/course-lessons/L/tasks'));
  assert.deepEqual(calls.slice(-2).map(call => call.body), [
    { class_id: 'C', course_id: 'CO', task_type: 'video', stage: 'in_class', ref_id: 5 },
    { class_id: 'C', course_id: 'CO', task_type: 'homework', stage: 'after_class', ref_id: 'hw' },
  ]);
});

check('exams 与 exam_questions 字段一致', () => {
  const compiled = buildExamBody({
    title: '小测', classId: 'C', timeLimit: 30, passScore: 20, dueDate: '2026-11-27T15:00:00Z',
    status: 'published', showAnalysis: true,
    items: [{ questionId: 'q1', score: 10, sortOrder: 0 }, { questionId: 'q2', score: 15, sortOrder: 1 }],
  }, 'uid');
  assert.deepEqual(Object.keys(compiled.exam).sort(), [...EXAM_KEYS].sort());
  assert.equal(compiled.exam.total_score, 25);
  assert.equal(compiled.exam.question_count, 2);
  assert.equal(compiled.exam.created_by, 'uid');
  assert.equal(compiled.exam.is_published, true);
  assert.deepEqual(compiled.questions, [
    { problem_id: 'q1', score: 10, sort_order: 0 },
    { problem_id: 'q2', score: 15, sort_order: 1 },
  ]);
});

check('群卡片：homework_id / exam_id 按 kind 二选一', async () => {
  await pushGroupTask(HOST, TOKEN, 'g1', { kind: 'homework', refId: 'h1', note: 'n', clientMsgId: 'm1' });
  assert.deepEqual(last().body, { kind: 'homework', note: 'n', client_msg_id: 'm1', homework_id: 'h1' });
  await pushGroupTask(HOST, TOKEN, 'g1', { kind: 'exam', refId: 'e1', note: '', clientMsgId: 'm2' });
  assert.deepEqual(last().body, { kind: 'exam', note: '', client_msg_id: 'm2', exam_id: 'e1' });
});

check('私有课件：>3MB 与 非 HTML 都被本地拦截', async () => {
  const big = new Uint8Array(3 * 1024 * 1024 + 1);
  await assert.rejects(
    () => uploadTeacherCourseware(HOST, TOKEN, { courseId: 'c', lessonId: 'l', topicId: 1, fileName: 'a.html', bytes: big, size: big.length }),
    /3MB/,
  );
  const notHtml = new TextEncoder().encode('hello');
  await assert.rejects(
    () => uploadTeacherCourseware(HOST, TOKEN, { courseId: 'c', lessonId: 'l', topicId: 1, fileName: 'a.txt', bytes: notHtml, size: notHtml.length }),
    /必须是 HTML/,
  );
  const html = new TextEncoder().encode('<!doctype html><html></html>');
  await uploadTeacherCourseware(HOST, TOKEN, { courseId: 'c', lessonId: 'l', topicId: 123, fileName: 'a.html', bytes: html, size: html.length });
  assert.deepEqual(Object.keys(last().body).sort(), ['content_base64', 'course_id', 'file_name', 'lesson_id', 'topic_id']);
  assert.equal(last().body.topic_id, '123');
});

check('预演：401 登录过期给出重新登录指引', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'jwt expired' }), { status: 401, headers: { 'content-type': 'application/json' } });
  await assert.rejects(() => createTopic(HOST, TOKEN, { name: 'x' }), (error) => {
    assert.equal(error.status, 401);
    assert.match(error.fix, /重新登录/);
    return true;
  });
  globalThis.fetch = saved;
});

check('预演：409 缺默认 school_id 给出明确修复指引', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: '23502', message: 'null value in column "school_id"' }), { status: 409, headers: { 'content-type': 'application/json' } });
  await assert.rejects(() => createHomeworkV2(HOST, TOKEN, { title: 't', classId: 'c', dueDate: 'd', items: [{ questionId: 'q' }] }), (error) => {
    assert.match(error.fix, /quiz_school_members/);
    return true;
  });
  globalThis.fetch = saved;
});

check('预演：跨班复制没有哈希时被拦截', () => {
  const plan = compilePlan({
    teacherId: 'u', host: HOST, context: { courseId: 'c1' },
    step1: { mode: 'chain-copy', chainCopy: { sourceClassId: 's', targetClassId: 't' } },
  });
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.blocked[0].id, 'chain.apply');
  assert.match(plan.blocked[0].reason, /预览/);
});

check('预演：完整批次按依赖顺序生成，且不含二进制', () => {
  const plan = compilePlan({
    teacherId: 'u', host: HOST,
    context: { classId: 'C', courseId: 'CO', lessonId: 'L' },
    step1: { mode: 'new-course', createCourse: true, courseTitle: 'T', chapterTitle: 'Ch' },
    step2: { student: { fileName: 'a.html', contentType: 'text/html', size: 10 }, teacher: { fileName: 'b.html', size: 100, topicId: 7 } },
    step3: { tasks: [{ taskType: 'video', stage: 'in_class', refId: 7 }] },
  });
  const ids = plan.steps.map((step) => step.id);
  assert.deepEqual(ids, ['course.create', 'chapter.create', 'courseware.student', 'courseware.student.topic', 'courseware.teacher', 'tasks.save', 'tasks.publish']);
  const serialized = JSON.stringify(plan);
  assert.ok(!/base64,[A-Za-z0-9+/]{40}/.test(serialized), '预演不应带二进制内容');
});

check('预演：新建课程时，依赖步骤用标记而不是假 ID', () => {
  const plan = compilePlan({
    teacherId: 'u', host: HOST,
    context: {},
    step1: {
      mode: 'new-course', createCourse: true, courseTitle: '新课', chapterTitle: '第一章',
      addLesson: { chapterId: null, title: '第一课' },
    },
  });
  const chapter = plan.steps.find((step) => step.id === 'chapter.create');
  const lesson = plan.steps.find((step) => step.id === 'lesson.add');
  assert.equal(chapter.body.course_id, '@course.create');
  assert.equal(chapter.meta.dependsOn, 'course.create');
  assert.equal(lesson.body.chapterId, '@chapter.create');
  assert.ok(!JSON.stringify(plan).includes('<courseId>'), '不应出现尖括号占位符');
});

check('预演：教师私有版自动挂到本次新建的课件', () => {
  const plan = compilePlan({
    teacherId: 'u', host: HOST,
    context: { courseId: 'CO', lessonId: 'L' },
    step2: { student: { fileName: 'a.html', contentType: 'text/html', size: 10 }, teacher: { fileName: 'b.html', size: 100 } },
  });
  const deck = plan.steps.find((step) => step.id === 'courseware.teacher');
  assert.equal(deck.body.topic_id, '@courseware.student.topic');
});

check('预演：没有课次时绑题与任务链被拦截，而不是生成假路径', () => {
  const plan = compilePlan({
    teacherId: 'u', host: HOST, context: { courseId: 'CO', classId: 'C' },
    step3: {
      binding: { subject: '信息科技', candidateIds: ['q1'], questions: [{ questionId: 'q1' }] },
      tasks: [{ taskType: 'video', stage: 'in_class', refId: 3 }],
    },
  });
  const ids = plan.blocked.map((item) => item.id);
  assert.ok(ids.includes('binding.save'));
  assert.ok(ids.includes('tasks.save'));
  assert.ok(plan.steps.every((step) => !step.endpoint.includes('<lessonId>')));
});

check('执行器：依赖标记在上一步没成功时给出中文原因', async () => {
  const { runStep } = await import('../lib/plan.js');
  await assert.rejects(
    () => runStep(
      { id: 'chapter.create', title: '创建章节', body: { course_id: '@course.create' } },
      { host: HOST, token: TOKEN, teacherId: 'u', context: {}, step1: { chapterTitle: 'x' }, step2: {}, step3: {}, resolved: {} },
    ),
    /需要上一步的结果/,
  );
});

// ── runner: retry and undo ─────────────────────────────────────────────────
check('执行器：逐步状态、失败记录、单步重试、撤回', async () => {
  const { Runner } = await import('../lib/runner.js');
  const runner = new Runner();
  let attempts = 0;
  const plan = {
    warnings: [], blocked: [],
    steps: [{
      id: 'homework.create', title: '创建课后作业', kind: 'write', method: 'POST',
      endpoint: `${HOST}/api/teacher/homework-v2`, pathname: '/api/teacher/homework-v2',
      body: {}, preview: {}, meta: {},
    }],
  };
  const payload = { context: { classId: 'C' }, step3: { homework: { title: 'T', dueDate: 'd', items: [{ questionId: 'q', score: 10 }] } } };
  const batch = runner.create({ ownerId: 'u', plan, payload });
  assert.equal(batch.steps[0].status, 'waiting');

  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/homework?')) return Response.json([]);
    attempts += 1;
    return new Response(JSON.stringify({ homework: { id: 'hw-9' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await runner.execute('u', batch.id, { host: HOST, token: TOKEN, teacherId: 'u' });
  assert.equal(runner.get('u', batch.id).steps[0].status, 'ok');
  assert.equal(runner.get('u', batch.id).steps[0].result.id, 'hw-9');
  assert.equal(runner.get('u', batch.id).steps[0].undoCandidate, true);
  assert.equal(attempts, 1);

  const undone = await runner.undo('u', batch.id, 'homework.create', { host: HOST, token: TOKEN });
  assert.equal(undone.label, '软删除作业');
  assert.equal(runner.get('u', batch.id).steps[0].status, 'undone');
  globalThis.fetch = saved;
});

check('执行器：不可撤回的步骤给出中文原因', async () => {
  const { Runner } = await import('../lib/runner.js');
  const runner = new Runner();
  const plan = {
    warnings: [], blocked: [],
    steps: [{
      id: 'course.create', title: '创建课程', kind: 'write', method: 'POST',
      endpoint: `${HOST}/sb/rest/v1/courses`, pathname: '/sb/rest/v1/courses', body: {}, preview: {}, meta: {},
    }],
  };
  const batch = runner.create({ ownerId: 'u', plan, payload: { context: {}, step1: { courseTitle: 'T' } } });
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'c-1' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  await runner.execute('u', batch.id, { host: HOST, token: TOKEN, teacherId: 'u' });
  await assert.rejects(() => runner.undo('u', batch.id, 'course.create', { host: HOST, token: TOKEN }), /没有撤回接口/);
  globalThis.fetch = saved;
});

check('已有作业只预演修改，保留原题项和学生', () => {
  const h={existingHomeworkId:'old',title:'T',dueDate:'2026-11-28',assignedTo:['S'],publishType:'targeted',items:[{id:'item',questionId:'q',title:'原题',score:7}]};
  const plan=compilePlan({context:{classId:'C'},step3:{homework:h}});
  assert.deepEqual(plan.steps.map(x=>x.method),['PATCH']);
  assert.equal(plan.steps[0].body.items[0].id,'item');
  assert.deepEqual(plan.steps[0].body.homework.assigned_to,['S']);
});
check('第二项失败时阻止发布，重试跳过第一项',async()=>{
  const {Runner}=await import('../lib/runner.js');
  const runner=new Runner(), context={classId:'C',courseId:'CO',lessonId:'L'};
  const step3={tasks:[{taskType:'video',stage:'in_class',refId:5},{taskType:'homework',stage:'after_class',refId:'h'}]};
  const batch=runner.create({ownerId:'u',plan:compilePlan({context,step3}),payload:{context,step3}});
  const original=globalThis.fetch, puts=[];let posts=0;
  globalThis.fetch=async(url,init)=>{
    if(init.method==='POST')posts++;
    if(init.method==='PUT'){puts.push(JSON.parse(init.body).ref_id);if(puts.length===2)return Response.json({message:'fail'},{status:400});}
    return Response.json({data:{task:{id:'saved'}}});
  };
  try {
    const ctx={host:HOST,token:TOKEN};
    await runner.execute('u',batch.id,ctx);
    assert.equal(posts,0);
    await assert.rejects(runner.retry('u',batch.id,'tasks.publish',ctx));
    await runner.retry('u',batch.id,'tasks.save',ctx);
    await runner.retry('u',batch.id,'tasks.publish',ctx);
    assert.deepEqual(puts,[5,'h','h']);
    assert.equal(posts,2);
  }finally{globalThis.fetch=original;}
});
check('绑题预演与执行保留上下文和课件依赖，缺课件时拦截', async () => {
  const { runStep } = await import('../lib/plan.js');
  const context = { classId: 'C', courseId: 'CO', lessonId: 'L' };
  const binding = { subject: '信息科技', publish: true, questions: [{ questionId: 'q1', responseMode: 'oj' }] };
  const missing = compilePlan({ context, step3: { binding } });
  assert.ok(missing.blocked.some((s) => s.id === 'binding.save'));
  assert.ok(!missing.steps.some((s) => s.id === 'binding.publish'));
  for (const resourceTopicId of [123, undefined]) {
    const step2 = resourceTopicId ? {} : { student: { fileName: 'a.html', contentType: 'text/html', size: 10 } };
    const step3 = { binding: { ...binding, resourceTopicId } };
    const plan = compilePlan({ context, step2, step3 });
    const save = plan.steps.find((s) => s.id === 'binding.save');
    assert.equal(save.body.resource_topic_id, resourceTopicId ?? '@courseware.student.topic');
    await runStep(save, { host: HOST, token: TOKEN, context, step1: {}, step2, step3, resolved: { topicId: 123 } });
    assert.deepEqual(last().body, { ...save.body, resource_topic_id: 123 });
    const publish = plan.steps.find((s) => s.id === 'binding.publish');
    await runStep(publish, { host: HOST, token: TOKEN, context, step1: {}, step2, step3, resolved: {} });
    assert.deepEqual(last().body, publish.body);
  }
});

check('向导：合法作答模式、整链互斥、视频阶段和右栏留白', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../lib/teacher-page.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  const mode = page.match(/<select id="qMode">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...mode.matchAll(/value="([^"]+)"/g)].map((m) => m[1]), ['single_choice', 'multiple_choice', 'judge', 'short_text', 'code', 'oj']);
  // Exercise the real inline addTask implementation with a minimal DOM stub.
  const source = page.slice(page.indexOf('function addTask()'), page.indexOf('function renderTasks()'));
  const add = new Function('state', '$', 'banner', 'renderTasks', source + '; return addTask;');
  for (const pair of [[{taskType:'homework',stage:'homework'},{taskType:'exam',stage:'after_class'}], [{taskType:'exam',stage:'after_class'},{taskType:'homework',stage:'homework'}]]) {
    const state = { tasks: [] }; let warning = '';
    const values = { taskType: {value: pair[0].taskType}, taskStage: {value: pair[0].stage}, taskRef: {value: ''} };
    const fn = add(state, (id) => values[id], (message) => { warning = message; }, () => {});
    fn(); assert.equal(state.tasks.length, 1);
    values.taskType.value = pair[1].taskType; values.taskStage.value = pair[1].stage;
    fn(); assert.equal(state.tasks.length, 1); assert.match(warning, /互斥/);
  }
  for (const stage of ['entrance', 'exit', 'homework', 'in_class', 'after_class']) {
    const state = { tasks: [] };
    const values = { taskType: {value:'video'}, taskStage: {value:stage}, taskRef:{value:'123'} };
    add(state, (id) => values[id], () => {}, () => {})();
    assert.equal(state.tasks.length, ['in_class', 'after_class'].includes(stage) ? 1 : 0);
  }
  assert.match(client, /--weekly-width: 44vw/);
  assert.match(client, /inset:0 var\(--weekly-right-rail, 64px\) 0 auto/);
  assert.ok(!client.includes('width: calc(100vw - var(--weekly-width))'));
});

// ── run ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log('✓', name);
  } catch (error) {
    failed += 1;
    console.error('✗', name);
    console.error('  ', error.message);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} 通过`);
process.exit(failed === 0 ? 0 : 1);
