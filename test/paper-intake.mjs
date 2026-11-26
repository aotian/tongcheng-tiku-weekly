/**
 * End-to-end automated verification for:
 *  1. Paper intake (text PDF + scanned/multi-image with formulas & diagrams)
 *  2. Shared draft synchronization between GUI API and DSH chat tools
 *  3. Proofreading (flags, edit, split, merge, reorder, dedup reuse)
 *  4. Single-student matching, duplicate-name disambiguation, and preview ("接收人数：1")
 *  5. Official commit -> archive-only exam (draft) -> single-student targeted homework
 *  6. Partial failure retry & double-click idempotency (zero duplicate creations)
 *  7. Windows DSH overlap & responsive layout regression checks
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PaperIntakeService,
  PaperIntakeStore,
  computeQuestionFlags,
  matchStudentsByName,
} from '../lib/paper-intake.js';
import { createTools } from '../lib/tools.js';
import { renderTeacherPage } from '../lib/teacher-page.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    throw err;
  }
}

function makeFakeBackend({ failHomeworkOnce = false } = {}) {
  const state = {
    createdJobs: [],
    writtenDrafts: [],
    commits: [],
    createdExams: [],
    attachedExamQuestions: [],
    createdHomeworks: [],
    homeworkFailRemaining: failHomeworkOnce ? 1 : 0,
  };

  const students = [
    { id: 'stu-zhang-1', full_name: '张小明', email: 'zxm@test.edu', role: 'student' },
    { id: 'stu-zhang-2', full_name: '张小红', email: 'zxh@test.edu', role: 'student' },
    { id: 'stu-li-1', full_name: '李华', email: 'lh@test.edu', role: 'student' },
  ];

  const existingBank = [
    { id: 'bank-q-101', content: '计算：$\\frac{1}{2} + \\frac{1}{3} = ?$', type: 'fill-in-blank' },
  ];

  const deps = {
    async parseDocument({ fileName }) {
      return {
        success: true,
        data: {
          fileName,
          fileType: 'pdf',
          originalContent: '1. 计算：$\\frac{1}{2} + \\frac{1}{3} = ?$\n2. 如图，求阴影部分面积。',
          images: [
            { index: 1, page: 1, type: 'pdf_page', url: 'https://oss.test/pages/p1.png', contentType: 'image/png' },
          ],
          warnings: [],
        },
      };
    },
    async uploadImage({ fileName }) {
      return { success: true, url: `https://oss.test/uploads/${fileName}` };
    },
    async parseImportQuestions({ source_type, image_urls }) {
      if (source_type === 'image') {
        return {
          success: true,
          data: {
            questions: [
              {
                originalNo: '1',
                sourcePage: 1,
                type: 'open-ended',
                content: '已知分数方程 $\\frac{x}{3} + \\frac{1}{6} = \\frac{5}{6}$，如图数轴所示，求 $x$。',
                correct_option: '',
                images: [image_urls[0]],
                score: 15,
              },
              {
                originalNo: '2',
                sourcePage: 2,
                type: 'open-ended',
                content: '【待核对】求几何三角形面积，如图所示 [模糊]。',
                correct_option: '12',
                images: [],
                score: 20,
              },
            ],
          },
        };
      }
      return {
        success: true,
        data: {
          questions: [
            {
              originalNo: '1',
              sourcePage: 1,
              type: 'fill-in-blank',
              content: '计算：$\\frac{1}{2} + \\frac{1}{3} = ?$',
              correct_option: '5/6',
              images: [],
              score: 10,
            },
            {
              originalNo: '2',
              sourcePage: 1,
              type: 'open-ended',
              content: '计算：$\\frac{3}{4} - \\frac{2}{5}$，并写出通分过程。',
              correct_option: '',
              images: [],
              score: 15,
            },
            {
              originalNo: '3',
              sourcePage: 1,
              type: 'open-ended',
              content: '小明吃了蛋糕的 $\\frac{1}{4}$，小红吃了 $\\frac{2}{5}$，一共吃了几分之几？',
              correct_option: '13/20',
              images: [],
              score: 15,
            },
          ],
        },
      };
    },
    async listClassStudents() {
      return students;
    },
    async listRecentBankQuestions() {
      return existingBank;
    },
    async createImportJob(payload) {
      const id = `job-${state.createdJobs.length + 1}`;
      state.createdJobs.push({ id, ...payload });
      return { success: true, data: { id } };
    },
    async writeImportDrafts(payload) {
      state.writtenDrafts.push(payload);
      return { success: true, data: payload.drafts };
    },
    async commitImportJob(payload) {
      const last = state.writtenDrafts[state.writtenDrafts.length - 1];
      const question_ids = (last?.drafts ?? []).map((_, i) => `real-q-${state.commits.length + 1}-${i + 1}`);
      state.commits.push({ ...payload, question_ids });
      return { success: true, data: { question_ids, inserted: question_ids.length } };
    },
    async createArchiveExam(input, userId) {
      const id = `exam-${state.createdExams.length + 1}`;
      state.createdExams.push({ id, userId, ...input });
      return { id, status: input.status };
    },
    async attachExamQuestions(examId, rows) {
      state.attachedExamQuestions.push({ examId, rows });
      return rows;
    },
    async createTargetedHomework(input) {
      if (state.homeworkFailRemaining > 0) {
        state.homeworkFailRemaining -= 1;
        throw new Error('模拟网络超时：定向作业写入失败');
      }
      const id = `hw-${state.createdHomeworks.length + 1}`;
      state.createdHomeworks.push({ id, ...input });
      return { homework_id: id };
    },
  };

  return { state, deps };
}

const tempRoot = mkdtempSync(join(tmpdir(), 'tkw-paper-test-'));

try {
  await test('1. 文本 PDF 原卷录入：不写正式题库、查重标记、缺答案标记、重名学生消歧', async () => {
    const store = new PaperIntakeStore({ rootDir: join(tempRoot, 't1') });
    const { state, deps } = makeFakeBackend();
    const svc = new PaperIntakeService({ store, deps });

    const { draft } = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      title: '分数运算专项练习',
      subject: 'math',
      classId: 'cls-sat-math',
      className: '周六数学班',
      studentName: '张同学',
      dueDate: '2026-12-01T12:00:00.000Z',
      targetKnowledgeId: 'kp-fraction-01',
      files: [{ fileName: 'fraction.pdf', mimeType: 'application/pdf', bytesBase64: Buffer.from('%PDF-1.4').toString('base64') }],
    });

    // Zero official writes during intake
    assert.equal(state.createdJobs.length, 0);
    assert.equal(state.commits.length, 0);
    assert.equal(state.createdExams.length, 0);
    assert.equal(state.createdHomeworks.length, 0);

    // Duplicate detection on Q1 & missing_answer flag on Q2
    assert.equal(draft.questions.length, 3);
    assert.equal(draft.questions[0].exactMatchId, 'bank-q-101');
    assert.ok(draft.questions[0].flags.includes('possible_duplicate'));
    assert.ok(draft.questions[1].flags.includes('missing_answer'));

    // Duplicate student surname "张同学" triggers disambiguation and blocks preview
    assert.equal(draft.targetStudent.status, 'ambiguous');
    assert.equal(draft.targetStudent.candidates.length, 2);
    const blockedPreview = svc.previewPublish('teacher-1', draft.id);
    assert.ok(blockedPreview.blocked.some((b) => b.includes('重名学生')));
    assert.equal(blockedPreview.summary.recipientCount, 0);
  });

  await test('2. 多图扫描卷录入：保留公式与配图对应、检测缺配图与待核对、支持调页序', async () => {
    const store = new PaperIntakeStore({ rootDir: join(tempRoot, 't2') });
    const { deps } = makeFakeBackend();
    const svc = new PaperIntakeService({ store, deps });

    const { draft } = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      title: '扫描多图分数卷',
      files: [
        { fileName: 'page1.png', mimeType: 'image/png', bytesBase64: Buffer.from('img1').toString('base64') },
        { fileName: 'page2.jpg', mimeType: 'image/jpeg', bytesBase64: Buffer.from('img2').toString('base64') },
      ],
    });

    assert.equal(draft.pages.length, 2);
    assert.ok(draft.questions[0].content.includes('\\frac{x}{3}'));
    assert.deepEqual(draft.questions[0].images, ['https://oss.test/uploads/page1.png']);
    assert.ok(draft.questions[0].flags.includes('missing_answer'));
    assert.ok(draft.questions[1].flags.includes('missing_image'));
    assert.ok(draft.questions[1].flags.includes('needs_review'));

    // Reorder pages [2, 1] -> sourcePage updates accordingly
    const reordered = svc.reorderPages('teacher-1', draft.id, [2, 1]);
    assert.equal(reordered.draft.pages[0].fileName, 'page2.jpg');
    assert.equal(reordered.draft.questions[0].sourcePage, 2);
    assert.equal(reordered.draft.questions[1].sourcePage, 1);
  });

  await test('3. 校卷编辑（改题/拆分/合并/调序）与对话-面板共享同一版本同步', async () => {
    const store = new PaperIntakeStore({ rootDir: join(tempRoot, 't3') });
    const { deps } = makeFakeBackend();
    const svc = new PaperIntakeService({ store, deps });

    const { draft } = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      title: '分数运算专项练习',
      files: [{ fileName: 'fraction.pdf', mimeType: 'application/pdf', bytesBase64: Buffer.from('%PDF').toString('base64') }],
    });

    // Simulate panel editing Question 3
    svc.editQuestion('teacher-1', draft.id, {
      questionNumber: 3,
      patch: { content: '修正后的第3题：小明吃了 $\\frac{1}{4}$，小红吃了 $\\frac{1}{2}$，一共吃了多少？', correct_option: '3/4' },
    });

    // Simulate DSH chat tool asking "第 3 题现在是什么"
    const fakeWeeklyService = {
      paperGet: (id) => svc.getDraft('teacher-1', id),
      paperEditQuestion: (args) => svc.editQuestion('teacher-1', args.draftId, args),
      paperSplitQuestion: (args) => svc.splitQuestion('teacher-1', args.draftId, args),
      paperMergeQuestions: (args) => svc.mergeQuestions('teacher-1', args.draftId, args),
      paperPreview: (id) => svc.previewPublish('teacher-1', id),
    };
    const tools = createTools(fakeWeeklyService);
    const getTool = tools.find((t) => t.name === 'tiku_weekly_paper_get');
    const chatView = await getTool.execute({ questionNumber: 3 });

    assert.equal(chatView.ok, true);
    assert.equal(chatView.revision, 2);
    assert.ok(chatView.question.content.includes('修正后的第3题'));
    assert.equal(chatView.question.correct_option, '3/4');

    // Split Q2 then merge back
    const splitRes = svc.splitQuestion('teacher-1', draft.id, { questionNumber: 2, secondContent: '并写出通分过程。' });
    assert.equal(splitRes.draft.questions.length, 4);
    const mergeRes = svc.mergeQuestions('teacher-1', draft.id, { firstNumber: 2, secondNumber: 3 });
    assert.equal(mergeRes.draft.questions.length, 3);
  });

  await test('4. 确认入库、留存试卷不发学生、单生定向送达，且部分失败重试与双击确认均不重复创建', async () => {
    const store = new PaperIntakeStore({ rootDir: join(tempRoot, 't4') });
    const { state, deps } = makeFakeBackend({ failHomeworkOnce: true });
    const svc = new PaperIntakeService({ store, deps });

    const { draft } = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      title: '分数运算专项练习',
      subject: 'math',
      classId: 'cls-sat-math',
      className: '周六数学班',
      studentName: '张同学',
      dueDate: '2026-12-01T12:00:00.000Z',
      targetKnowledgeId: 'kp-fraction-01',
      files: [{ fileName: 'fraction.pdf', mimeType: 'application/pdf', bytesBase64: Buffer.from('%PDF').toString('base64') }],
    });

    // Teacher chooses to reuse Q1 from bank & picks unique student 张小明
    svc.editQuestion('teacher-1', draft.id, { questionNumber: 1, patch: { reuseQuestionId: 'bank-q-101' } });
    svc.editQuestion('teacher-1', draft.id, { questionNumber: 2, patch: { correct_option: '7/20' } });
    await svc.resolveStudent({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      draftId: draft.id,
      classId: 'cls-sat-math',
      studentId: 'stu-zhang-1',
    });

    const preview = svc.previewPublish('teacher-1', draft.id);
    assert.equal(preview.blocked.length, 0);
    assert.equal(preview.summary.recipientCount, 1);
    assert.equal(preview.summary.recipientLabel, '接收人数：1');
    assert.equal(preview.summary.reusedQuestionCount, 1);
    assert.equal(preview.summary.newQuestionCount, 2);

    // First execute: Step 1 (commit 2 new questions) & Step 2 (archive exam) succeed, Step 3 (homework) fails
    await assert.rejects(
      () => svc.executePublish({ host: 'https://tiku.test', token: 'tok', userId: 'teacher-1', draftId: draft.id }),
      /模拟网络超时/,
    );
    assert.equal(state.createdJobs.length, 1);
    assert.equal(state.commits.length, 1);
    assert.equal(state.createdExams.length, 1);
    assert.equal(state.createdHomeworks.length, 0);

    // Retry: MUST reuse committed question IDs & archival exam, ONLY execute Step 3
    const retryRes = await svc.executePublish({ host: 'https://tiku.test', token: 'tok', userId: 'teacher-1', draftId: draft.id });
    assert.equal(retryRes.idempotent, false);
    assert.equal(state.createdJobs.length, 1, '重试不得重复创建导入任务');
    assert.equal(state.commits.length, 1, '重试不得重复入库题目');
    assert.equal(state.createdExams.length, 1, '重试不得重复创建留存试卷');
    assert.equal(state.attachedExamQuestions.length, 1, '重试不得重复绑定试卷题目');
    assert.equal(state.createdHomeworks.length, 1, '定向作业应只创建 1 份');

    // Archival exam MUST be draft (unpublished); homework MUST be targeted to ONLY stu-zhang-1 in exact order
    assert.equal(state.createdExams[0].status, 'draft');
    const hw = state.createdHomeworks[0];
    assert.equal(hw.publishType, 'targeted');
    assert.deepEqual(hw.assignedTo, ['stu-zhang-1']);
    assert.equal(hw.assignedTo.includes('stu-zhang-2'), false);
    assert.deepEqual(
      hw.items.map((i) => i.questionId),
      ['bank-q-101', 'real-q-1-1', 'real-q-1-2'],
    );
    assert.deepEqual(
      state.attachedExamQuestions[0].rows.map((r) => r.problem_id),
      ['bank-q-101', 'real-q-1-1', 'real-q-1-2'],
    );

    // Double-click confirm after completion: strictly idempotent
    const secondClick = await svc.executePublish({ host: 'https://tiku.test', token: 'tok', userId: 'teacher-1', draftId: draft.id });
    assert.equal(secondClick.idempotent, true);
    assert.equal(secondClick.alreadyPublished, true);
    assert.equal(state.createdHomeworks.length, 1, '重复点击确认不得生成第二份作业');
  });

  await test('5. Windows DSH 重叠修复与响应式布局静态契约检查', async () => {
    const clientSrc = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
    const htmlOut = renderTeacherPage({ host: '/tiku-weekly/api' });

    // Dock must push host root in split mode and stay below topbar
    assert.ok(clientSrc.includes('body.weekly-split #root'), '必须通过 padding-right 避让主对话区，防止覆盖发送按钮');
    assert.ok(clientSrc.includes('--tkw-dock-reserve'), '必须动态设置右侧避让宽度变量');
    assert.ok(clientSrc.includes('computeDockMetrics'), '必须动态测量顶部标题栏与左侧栏');
    assert.ok(!clientSrc.includes('inset:0 64px 0 auto'), '不得保留硬编码 inset:0 64px 0 auto');

    // Wizard page must have no 32px bleed gap, un-stick .top on narrow/short screens, and include paper-split + table-wrap
    assert.ok(!htmlOut.includes('padding-top: 32px'), '不得保留 body 顶部 32px 空白缝隙');
    assert.ok(htmlOut.includes('@media (max-width:900px),(max-height:760px){.top{position:static}}'), '窄屏/高缩放下应取消顶部吸顶遮挡');
    assert.ok(htmlOut.includes('class="table-wrap"'), '执行预演表必须包裹横向滚动容器');
    assert.ok(htmlOut.includes('id="p0"') && htmlOut.includes('paper-split') && htmlOut.includes('paper-tabs'), '必须包含原卷并排/窄屏切换校卷界面');

    // Sanity check flag helper with no false positives on normal text
    assert.deepEqual(computeQuestionFlags({ content: '计算 1/2 + 1/3 的值。', correct_option: '5/6', images: [] }), []);
    assert.equal(matchStudentsByName([{ id: '1', full_name: '张小明' }], '张同学').status, 'matched');
  });

  await test('6. 直接传入结构化题目 + 分批追加到同一草稿（跳过服务端二次 AI 解析，自动绑页图，整卷一次发布）', async () => {
    const store = new PaperIntakeStore({ rootDir: join(tempRoot, 't6') });
    const { state, deps } = makeFakeBackend();
    let remoteParseCalls = 0;
    const wrappedDeps = {
      ...deps,
      async parseImportQuestions(payload) {
        remoteParseCalls += 1;
        return deps.parseImportQuestions(payload);
      },
    };
    const svc = new PaperIntakeService({ store, deps: wrappedDeps });

    // Batch 1: upload page 1 image + pass Q1 & Q2 directly (no remote AI parse)
    const batch1 = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      title: '闵行一模数学整卷',
      subject: 'math',
      classId: 'cls-sat-math',
      className: '九年级数学冲刺班',
      studentName: '李华',
      dueDate: '2026-12-05T12:00:00.000Z',
      targetKnowledgeId: 'kp-sim-01',
      files: [
        { fileName: 'mock-p1.png', mimeType: 'image/png', bytesBase64: Buffer.from('p1').toString('base64') },
      ],
      questions: [
        {
          originalNo: '1',
          sourcePage: 1,
          type: 'fill-in-blank',
          content: '计算：$\\frac{1}{2} + \\frac{1}{3} = ?$',
          correct_option: '5/6',
          score: 4,
        },
        {
          originalNo: '2',
          sourcePage: 1,
          usePageImage: true,
          type: 'choice',
          content: '如图，在 $\\triangle ABC$ 中，$DE \\parallel BC$，求比例值。',
          options: [{ label: 'A', text: '1:2' }, { label: 'B', text: '1:3' }],
          correct_option: 'A',
          score: 4,
        },
      ],
    });

    assert.equal(remoteParseCalls, 0, '直接传入 questions 时不得再调服务端 /api/teacher/import/parse');
    assert.equal(batch1.skippedRemoteParse, true);
    assert.equal(batch1.appended, false);
    assert.equal(batch1.draft.pages.length, 1);
    assert.equal(batch1.draft.questions.length, 2);
    assert.equal(batch1.draft.questions[0].exactMatchId, 'bank-q-101', '直接写入仍须执行题库查重');
    assert.deepEqual(batch1.draft.questions[1].images, ['https://oss.test/uploads/mock-p1.png'], 'usePageImage 应自动绑定第 1 页原图');
    assert.equal(batch1.draft.questions[1].flags.includes('missing_image'), false);

    // Batch 2: append page 2 + Q25 multi-part problem to the SAME draft
    const batch2 = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      appendToDraftId: batch1.draft.id,
      files: [
        { fileName: 'mock-p2.png', mimeType: 'image/png', bytesBase64: Buffer.from('p2').toString('base64') },
      ],
      questions: [
        {
          originalNo: '25',
          sourcePage: 1, // relative to this batch's new page -> becomes page 2
          usePageImage: true,
          type: 'open-ended',
          content: '如图，已知抛物线综合压轴题。',
          correct_option: '见三小问解析',
          score: 14,
          parts: [
            { id: 'p1', label: '(1)', prompt: '求解析式', score: 4, reference_answer: 'y=x^2-2x', rubric: '系数正确' },
            { id: 'p2', label: '(2)', prompt: '求相似比', score: 5, reference_answer: '1:2', rubric: '证明相似' },
            { id: 'p3', label: '(3)', prompt: '分类讨论面积', score: 5, reference_answer: '3 或 6', rubric: '不漏解' },
          ],
        },
      ],
    });

    assert.equal(remoteParseCalls, 0);
    assert.equal(batch2.appended, true);
    assert.equal(batch2.appendedCount, 1);
    assert.equal(batch2.appendedPageCount, 1);
    assert.equal(batch2.draft.id, batch1.draft.id);
    assert.equal(batch2.draft.revision, 2);
    assert.equal(batch2.draft.pages.length, 2);
    assert.equal(batch2.draft.pages[1].pageNo, 2);
    assert.equal(batch2.draft.questions.length, 3);
    assert.equal(batch2.draft.questions[2].originalNo, '25');
    assert.equal(batch2.draft.questions[2].sourcePage, 2);
    assert.deepEqual(batch2.draft.questions[2].images, ['https://oss.test/uploads/mock-p2.png']);
    assert.equal(batch2.draft.questions[2].parts.length, 3);

    // Batch 3: append without uploading new files, referencing existing page 2 directly
    const batch3 = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      appendToDraftId: batch1.draft.id,
      questions: [
        {
          originalNo: '26',
          sourcePage: 2,
          usePageImage: true,
          type: 'open-ended',
          content: '附加题：利用第 2 页图形求最值。',
          correct_option: '8',
          score: 10,
        },
      ],
    });

    assert.equal(batch3.draft.revision, 3);
    assert.equal(batch3.draft.pages.length, 2);
    assert.equal(batch3.draft.questions.length, 4);
    assert.equal(batch3.draft.questions[3].sourcePage, 2);
    assert.deepEqual(batch3.draft.questions[3].images, ['https://oss.test/uploads/mock-p2.png']);

    // Publish merged paper as one exam + one targeted homework
    const pub = await svc.executePublish({ host: 'https://tiku.test', token: 'tok', userId: 'teacher-1', draftId: batch1.draft.id });
    assert.equal(pub.questionIds.length, 4);
    assert.equal(state.createdExams.length, 1);
    assert.equal(state.createdHomeworks.length, 1);
    assert.equal(state.createdHomeworks[0].items.length, 4);

    // Appending to an already-published draft must be rejected
    await assert.rejects(
      () => svc.ingest({
        host: 'https://tiku.test',
        token: 'tok',
        userId: 'teacher-1',
        appendToDraftId: batch1.draft.id,
        questions: [{ content: '不应被追加的题目' }],
      }),
      /已发布，不能再追加/,
    );
  });

  await test('7. 知识树自动查询、单题 target_knowledge_id 入库与纯文字几何题不误标缺配图', async () => {
    // Pure-text geometry problems (Q9/Q10 style) must NOT trigger missing_image
    assert.deepEqual(
      computeQuestionFlags({ content: '如果两个相似三角形的面积之比为 16:9，那么它们的周长之比是？', correct_option: '4:3', images: [] }),
      [],
    );
    assert.deepEqual(
      computeQuestionFlags({ content: '已知长方形的长是 x，宽是长的一半，面积是 y，求 y 关于 x 的解析式。', correct_option: 'y=0.5x^2', images: [] }),
      [],
    );
    // Real visual references must still trigger missing_image
    assert.ok(
      computeQuestionFlags({ content: '如图，在 △ABC 中，DE∥BC，求比例值。', correct_option: '1:2', images: [] }).includes('missing_image'),
    );
    assert.ok(
      computeQuestionFlags({ content: '根据图①中的统计图回答下列问题。', correct_option: 'A', images: [] }).includes('missing_image'),
    );

    const store = new PaperIntakeStore({ rootDir: join(tempRoot, 't7') });
    const { state, deps } = makeFakeBackend();
    const fakeNodes = [
      { id: 101, parent_id: 10, name: '相似三角形', type: 'chapter', level: 3, is_leaf: false, path: ['初中数学', '九年级', '相似三角形'], metadata: { kg_code: 'MATH-9-SIM' } },
      { id: 102, parent_id: 10, name: '二次函数', type: 'chapter', level: 3, is_leaf: false, path: ['初中数学', '九年级', '二次函数'], metadata: { kg_code: 'MATH-9-QUAD' } },
      { id: 201, parent_id: 20, name: '宾语从句', type: 'topic', level: 3, is_leaf: true, path: ['初中英语', '九年级', '宾语从句'], metadata: {} },
    ];
    const svc = new PaperIntakeService({
      store,
      deps: {
        ...deps,
        async listKnowledgeNodes() {
          return fakeNodes;
        },
      },
    });

    const mathNodes = await svc.listKnowledgeNodesRemote('https://tiku.test', 'tok', { subject: '数学', keyword: '相似', onlyWithKgCode: true });
    assert.equal(mathNodes.totalMatched, 1);
    assert.equal(mathNodes.nodes[0].id, '101');
    assert.equal(mathNodes.nodes[0].kgCode, 'MATH-9-SIM');
    assert.equal(mathNodes.nodes[0].fullPath, '初中数学 / 九年级 / 相似三角形');

    // Tool contract check for tiku_weekly_knowledge_nodes
    const tools = createTools({
      knowledgeNodes: (filter) => svc.listKnowledgeNodesRemote('https://tiku.test', 'tok', filter),
    });
    const knTool = tools.find((t) => t.name === 'tiku_weekly_knowledge_nodes');
    assert.ok(knTool, '必须注册 tiku_weekly_knowledge_nodes 工具');
    const knRes = await knTool.execute({ subject: '数学' });
    assert.equal(knRes.ok, true);
    assert.equal(knRes.totalMatched, 2);

    // Per-question target_knowledge_id satisfies previewPublish without paper-level targetKnowledgeId
    const { draft } = await svc.ingest({
      host: 'https://tiku.test',
      token: 'tok',
      userId: 'teacher-1',
      title: '按题挂知识点测试卷',
      subject: 'math',
      classId: 'cls-sat-math',
      studentName: '李华',
      dueDate: '2026-12-06T12:00:00.000Z',
      questions: [
        { originalNo: '1', content: '如果两个相似三角形的面积之比为 16:9，求周长比。', correct_option: '4:3', target_knowledge_id: '101' },
        { originalNo: '2', content: '求二次函数 y = x^2 - 2x 的顶点坐标。', correct_option: '(1,-1)', target_knowledge_id: '102' },
      ],
    });
    const preview = svc.previewPublish('teacher-1', draft.id);
    assert.equal(preview.blocked.length, 0, '每题都已有 target_knowledge_id 时不应拦截');
    await svc.executePublish({ host: 'https://tiku.test', token: 'tok', userId: 'teacher-1', draftId: draft.id });
    assert.deepEqual(
      state.writtenDrafts[0].drafts.map((d) => d.target_knowledge_id),
      ['101', '102'],
      '入库草稿应保留每道题各自的 target_knowledge_id',
    );
  });

  await test('422 质量门明细经 HTTP 层传到 DSH，按整卷位置映射，并保留未匹配的错误', async () => {
    const store = new PaperIntakeStore({ rootDir: join(tempRoot, 'quality') });
    const { deps } = makeFakeBackend();
    deps.writeImportDrafts = async () => ({ data: [{ id: 'second-new', sort_order: 2 }, { id: 'first-new', sort_order: 1 }] });
    delete deps.commitImportJob;
    const svc = new PaperIntakeService({ store, deps });
    const args = { userId: 'teacher-1', host: 'https://tiku.test', token: 'tok' };
    const image = 'https://images.example/page.jpg';
    const { draft } = await svc.ingest({ ...args, title: '质检测试', classId: 'cls-sat-math', studentName: '李华',
      dueDate: '2026-12-06T12:00:00.000Z', questions: [1, 2, 3].map(n => ({
        originalNo: String(n), content: '计算第 ' + n + ' 题的结果', correct_option: '4', images: [image], target_knowledge_id: '101',
      })) });
    draft.questions[0].reuseQuestionId = 'existing';
    store.save(args.userId, draft);
    const fetchBefore = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async url => {
        assert.equal(new URL(url).pathname, '/api/teacher/import/commit');
        calls++;
        return Response.json({ error: '质量检查未通过', code: 'question_quality_gate_failed', issues: [
          { draft_id: 'first-new', code: 'image_low_resolution', url: image, message: '774x1224 低于门槛' },
          { draft_id: 'second-new', code: 'primary_knowledge_required', message: '缺少主考点' },
          { draft_id: 'unknown', code: 'future_rule', message: '其他问题' },
        ] }, { status: 422 });
      };
      const tool = createTools({ paperExecute: draftId => svc.executePublish({ ...args, draftId }) })
        .find(t => t.name === 'tiku_weekly_paper_execute');
      const { error } = await tool.execute({ draftId: draft.id });
      assert.equal(error.status, 422);
      assert.deepEqual(error.issues.map(i => [i.questionNumber, i.field]), [[2, 'images[0]'], [3, 'target_knowledge_id'], [null, null]]);
      assert.match(error.message, /第 2 题 · images\[0\].*774x1224/);
      assert.match(error.message, /草稿 unknown/);
      assert.equal(calls, 1);
    } finally { globalThis.fetch = fetchBefore; }
  });

  console.log(`\nAll ${passed} paper-intake & layout checks passed.`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
