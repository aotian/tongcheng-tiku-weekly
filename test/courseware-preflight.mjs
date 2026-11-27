/**
 * Math courseware preflight blocks bad drafts at generate time and at dry_run.
 *
 *   node test/courseware-preflight.mjs
 */
import assert from 'node:assert/strict';
import { preflightMathCourse, renderCoursewarePair } from '../lib/courseware-v2.js';
import { WeeklyService } from '../lib/service.js';
import { createTools } from '../lib/tools.js';

const density = preflightMathCourse({
  id: 'math',
  subject: 'math',
  lessonKind: 'new_lesson',
  slides: [
    { type: 'cover', stage: 'study' },
    { type: 'kp-pitfall', stage: 'study', formula: '$$a=1$$' },
    {
      type: 'worked-example',
      stage: 'study',
      id: 'e',
      title: '例',
      figures: [{ src: 'a' }, { src: 'b' }, { src: 'c' }],
    },
    { type: 'teacher-exam', stage: 'entrance' },
    { type: 'teacher-exam', stage: 'exit' },
  ],
  sourceExamples: [{ title: '例', problem: '求 $x$', steps: [{ text: '得 $x=1$' }], subQuestions: [] }],
});
assert.equal(density.some((issue) => issue.code === 'IMAGE_DENSITY_EXCEEDED'), true);

const sprint = {
  subject: 'math',
  lessonKind: 'sprint_review',
  title: '相似压轴 · 第 25 题',
  points: ['三个模型'],
  formula: '$$\\triangle ABC \\sim \\triangle DEF$$',
  examples: [
    {
      title: '例 1',
      problem: '（1）求 $AB$（2）求 $BC$（3）求 $AC$',
      subQuestions: [
        { label: '（1）', goal: '证明相似', entry: '作 $DE \\parallel BC$', steps: [{ label: '推导', text: '由 $DE \\parallel BC$ 得 $\\angle ADE = \\angle ABC$' }], answer: '第一问答案 $AB=2$', pitfall: '漏掉平行线' },
        { label: '（2）', goal: '求对应边', entry: '用比例 $AB/DE$', steps: [{ label: '推导', text: '写出 $\\dfrac{AB}{DE}=\\dfrac{BC}{EF}$' }], answer: '第二问答案 $BC=4$', pitfall: '对应边写反' },
        { label: '（3）', goal: '求线段比', entry: '回到公共角', steps: [{ label: '推导', text: '由相似比得 $\\dfrac{AC}{DF}=2$' }], answer: '第三问答案 $AC=6$', pitfall: '漏掉第（3）问' },
      ],
    },
  ],
  saveToDraft: false,
};

const service = new WeeklyService();
const good = await service.generateCoursewareV2(sprint);
assert.equal(good.preset, 'math');
assert.equal(good.lessonKind, 'sprint_review');

let blocked = null;
try {
  await service.generateCoursewareV2({
    preset: 'math',
    lessonKind: 'sprint_review',
    title: '坏例',
    points: ['模型'],
    examples: [{
      title: '例 A',
      problem: '（1）第一问（2）第二问（3）第三问',
      subQuestions: [
        { goal: '口号', entry: '看图', steps: [{ label: '写', text: 'AB=c' }], answer: '答案A' },
      ],
    }],
    saveToDraft: false,
  });
} catch (error) {
  blocked = error;
}
assert.equal(blocked?.code, 'COURSEWARE_QUALITY_BLOCKED');
assert.equal(blocked.issues.some((issue) => issue.code === 'SUBQUESTION_MISMATCH'), true);
assert.equal(blocked.issues.some((issue) => issue.code === 'MATH_LATEX_MISSING'), true);

function upload(html, fileName) {
  return {
    fileName,
    contentType: 'text/html',
    size: Buffer.byteLength(html),
    bytes: Buffer.from(html).toString('base64'),
    topicName: '相似压轴',
    category: '数学',
  };
}

const rendered = renderCoursewarePair(sprint);
const userId = 'teacher-courseware-preflight';
service.requireTeacher = async () => ({ userId, host: 'https://teach.test', token: 'fixture' });
service.drafts.set(service.draftKey(userId), {
  updatedAt: 1,
  context: { classId: 'class-1', courseId: 'course-1', lessonId: 'lesson-1' },
  step1: {},
  step2: {
    student: upload(rendered.studentHtml, 'student.html'),
    teacher: upload(rendered.teacherHtml, 'teacher.html'),
  },
  step3: {},
});

const dryRun = createTools(service).find((item) => item.name === 'tiku_weekly_dry_run');
const passed = await dryRun.execute();
assert.equal(passed.ok, true);
assert.equal(passed.batch.blocked.some((item) => item.id === 'courseware.quality'), false);

service.drafts.set(service.draftKey(userId), {
  updatedAt: 2,
  context: { classId: 'class-1', courseId: 'course-1', lessonId: 'lesson-1' },
  step1: {},
  step2: {
    student: upload(rendered.studentHtml.replace('data-learning-only="true"', 'data-learning-only="false"'), 'student.html'),
    teacher: upload(rendered.teacherHtml, 'teacher.html'),
  },
  step3: {},
});
const failed = await dryRun.execute();
assert.equal(failed.ok, true);
assert.equal(failed.batch.blocked.some((item) => item.code === 'STUDENT_ANSWER_LEAK'), true);

const conclusion = '所以 $x=2$';
const practiceAnswer = '练习答案只给老师：$x=2$';
const worked = renderCoursewarePair({
  subject: 'math',
  lessonKind: 'sprint_review',
  title: '边界课',
  points: ['模型'],
  formula: '$$x=2$$',
  examples: [{
    title: '例 1',
    problem: '（1）求 $x$',
    teacherNote: '教师讲稿只给老师：先让学生说出辅助线。',
    subQuestions: [{
      label: '（1）',
      goal: '求出 $x$',
      entry: '设 $x$',
      steps: [
        { label: '推导', text: '由题意得 $x+1=3$' },
        { label: '结论', text: conclusion },
      ],
      answer: practiceAnswer,
      pitfall: '漏写检验',
    }],
  }],
});
assert.equal(worked.issues.some((issue) => issue.code === 'STUDENT_ANSWER_LEAK'), false);
assert.match(worked.studentHtml, /由题意得/);
assert.match(worked.studentHtml, /所以 \$x=2\$/);
assert.doesNotMatch(worked.studentHtml, /练习答案只给老师/);
assert.doesNotMatch(worked.studentHtml, /教师讲稿只给老师/);
assert.match(worked.teacherHtml, /练习答案只给老师/);
assert.match(worked.teacherHtml, /教师讲稿只给老师/);

const sameWords = renderCoursewarePair({
  subject: 'math',
  lessonKind: 'new_lesson',
  title: '结论原文相同',
  points: ['模型'],
  formula: '$$x=2$$',
  example: {
    title: '例 1',
    problem: '求 $x$',
    steps: [
      { label: '推导', text: '由题意得 $x+1=3$' },
      { label: '答案', text: conclusion },
    ],
    teacherNote: '教师讲稿只给老师',
  },
});
assert.equal(sameWords.issues.some((issue) => issue.code === 'STUDENT_ANSWER_LEAK'), false);
assert.match(sameWords.studentHtml, /所以 \$x=2\$/);
assert.doesNotMatch(sameWords.studentHtml, /教师讲稿只给老师/);

console.log('courseware preflight dry_run checks passed');
