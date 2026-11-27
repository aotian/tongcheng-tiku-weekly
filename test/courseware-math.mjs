/**
 * Math exercise lessons use the math cover, one page per example, and no
 * parabola sandbox unless it is explicitly requested.
 *
 *   node test/courseware-math.mjs
 */
import assert from 'node:assert/strict';
import { buildCourseSpec, renderCoursewarePair } from '../lib/courseware-v2.js';

const lesson = {
  preset: 'math',
  title: '相似压轴 · 第 25 题',
  coverGoal: '会用三个模型做第 25 题。',
  points: ['三个模型'],
  examples: [
    {
      title: '例 1',
      problem: '题干甲',
      source: '2024 闵行一模第 25 题',
      steps: [{ label: '设', text: '先设对应边' }],
      figures: ['data:image/png;base64,aaaa'],
    },
    {
      title: '例 2',
      problem: '题干乙',
      steps: [{ label: '证', text: '再证相似' }],
      figure: { src: 'data:image/png;base64,bbbb', alt: '原卷图乙' },
    },
  ],
};

const spec = buildCourseSpec(lesson);
const cover = spec.course.slides.find((slide) => slide.type === 'cover');
assert.equal(cover.studentFlow[0].title, '核心概念与公式');
assert.equal(cover.studentFlow[1].title, '分步例题');
assert.equal(cover.studentFlow[2].title, '随堂自检');
assert.equal(spec.course.slides.filter((slide) => slide.type === 'worked-example').length, 2);
assert.equal(spec.course.slides.find((slide) => slide.id === 'example-1').figures[0].src, 'data:image/png;base64,aaaa');
assert.equal(spec.course.slides.find((slide) => slide.id === 'example-2').figures[0].alt, '原卷图乙');
assert.equal(spec.course.slides.some((slide) => slide.type === 'math-interactive'), false);
assert.equal(spec.course.slides.some((slide) => String(slide.formula || '').includes('分式方程')), false);
assert.equal(spec.course.slides.find((slide) => slide.id === 'handoff').nextTasks.some((task) => task.name.includes('出门清')), false);

const rendered = renderCoursewarePair(lesson);
assert.doesNotMatch(rendered.teacherHtml, /body\[data-role="teacher"\] \.cw-three-dots \{ display:\s*none/);
assert.match(rendered.teacherHtml, /body\[data-role="teacher"\]\[data-stage-nav="true"\] \.cw-three-dots \{ display: flex; \}/);
assert.doesNotMatch(rendered.teacherHtml, /id="cw-mobile-auto"/);
assert.match(rendered.teacherHtml, /data-stage-nav="true"/);
assert.match(rendered.teacherHtml, /id="threeDots"/);
assert.match(rendered.teacherHtml, /进门考/);
assert.match(rendered.teacherHtml, /课程学习/);
assert.match(rendered.teacherHtml, /出门清/);
assert.match(rendered.studentHtml, /核心概念与公式/);
assert.doesNotMatch(rendered.studentHtml, /听读与核心词汇/);
assert.match(rendered.studentHtml, /data:image\/png;base64,aaaa/);
assert.match(rendered.studentHtml, /@media \(max-width: 860px\)/);
assert.match(rendered.studentHtml, /grid-template-columns: 1fr/);

const demo = buildCourseSpec({ preset: 'math', title: '分式方程的解法与增根检验' });
assert.equal(demo.course.slides.some((slide) => slide.type === 'math-interactive'), true);
assert.equal(demo.course.slides.some((slide) => slide.type === 'worked-example'), true);

const withLab = buildCourseSpec({
  preset: 'math',
  title: '二次函数',
  points: ['开口'],
  includeMathSandbox: true,
});
assert.equal(withLab.course.slides.some((slide) => slide.type === 'math-interactive'), true);
assert.equal(withLab.course.slides.find((slide) => slide.type === 'cover').studentFlow[1].title, '分步例题与参数实验');

const english = buildCourseSpec({ preset: 'eng', title: 'Animals' });
assert.equal(english.course.slides.find((slide) => slide.type === 'cover').studentFlow[0].title, '听读与核心词汇');

const custom = buildCourseSpec({
  preset: 'math',
  title: '自定义页',
  slides: [
    { id: 'c', type: 'cover', stage: 'study', audience: 'both' },
    {
      id: 'e',
      type: 'worked-example',
      stage: 'study',
      audience: 'both',
      problem: '题',
      steps: [{ label: '1', text: '2' }],
      images: ['data:image/png;base64,cccc'],
    },
  ],
});
assert.equal(custom.course.slides.find((slide) => slide.type === 'cover').studentFlow[0].title, '核心概念与公式');
assert.equal(custom.course.slides.find((slide) => slide.type === 'worked-example').figures[0].src, 'data:image/png;base64,cccc');
assert.equal(custom.course.lessonKind, 'new_lesson');
assert.equal(custom.course.slides.some((slide) => slide.stage === 'entrance'), true);

const sprint = {
  subject: 'math',
  preset: 'nce',
  lessonKind: 'sprint_review',
  title: '相似压轴 · 第 25 题',
  points: ['三个模型'],
  formula: '$$\\triangle ABC \\sim \\triangle DEF$$',
  examples: [
    {
      title: '例 1',
      problem: '（1）求 $AB$（2）求 $BC$（3）求 $AC$',
      figures: ['data:image/png;base64,f1', 'data:image/png;base64,f2', 'data:image/png;base64,f3'],
      subQuestions: [
        { label: '（1）', goal: '证明相似', entry: '作 $DE \\parallel BC$', steps: [{ label: '推导', text: '由 $DE \\parallel BC$ 得 $\\angle ADE = \\angle ABC$' }], answer: '第一问答案 $AB=2$', pitfall: '漏掉平行线' },
        { label: '（2）', goal: '求对应边', entry: '用比例 $AB/DE=BC/EF$', steps: [{ label: '推导', text: '写出 $\\dfrac{AB}{DE}=\\dfrac{BC}{EF}$' }], answer: '第二问答案 $BC=4$', pitfall: '对应边写反' },
        { label: '（3）', goal: '求线段比', entry: '回到公共角', steps: [{ label: '推导', text: '由相似比得 $\\dfrac{AC}{DF}=2$' }], answer: '第三问答案 $AC=6$', pitfall: '漏掉第（3）问' },
      ],
    },
  ],
};
const sprintSpec = buildCourseSpec(sprint);
assert.equal(sprintSpec.preset.key, 'math');
assert.equal(sprintSpec.course.lessonKind, 'sprint_review');
assert.equal(sprintSpec.course.slides.filter((slide) => slide.type === 'worked-example').length, 3);
assert.equal(sprintSpec.course.slides.every((slide) => (slide.figures || []).length <= 2), true);
const sprintHtml = renderCoursewarePair(sprint);
assert.deepEqual(sprintHtml.issues, []);
assert.match(sprintHtml.studentHtml, /data-learning-only="true"/);
assert.match(sprintHtml.studentHtml, /data-stage-nav="false"/);
assert.match(sprintHtml.teacherHtml, /data-stage-nav="true"/);
assert.match(sprintHtml.teacherHtml, /第一问答案/);
assert.doesNotMatch(sprintHtml.studentHtml, /第一问答案/);
assert.doesNotMatch(sprintHtml.studentHtml, /"stage":"entrance"/);
assert.match(sprintHtml.studentHtml, /repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(sprintHtml.teacherHtml, /目标/);
assert.match(sprintHtml.teacherHtml, /切入点/);

const shell = buildCourseSpec({
  subject: 'math',
  lessonKind: 'sprint_review',
  title: '冲刺壳',
  slides: [
    { id: 'c', type: 'cover', stage: 'study', audience: 'both' },
    { id: 'k', type: 'kp-pitfall', stage: 'study', audience: 'both', points: ['模型'] },
    { id: 'e1', type: 'worked-example', stage: 'study', audience: 'both', problem: '（1）问（2）问（3）问', steps: [{ label: '写', text: '同样一句' }] },
    { id: 'e2', type: 'worked-example', stage: 'study', audience: 'both', problem: '（1）问（2）问（3）问', steps: [{ label: '写', text: '同样一句' }] },
    { id: 'h', type: 'student-handoff', stage: 'study', audience: 'student' },
  ],
});
assert.equal(shell.course.lessonKind, 'sprint_review');
assert.equal(shell.course.slides.some((slide) => slide.stage === 'entrance'), true);
assert.equal(shell.course.slides.some((slide) => slide.stage === 'exit'), true);
assert.notEqual(shell.course.slides.length, 5);

const bad = renderCoursewarePair({
  preset: 'math',
  lessonKind: 'sprint_review',
  title: '坏例',
  points: ['模型'],
  examples: [
    {
      title: '例 A',
      problem: '（1）第一问（2）第二问（3）第三问',
      steps: [{ label: '写', text: 'AB=c' }],
      subQuestions: [
        { label: '（1）', goal: '只写口号', entry: '看图', steps: [{ label: '写', text: 'AB=c' }], answer: '答案A' },
        { label: '（2）', goal: '只写口号', entry: '看图', steps: [{ label: '写', text: 'AB=c' }], answer: '答案B' },
      ],
    },
  ],
});
const codes = new Set(bad.issues.map((issue) => issue.code));
assert.equal(codes.has('SUBQUESTION_MISMATCH'), true);
assert.equal(codes.has('MATH_LATEX_MISSING'), true);
assert.equal(codes.has('GENERIC_BOILERPLATE_STEPS'), true);

console.log('courseware math checks passed');
