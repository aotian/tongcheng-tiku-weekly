import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeeklyService } from '../lib/service.js';
import { createTools } from '../lib/tools.js';

test('各班课件草稿分开保存，预演必须点名班级', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tkw-course-'));
  try {
    const service = new WeeklyService();
    service.courseDraftRoot = root;
    const userId = 'teacher-course';
    service.requireTeacher = async () => ({ userId, host: 'https://teach.test', token: 'fixture' });
    await service.putDraftSection('step3', {
      context: { classId: 'class-math' },
      step3: { homework: { title: '数学作业', dueDate: '2026-12-01T00:00:00Z', items: [{ questionId: 'q1', score: 4 }] } },
    });
    await service.putDraftSection('step3', {
      context: { classId: 'class-chem' },
      step3: { homework: { title: '化学作业', dueDate: '2026-12-01T00:00:00Z', items: [{ questionId: 'q2', score: 4 }] } },
    });

    const listed = await service.listOpenCourseDrafts();
    assert.deepEqual(listed.courseDrafts.map((item) => item.homeworkTitle).sort(), ['化学作业', '数学作业']);
    assert.equal((await service.getDraft('class-math')).draft.step3.homework.title, '数学作业');

    const dryRun = createTools(service).find((item) => item.name === 'tiku_weekly_dry_run');
    const math = await dryRun.execute({ classId: 'class-math' });
    assert.equal(math.ok, true);
    assert.equal(math.batch.steps.find((step) => step.id === 'homework.create').preview.homework.title, '数学作业');
    const ambiguous = await dryRun.execute({});
    assert.equal(ambiguous.ok, false);
    assert.equal(ambiguous.error.code, 'COURSE_DRAFT_AMBIGUOUS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('课件路径会读成文件内容，目录和缺字节会拒绝', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tkw-html-'));
  try {
    const studentPath = join(root, 'student.html');
    const teacherPath = join(root, 'teacher.html');
    writeFileSync(studentPath, '<!doctype html><p>student</p>');
    writeFileSync(teacherPath, '<!doctype html><p>teacher</p>');
    const service = new WeeklyService();
    service.courseDraftRoot = join(root, 'drafts');
    service.requireTeacher = async () => ({ userId: 'teacher-html', host: 'https://teach.test', token: 'fixture' });

    const saved = await service.putDraftSection('step2', {
      context: { classId: 'class-phys' },
      studentFile: studentPath,
      teacherFile: teacherPath,
    });
    assert.equal(saved.draft.step2.student.fileName, 'student.html');
    assert.equal(saved.draft.step2.student.contentType, 'text/html');
    assert.equal(saved.draft.step2.student.size, Buffer.byteLength('<!doctype html><p>student</p>'));
    assert.equal(Buffer.from(saved.draft.step2.student.bytes, 'base64').toString(), '<!doctype html><p>student</p>');
    assert.equal(saved.draft.step2.student.path, undefined);
    assert.equal(saved.draft.step2.teacher.fileName, 'teacher.html');

    const dryRun = createTools(service).find((item) => item.name === 'tiku_weekly_dry_run');
    const preview = await dryRun.execute({ classId: 'class-phys' });
    assert.equal(preview.ok, true);
    assert.equal(preview.batch.steps.some((step) => step.id === 'courseware.student'), true);

    const byPath = await service.putDraftSection('step2', {
      context: { classId: 'class-phys-path' },
      step2: { student: { path: studentPath, topicName: '第 1 课' }, teacher: { path: teacherPath } },
    });
    assert.equal(byPath.draft.step2.student.topicName, '第 1 课');
    assert.equal(byPath.draft.step2.student.path, undefined);
    assert.equal(byPath.draft.step2.student.bytes.length > 0, true);

    const inline = Buffer.from('<!doctype html><p>inline</p>').toString('base64');
    const kept = await service.putDraftSection('step2', {
      context: { classId: 'class-inline' },
      step2: {
        student: { fileName: 'kept.html', contentType: 'text/html', size: Buffer.from('<!doctype html><p>inline</p>').length, bytes: inline },
      },
    });
    assert.equal(kept.draft.step2.student.fileName, 'kept.html');
    assert.equal(Buffer.from(kept.draft.step2.student.bytes, 'base64').toString(), '<!doctype html><p>inline</p>');

    const dir = join(root, 'not-a-file');
    mkdirSync(dir);
    await assert.rejects(
      () => service.putDraftSection('step2', { context: { classId: 'class-bad' }, studentFile: dir }),
      { code: 'COURSEWARE_PATH_DIRECTORY' },
    );

    service.drafts.set(service.draftKey('teacher-html', 'class-stale'), {
      updatedAt: 'stale',
      context: { classId: 'class-stale' },
      step1: {},
      step2: { student: { path: studentPath } },
      step3: {},
    });
    const stale = await dryRun.execute({ classId: 'class-stale' });
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, 'INCOMPLETE_UPLOAD');
    assert.match(stale.error.message, /studentFile/);
    assert.equal(stale.error.message.includes('base64'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
