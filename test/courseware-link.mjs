/**
 * Lesson courseware binding: reuse an existing topic, or create one and link
 * it before the teacher upload. Also keeps the teacher file name off the
 * student upload record.
 *
 *   node test/courseware-link.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compilePlan, runStep } from '../lib/plan.js';
import { WeeklyService } from '../lib/service.js';
import { createTools } from '../lib/tools.js';

const HOST = 'https://teach.test';
const LESSON = '11111111-1111-4111-8111-111111111111';

function input(topicMode, extra = {}) {
  return {
    teacherId: 'teacher-1',
    host: HOST,
    context: { classId: 'class-math', courseId: 'course-1', lessonId: LESSON },
    step1: extra.step1 ?? {},
    step2: {
      topicMode,
      ...(topicMode === 'reuse' ? { coursewareTopicId: 326 } : {}),
      ...extra.step2,
      student: { fileName: 'student.html', contentType: 'text/html', size: 12, topicName: '第 1 课' },
      teacher: { fileName: 'teacher.html', size: 20, ...(topicMode === 'reuse' ? { topicId: 326 } : {}) },
    },
  };
}

const created = compilePlan(input('create_and_link', { step2: { lessonTitle: '相似压轴 · 第 25 题' } }));
const createdIds = created.steps.map((step) => step.id);
assert.deepEqual(createdIds, [
  'courseware.student',
  'courseware.student.topic',
  'courseware.lesson.link',
  'courseware.teacher',
]);
const createTopic = created.steps.find((step) => step.id === 'courseware.student.topic');
const link = created.steps.find((step) => step.id === 'courseware.lesson.link');
const teacher = created.steps.find((step) => step.id === 'courseware.teacher');
assert.equal(createTopic.method, 'POST');
assert.equal(createTopic.body.resource_meta.studentFileName, 'student.html');
assert.equal(createTopic.body.resource_meta.uploadedFileName, undefined);
assert.equal(link.method, 'PATCH');
assert.equal(link.body.topic_id, '@courseware.student.topic');
assert.equal(link.body.title, '相似压轴 · 第 25 题');
assert.equal(link.meta.dependsOn, 'courseware.student.topic');
assert.equal(teacher.body.topic_id, '@courseware.student.topic');
assert.equal(teacher.body.file_name, 'teacher.html');
assert.equal(teacher.meta.dependsOn, 'courseware.lesson.link');
assert.ok(createdIds.indexOf('courseware.lesson.link') < createdIds.indexOf('courseware.teacher'));

const reused = compilePlan(input('reuse'));
assert.deepEqual(reused.steps.map((step) => step.id), [
  'courseware.student',
  'courseware.student.topic',
  'courseware.teacher',
]);
const reusedTopic = reused.steps.find((step) => step.id === 'courseware.student.topic');
assert.equal(reusedTopic.method, 'PATCH');
assert.match(reusedTopic.pathname, /id=eq\.326/);
assert.equal(reusedTopic.body.resource_meta.studentFileName, 'student.html');
assert.equal(reusedTopic.body.resource_meta.uploadedFileName, undefined);
const reusedTeacher = reused.steps.find((step) => step.id === 'courseware.teacher');
assert.equal(reusedTeacher.body.topic_id, '326');
assert.equal(reusedTeacher.body.file_name, 'teacher.html');

const renamed = compilePlan(input('reuse', { step1: { lessonTitle: '相似压轴 · 第 25 题' } }));
const rename = renamed.steps.find((step) => step.id === 'courseware.lesson.link');
assert.equal(rename.body.topic_id, '326');
assert.equal(rename.body.title, '相似压轴 · 第 25 题');
assert.ok(renamed.steps.findIndex((step) => step.id === 'courseware.lesson.link')
  < renamed.steps.findIndex((step) => step.id === 'courseware.teacher'));

const explicitNew = compilePlan(input('create_and_link', { step2: { coursewareTopicId: 326 } }));
assert.equal(explicitNew.steps.find((step) => step.id === 'courseware.student.topic').method, 'POST');
assert.equal(explicitNew.steps.find((step) => step.id === 'courseware.lesson.link').body.topic_id, '@courseware.student.topic');

const savedFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('/lessons') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body);
      return Response.json([{ id: LESSON, title: body.title ?? '旧课次', topic_id: body.topic_id === 400 ? 1 : body.topic_id }]);
    }
    return Response.json([]);
  };
  await assert.rejects(
    () => runStep(link, {
      host: HOST,
      token: 'token',
      context: { lessonId: LESSON },
      step1: {},
      step2: input('create_and_link').step2,
      step3: {},
      resolved: { topicId: 400, lessonId: LESSON },
    }),
    (error) => {
      assert.equal(error.code, 'LESSON_TOPIC_UNCONFIRMED');
      return true;
    },
  );

  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('action=courseware-upload')) {
      return Response.json({
        success: true,
        topic: {
          id: 326,
          resource_meta: {
            source: 'tiku-weekly',
            studentFileName: 'student.html',
            uploadedFileName: 'student.html',
            courseware_html: { html_url: '/courseware/teacher/x/deck.html', teacher_only: true },
          },
        },
      });
    }
    if (href.includes('/topics') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body);
      return Response.json([{ id: 326, resource_meta: body.resource_meta }]);
    }
    return Response.json([]);
  };
  const html = new TextEncoder().encode('<!doctype html><p>teacher</p>');
  const uploaded = await runStep(reusedTeacher, {
    host: HOST,
    token: 'token',
    context: { courseId: 'course-1', lessonId: LESSON },
    step1: {},
    step2: {
      student: { fileName: 'student.html' },
      teacher: { fileName: 'teacher.html', size: html.length, file: { bytes: html, size: html.length } },
    },
    step3: {},
    resolved: { courseId: 'course-1', lessonId: LESSON, topicId: 326 },
  });
  assert.equal(uploaded.resource_meta.uploadedFileName, 'teacher.html');
  assert.equal(uploaded.resource_meta.studentFileName, 'student.html');
  assert.equal(uploaded.resource_meta.courseware_html.html_url, '/courseware/teacher/x/deck.html');
  assert.notEqual(uploaded.payload.topic.resource_meta.uploadedFileName, 'student.html');
} finally {
  globalThis.fetch = savedFetch;
}

const root = mkdtempSync(join(tmpdir(), 'tkw-link-'));
try {
  const service = new WeeklyService();
  service.courseDraftRoot = root;
  service.requireTeacher = async () => ({ userId: 'teacher-link', host: HOST, token: 'token' });
  await service.putDraftSection('step2', {
    context: { classId: 'class-math', courseId: 'course-1', lessonId: LESSON },
    step2: { coursewareTopicId: 1 },
  });
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/lessons')) return Response.json([{ id: LESSON, title: '相似压轴 · 第 25 题', topic_id: 326 }]);
    if (href.includes('/topics')) return Response.json([{ id: 326, name: '第 1 课', html_url: 'https://oss.example/student.html' }]);
    return Response.json([]);
  };
  const listed = await service.listOpenCourseDrafts();
  assert.equal(listed.courseDrafts[0].coursewareTopicId, 326);
  assert.equal(listed.courseDrafts[0].lessonTitle, '相似压轴 · 第 25 题');
  assert.equal(listed.courseDrafts[0].html_url, 'https://oss.example/student.html');
  const lessons = createTools(service).find((tool) => tool.name === 'tiku_weekly_lessons');
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/chapters')) return Response.json([{ id: 'chapter-1', course_id: 'course-1', title: '一模', order_no: 1 }]);
    if (href.includes('/lessons')) return Response.json([{ id: LESSON, title: '相似压轴 · 第 25 题', chapter_id: 'chapter-1', topic_id: 326, order_no: 1 }]);
    if (href.includes('/topics')) return Response.json([{ id: 326, name: '第 1 课', html_url: 'https://oss.example/student.html' }]);
    return Response.json([]);
  };
  const read = await lessons.execute({ courseId: 'course-1' });
  assert.equal(read.ok, true);
  assert.equal(read.lessons[0].coursewareTopicId, 326);
  assert.equal(read.lessons[0].lessonTitle, '相似压轴 · 第 25 题');
  assert.equal(read.lessons[0].html_url, 'https://oss.example/student.html');
} finally {
  globalThis.fetch = savedFetch;
  rmSync(root, { recursive: true, force: true });
}

console.log('courseware lesson link checks passed');
