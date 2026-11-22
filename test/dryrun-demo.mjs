/**
 * Dry-run demo: compile a realistic weekly batch into a step list and print it.
 *
 * This performs no network request and writes nothing. It exists to show the
 * exact shape of the preview the teacher sees in step ④, and to let the
 * contract tests compare key names against `docs/DESIGN.md`.
 *
 *   node test/dryrun-demo.mjs
 *   node test/dryrun-demo.mjs --json
 */

import { compilePlan } from '../lib/plan.js';

const input = {
  teacherId: '8f2c-teacher-uid',
  host: 'https://teach.tongchengweilai.com',
  context: {
    classId: 'class-uuid-0001',
    courseId: 'course-uuid-0001',
    planId: null,
    lessonId: 'lesson-uuid-0001',
  },
  step1: {
    mode: 'new-course',
    createCourse: true,
    courseTitle: '三年级信息科技 · 第12周',
    categoryId: null,
    courseStatus: 'published',
    chapterTitle: '第3章 循环与判断',
    chapterOrderNo: 3,
    addLesson: { chapterId: 'chapter-uuid-0001', title: '第12周 · 循环嵌套', topicId: 123 },
  },
  step2: {
    student: {
      fileName: 'lesson12-student.html',
      contentType: 'text/html',
      size: 184_320,
      topicName: '第12周 · 循环嵌套（学生版）',
      category: '信息科技',
      htmlVisibleToStudents: true,
    },
    teacher: { fileName: 'lesson12-deck.html', size: 2_400_000, topicId: 123 },
  },
  step3: {
    binding: {
      subject: '信息科技',
      resourceTopicId: 123,
      publish: true,
      candidateIds: ['q-1', 'q-2', 'q-3'],
      questions: [
        { questionId: 'q-1', responseMode: 'single_choice' },
        { questionId: 'q-2', responseMode: 'single_choice' },
        { questionId: 'q-3', responseMode: 'multiple_choice' },
      ],
    },
    homework: {
      title: '第12周课后练习',
      subject: '信息科技',
      description: '完成随堂未做完的三道题。',
      dueDate: '2026-11-27T15:00:00.000Z',
      status: 'published',
      publishType: 'public',
      assignedTo: [],
      latePolicy: 'allow_penalty',
      lateUntil: null,
      latePenaltyPercent: 20,
      items: [
        { itemType: 'question', questionId: 'q-1', score: 10, orderIndex: 0, isRequired: true },
        { itemType: 'question', questionId: 'q-2', score: 10, orderIndex: 1, isRequired: true },
        { itemType: 'question', questionId: 'q-3', score: 10, orderIndex: 2, isRequired: true },
      ],
    },
    exam: {
      title: '第12周小测',
      timeLimit: 30,
      passScore: 20,
      dueDate: '2026-11-27T15:00:00.000Z',
      showAnalysis: true,
      status: 'published',
      items: [
        { questionId: 'q-1', score: 10, sortOrder: 0 },
        { questionId: 'q-2', score: 10, sortOrder: 1 },
      ],
    },
    tasks: [
      { taskType: 'video', stage: 'in_class', refId: 123 },
      { taskType: 'homework', stage: 'after_class', refId: null },
      { taskType: 'exam', stage: 'exit', refId: null },
    ],
    // A pushed card must name an existing homework/exam id; a new one has no id yet.
    chat: { groupId: 'group-uuid-0001', kind: 'homework', refId: 'homework-uuid-existed', note: '本周作业已发布' },
  },
};

const plan = compilePlan(input);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const pad = (value, width) => String(value).padEnd(width, ' ');

console.log('童澄每周课程发布 · 发布前预演（Dry-Run，不写库）');
console.log('─'.repeat(96));
console.log(pad('#', 3), pad('步骤', 22), pad('方法', 7), '接口 / 关键参数');
console.log('─'.repeat(96));
plan.steps.forEach((step, index) => {
  console.log(pad(index + 1, 3), pad(step.title, 22), pad(step.method, 7), step.endpoint);
  if (step.meta?.note) console.log(pad('', 33), '· ' + step.meta.note);
  const keys = Object.keys(step.preview).join(', ');
  if (keys) console.log(pad('', 33), '字段: ' + keys);
});
console.log('─'.repeat(96));
console.log(`共 ${plan.steps.length} 步；拦截 ${plan.blocked.length} 项；提醒 ${plan.warnings.length} 条`);
for (const item of plan.blocked) console.log('  拦截 ·', item.reason);
for (const item of plan.warnings) console.log('  提醒 ·', item);
