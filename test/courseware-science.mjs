/**
 * Physics and chemistry use the science sprint template, and example or
 * concept pages keep their figures.
 *
 *   node test/courseware-science.mjs
 */
import assert from 'node:assert/strict';
import { buildCourseSpec, preflightMathCourse, renderCoursewarePair } from '../lib/courseware-v2.js';

const figures = [
  { src: 'data:image/png;base64,aaaa', caption: '图 1' },
  { src: 'data:image/png;base64,bbbb', caption: '图 2' },
  { src: 'data:image/png;base64,cccc', caption: '图 3' },
];

function sprint(subject) {
  return {
    subject,
    title: `${subject} 一模压轴`,
    coverGoal: '会按问拆开写。',
    points: ['适用条件'],
    formula: '$$F=ma$$',
    examples: [{
      title: '压轴',
      problem: '（1）求速度（2）求力（3）求功率',
      subQuestions: [
        { label: '（1）', goal: '速度', entry: '先画过程', steps: [{ label: '公式', text: '由 $v=s/t$ 得速度' }], answer: '2 m/s', pitfall: '漏单位' },
        { label: '（2）', goal: '力', entry: '受力分析', steps: [{ label: '公式', text: '由 $F=ma$ 得力' }], answer: '4 N' },
        { label: '（3）', goal: '功率', entry: '用 $P=Fv$', steps: [{ label: '公式', text: '由 $P=Fv$ 得功率' }], answer: '8 W', figures },
      ],
    }],
  };
}

for (const subject of ['physics', 'chemistry']) {
  const spec = buildCourseSpec(sprint(subject));
  assert.equal(spec.preset.key, subject === 'physics' ? 'phys' : 'chem');
  assert.equal(spec.course.lessonKind, 'sprint_review');
  const cover = spec.course.slides.find((slide) => slide.type === 'cover');
  assert.equal(cover.studentFlow.length, 3);
  assert.equal(cover.teacherFlow.length, 3);
  const pages = spec.course.slides.filter((slide) => slide.type === 'worked-example' && !slide.continuation);
  assert.equal(pages.length, 3);
  assert.ok(pages.every((slide) => (slide.figures || []).length <= 2));
  const crowded = spec.course.slides.find((slide) => (slide.figures || []).length === 2);
  assert.ok(crowded);
  assert.equal(spec.course.slides.some((slide) => slide.type === 'math-interactive'), false);
  assert.equal(spec.course.slides.some((slide) => slide.type === 'chem-sim'), false);
  const rendered = renderCoursewarePair(sprint(subject));
  assert.match(rendered.studentHtml, /data-katex="offline"/);
  assert.match(rendered.studentHtml, /function renderFigures/);
  assert.match(rendered.studentHtml, /data:image\/png;base64,aaaa/);
  assert.match(rendered.teacherHtml, /目标/);
  assert.match(rendered.teacherHtml, /切入点 \/ 辅助线/);
  assert.equal(rendered.issues.some((issue) => issue.code === 'IMAGE_DENSITY_EXCEEDED'), false);
  assert.equal(rendered.issues.some((issue) => issue.code === 'MATH_LATEX_MISSING'), false);
}

const plain = renderCoursewarePair({
  subject: 'physics',
  title: '力学图',
  slides: [
    { type: 'cover', stage: 'study' },
    {
      type: 'kp-pitfall',
      stage: 'study',
      formula: '$$F=ma$$',
      points: ['同体'],
      figures: [{ src: 'data:image/png;base64,kp', alt: '概念图', caption: '概念图注' }],
    },
    {
      type: 'worked-example',
      stage: 'study',
      title: '例题',
      problem: '看图求力',
      steps: [{ label: '公式', text: '由 $F=ma$ 得力' }],
      figures: [{ src: 'data:image/png;base64,ex', alt: '原卷图', caption: '例题图注' }],
      subQuestions: [{ label: '（1）', goal: '力', entry: '受力', steps: [{ label: '公式', text: '由 $F=ma$ 得力' }], answer: '4 N' }],
    },
  ],
});
assert.match(plain.studentHtml, /function renderFigures/);
assert.match(plain.studentHtml, /data:image\/png;base64,kp/);
assert.match(plain.studentHtml, /概念图注/);
assert.match(plain.studentHtml, /data:image\/png;base64,ex/);
assert.match(plain.studentHtml, /例题图注/);
assert.equal((plain.studentHtml.match(/renderFigures\(slide\)/g) || []).length >= 2, true);
assert.match(plain.studentHtml, /@media \(max-width: 860px\)/);
assert.match(plain.studentHtml, /\.example-figures \{ grid-template-columns: 1fr; \}/);

const bareCover = preflightMathCourse({
  id: 'phys',
  subject: 'phys',
  lessonKind: 'new_lesson',
  slides: [
    { type: 'cover', stage: 'study' },
    { type: 'kp-pitfall', stage: 'study', formula: 'F=ma', figures: figures },
    { type: 'worked-example', stage: 'study', problem: '（1）求 a', steps: [{ text: 'a=F/m' }] },
    { stage: 'entrance' },
    { stage: 'exit' },
  ],
}, { studentHtml: 'data-learning-only="true" data-stage-nav="false" const COURSE = {};\n  const ROLE', teacherHtml: 'data-stage-nav="true"' });
assert.equal(bareCover.some((issue) => issue.message.includes('studentFlow')), true);
assert.equal(bareCover.some((issue) => issue.code === 'MATH_LATEX_MISSING'), true);
assert.equal(bareCover.some((issue) => issue.code === 'IMAGE_DENSITY_EXCEEDED'), true);

console.log('courseware science checks passed');
