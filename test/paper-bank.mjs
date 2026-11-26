import assert from 'node:assert/strict';
import test from 'node:test';
import { createTools } from '../lib/tools.js';
import { WeeklyService } from '../lib/service.js';

test('教师工具只经 Tiku 访问 EDU、题库和远程上传接口', async t => {
  const service = new WeeklyService();
  service.requireTeacher = async () => ({ host: 'https://teach.tongchengweilai.com', token: 'fixture' });
  const tools = createTools(service);
  const run = (name, args) => tools.find(tool => tool.name === 'tiku_weekly_' + name).execute(args);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, req) => {
    const u = new URL(url), body = JSON.parse(req.body);
    assert.equal(u.host, 'tiku.tongchengweilai.com');
    assert.equal(req.headers.Authorization, 'Bearer fixture');
    calls.push(body);
    if (u.pathname.endsWith('edu-import')) {
      if (body.action === 'preview') return Response.json({ data: { exam: { question_count: 25 }, questions: Array(25).fill({}), type_counts: { blank: 25 } } });
      return Response.json({ data: { question_ids: ['q'], exam_id: body.mode === 'exam' ? 'e' : null } });
    }
    if (u.pathname.endsWith('question-data')) return Response.json({ questions: [{ id: 'a' }, { id: 'b' }], count: 2 });
    if (u.pathname.endsWith('upload-image')) return Response.json({ url: 'https://oss.test/image.png' });
    return Response.json({ ok: false, dimensions: { width: 80, height: 60 }, contentLength: 200, issues: [{ code: 'image_low_resolution' }] });
  });
  const list = { keyword: '一模', page: 2, limit: 3, status: 'open', type: 'testpaper' };
  await run('edu_list', list);
  assert.deepEqual(calls.at(-1), { action: 'list', ...list });
  assert.equal((await run('edu_preview', { assessmentId: '9' })).data.questions.length, 25);
  const args = { assessmentId: '9', targetKnowledgeId: '42' };
  assert.equal((await run('edu_import', args)).dryRun, true);
  assert.equal(calls.at(-1).action, 'preview');
  const before = calls.length;
  assert.equal((await run('edu_import', { assessmentId: '9', confirm: true })).ok, false);
  assert.equal(calls.length, before);
  for (const mode of ['questions', 'exam']) {
    const result = await run('edu_import', { ...args, confirm: true, mode, ...(mode === 'exam' ? { duplicateCheck: false } : {}) });
    assert.deepEqual(result.data.question_ids, ['q']);
    assert.equal(calls.at(-1).duplicate_check, mode === 'questions');
    assert.equal(calls.at(-1).target_knowledge_id, '42');
    assert.equal(calls.at(-1).mode, mode);
  }
  const filters = { category: '26 一模试卷', page: 2, limit: 10, fromNumber: 11, toNumber: 20 };
  await run('bank_search', filters);
  assert.deepEqual(calls.at(-1), { ...filters, action: 'bank_search' });
  assert.equal((await run('bank_get', { questionIds: ['a', 'b'] })).questions.length, 2);
  assert.equal((await run('bank_get', { questionId: 'missing' })).error.code, 'BANK_NOT_FOUND');
  const small = await run('paper_image_upload', { url: 'https://oss.test/source.png' });
  assert.equal(small.error.code, 'IMAGE_TOO_SMALL');
  assert.equal(small.error.issues[0].contentLength, 200);
});

test('线上历史填空题可绑定并通过预检，未知题型仍拦截', async () => {
  const { canonicalQuestionType, bindingEvidence, preflight } = await import('../lib/paper-bank.js');
  for (const type of ['fill_blank', 'fill', 'fill-in-blank', 'blank', 'unknown']) {
    const q = { type, content: '1+1=?', correct_option: '2', score: 1, reuseQuestionId: 'q1' };
    const bankRow = { ...q, id: 'q1', type: 'blank' };
    const match = bindingEvidence(q, bankRow, 1, null, () => 1);
    const report = await preflight({ bankRows: async () => [bankRow] }, {}, { questions: [q] });
    assert.equal(report.ok, type !== 'unknown');
    assert.equal(match.type, type !== 'unknown');
    assert.equal(canonicalQuestionType(type), type === 'unknown' ? 'unknown' : 'blank');
  }
});
