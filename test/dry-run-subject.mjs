import assert from 'node:assert/strict';
import test from 'node:test';
import { findUndefined } from '../lib/json-safe.js';
import { WeeklyService } from '../lib/service.js';
import { createTools } from '../lib/tools.js';

test('tiku_weekly_dry_run drops an omitted homework subject', async () => {
  const service = new WeeklyService();
  const userId = 'teacher-dry-run';
  service.requireTeacher = async () => ({ userId, host: 'https://teach.test', token: 'fixture' });
  service.drafts.set(service.draftKey(userId), {
    updatedAt: 1,
    context: { classId: 'class-1', courseId: 'course-1', lessonId: 'lesson-1' },
    step1: {},
    step2: {},
    step3: {
      homework: {
        title: '未填学科的作业',
        dueDate: '2026-11-27T15:00:00Z',
        items: [{ questionId: 'q1', score: 10 }],
      },
    },
  });

  const tool = createTools(service).find((item) => item.name === 'tiku_weekly_dry_run');
  const result = await tool.execute();
  assert.equal(result.ok, true);
  assert.deepEqual(findUndefined(result), []);

  const step = result.batch.steps.find((item) => item.id === 'homework.create');
  assert.ok(step, 'dry_run should preview the homework step');
  assert.equal(step.preview.homework.title, '未填学科的作业');
  assert.equal(Object.hasOwn(step.preview.homework, 'subject'), false);
  assert.equal(JSON.stringify(result).includes('undefined'), false);
});
