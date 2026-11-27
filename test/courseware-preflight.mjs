/**
 * Math courseware preflight blocks bad drafts at generate time and at dry_run.
 *
 *   node test/courseware-preflight.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCourseSpec, choiceGrade, ENGLISH_TTS, preflightMathCourse, renderCoursewarePair } from '../lib/courseware-v2.js';
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

const checks = renderCoursewarePair({
  subject: 'math',
  lessonKind: 'new_lesson',
  title: '随堂判题键',
  points: ['模型'],
  formula: '$$x=2$$',
  inlineCheck: {
    prompt: '这一问选什么',
    options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'],
    answer: 'C',
  },
  quickCheck: {
    question: '再选一次',
    options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'],
    answer: 'B',
  },
  example: {
    title: '例 1',
    problem: '求 $x$',
    answer: '例题答案只给老师',
    steps: [{ label: '推导', text: '由题意得 $x+1=3$，所以 $x=2$' }],
  },
});
assert.equal(checks.issues.some((issue) => issue.code === 'STUDENT_ANSWER_LEAK'), false);
assert.match(checks.studentHtml, /"answer":"C"/);
assert.match(checks.studentHtml, /"answer":"B"/);
assert.doesNotMatch(checks.studentHtml, /例题答案只给老师/);
assert.match(checks.studentHtml, /function choiceGrade/);
assert.match(checks.studentHtml, /已展开讲解，请对照自己的选择/);
assert.doesNotMatch(checks.studentHtml, /正确答案是 " \+ ic\.answer/);
assert.doesNotMatch(checks.studentHtml, /正确答案是 " \+ slide\.answer/);
assert.doesNotMatch(checks.studentHtml, /正确答案是 undefined/);
const wrongPick = choiceGrade('A', 'C', '，看完解析即可继续。');
assert.equal(wrongPick.graded, true);
assert.equal(wrongPick.correct, false);
assert.equal(wrongPick.revealKey, 'C');
assert.match(wrongPick.message, /正确答案是 C/);
assert.doesNotMatch(wrongPick.message, /undefined/);
for (const missing of [undefined, null, '', '4']) {
  const fallback = choiceGrade('B', missing, '，已展开三级讲解。');
  assert.equal(fallback.graded, false);
  assert.equal(fallback.correct, false);
  assert.equal(fallback.revealKey, '');
  assert.equal(fallback.message, '已展开讲解，请对照自己的选择');
  assert.doesNotMatch(fallback.message, /undefined/);
}

function hiddenCheck(answer) {
  return renderCoursewarePair({
    subject: 'math',
    lessonKind: 'new_lesson',
    title: '随堂判题键',
    points: ['模型'],
    formula: '$$x=2$$',
    inlineCheck: { prompt: '填空', options: ['A. 甲', 'B. 乙'], answer },
    quickCheck: { question: '再填一次', options: ['A. 甲', 'B. 乙'], answer },
    example: {
      title: '例 1',
      problem: '求 $x$',
      steps: [{ label: '推导', text: '由题意得 $x+1=3$，所以 $x=2$' }],
    },
  });
}
for (const answer of ['4', '0', '重力加速度']) {
  const hidden = hiddenCheck(answer);
  const needle = `"answer":${JSON.stringify(answer.toUpperCase())}`;
  assert.equal(hidden.studentHtml.includes(needle), false, answer);
  assert.equal(hidden.teacherHtml.includes(needle), true, answer);
  assert.equal(hidden.issues.some((issue) => issue.code === 'STUDENT_ANSWER_LEAK'), false, answer);
}
const leftover = preflightMathCourse({
  id: 'math',
  subject: 'math',
  lessonKind: 'new_lesson',
  slides: [
    { type: 'cover', stage: 'study' },
    { type: 'kp-pitfall', stage: 'study', formula: '$$a=1$$', inlineCheck: { answer: '4' } },
    { type: 'worked-example', stage: 'study', problem: '求 $x$', steps: [{ text: '所以 $x=2$' }] },
    { type: 'quick-check', stage: 'study', answer: '0' },
    { stage: 'entrance' },
    { stage: 'exit' },
  ],
}, {
  studentHtml: 'data-learning-only="true" data-stage-nav="false" const COURSE = {"answer":"4","answer":"0"};\n  const ROLE',
});
assert.equal(leftover.some((issue) => issue.code === 'STUDENT_ANSWER_LEAK'), true);

const formula = '$\\left(a-1-\\dfrac{3}{a+1}\\right)\\div x$';
const formulaLesson = renderCoursewarePair({
  subject: 'math',
  lessonKind: 'new_lesson',
  title: '公式原样',
  points: ['保持定界符'],
  formula,
  example: {
    title: '例 1',
    problem: '求 $x$',
    steps: [{ label: '推导', text: '所以 $x=1$' }],
  },
});
const storedFormula = buildCourseSpec({
  subject: 'math',
  lessonKind: 'new_lesson',
  title: '公式原样',
  points: ['保持定界符'],
  formula,
  example: {
    title: '例 1',
    problem: '求 $x$',
    steps: [{ label: '推导', text: '所以 $x=1$' }],
  },
}).course.slides.find((slide) => slide.formula)?.formula;
assert.equal(storedFormula, formula);
assert.ok(formulaLesson.studentHtml.includes(JSON.stringify(formula).slice(1, -1)));
assert.equal(formulaLesson.studentHtml.includes(JSON.stringify(`$$${formula}$$`).slice(1, -1)), false);
assert.equal(formulaLesson.studentHtml.includes(JSON.stringify(formula.replace(/\\/g, '\\\\')).slice(1, -1)), false);
assert.equal((formulaLesson.studentHtml.match(/@font-face/g) || []).length, 20);
assert.match(formulaLesson.studentHtml, /\\neq|neq/);

const unequal = renderCoursewarePair({
  subject: 'math',
  lessonKind: 'new_lesson',
  title: '不等号',
  points: ['字体'],
  formula: '$$x \\neq 2$$',
  example: {
    title: '例 1',
    problem: '判断 $x \\neq 2$',
    steps: [{ label: '判断', text: '所以 $x \\neq 2$' }],
  },
});
assert.equal((unequal.studentHtml.match(/@font-face/g) || []).length, 20);
assert.match(unequal.studentHtml, /\\neq/);
assert.equal((unequal.studentHtml.match(/font-family:KaTeX_Main/g) || []).length > 0, true);

const english = renderCoursewarePair({
  subject: 'eng',
  title: 'Hello',
  passageParagraphs: [{ en: 'Hello.', cn: '你好。' }],
});
assert.doesNotMatch(english.studentHtml, /en-GB|英式|英音/);
assert.doesNotMatch(english.teacherHtml, /en-GB|英式|英音/);
assert.match(english.studentHtml, /en-US/);
assert.match(english.studentHtml, /美式朗读全文/);
const pluginSource = [
  readFileSync(new URL('../lib/courseware-v2.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../lib/tools.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../lib/teacher-page.js', import.meta.url), 'utf8'),
].join('\n');
assert.doesNotMatch(pluginSource, /en-GB|英式发音|英音/);
assert.equal(ENGLISH_TTS.lang, 'en-US');
assert.equal(ENGLISH_TTS.female, 'en-US-JennyNeural');
assert.equal(ENGLISH_TTS.femaleAlt, 'en-US-AriaNeural');
assert.equal(ENGLISH_TTS.male, 'en-US-GuyNeural');

console.log('courseware preflight dry_run checks passed');
