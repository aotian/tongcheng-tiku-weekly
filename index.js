/**
 * Host half of 「童澄每周课程发布与课件制作助手」.
 *
 * Provides one Host service (`tikuWeekly`), the teacher wizard's HTTP routes,
 * and agent tools. The sidebar panel in the browser calls the same routes, and
 * the tools call the same service, so there is one implementation per action.
 */

import { WeeklyService } from './lib/service.js';
import { registerRoutes, PAGE_PATH } from './lib/router.js';
import { createTools } from './lib/tools.js';

export const inject = ['tools', 'webServer', 'credentials', 'systemPrompt'];

export function apply(ctx) {
  const service = new WeeklyService({ credentials: ctx.credentials });

  // Expose the service for other Host code; the browser never reaches it directly.
  const provided = ctx.provide('tikuWeekly', service);

  const disposeRoutes = registerRoutes(ctx, service);

  const tools = createTools(service);
  const disposers = tools.map((definition) => ctx.tools.register(definition));

  const section = ctx.systemPrompt.section({
    name: 'tiku-weekly',
    order: 95,
    text: [
      '## 童澄每周课程发布助手',
      '老师说「接着上周六二阶班备课」时，先调用 tiku_weekly_gesp 核对交接与个人证据，用 keyword 查真实候选，再用 tiku_weekly_cards 为每个学生保存六题；只预演，不发卡。查不到的进度注明未知。老师改题时只更新指定学生。教师授权通过插件会话提供，整个备课过程只用 tiku_weekly_* 工具。禁止使用终端、查找凭据或绕过权限；检索无结果时改用相近的教学关键词，仍不足就标待确认。',
      '',
      '老师的每周流程由 `tiku_weekly_*` 工具完成：建课/排课次、双版课件、随堂绑题、',
      '作业 v2、考试、课次任务链、群卡片，以及发布前预演。',
      '',
      '- 先 `tiku_weekly_status`；未登录时请老师在插件面板登录，不要代填密码。',
      '- 写操作一律先 `tiku_weekly_dry_run` 给老师看清单，老师确认后再 `tiku_weekly_execute`。',
      '- 制作新概念英语 2、数学、化学、英语、语文、Python 课件时，直接从老师消息或本地文件读取课文/教案并调用 `tiku_weekly_courseware_generate`（新概念标准课型包含：`passageParagraphs` 课文听读、`words` 分页词卡、`closeReading` 逐句精读、`grammarSlides` 语法专题、`reciteLines` 分段渐隐背诵、`quickChecks` 多道自检、`summaryWriting` 用证据写摘要与 `conclusions` 本课结论；教师版自带可自由翻页的课堂倒计时）。严禁在课件文案中写入「v2.1」「统一模板」「橙色主题」「教研备注」「Learn 课次任务 #1」等内部工程或教研术语。',
      '- 原卷录入并单生定向发布：用 `tiku_weekly_paper_ingest` 生成草稿（不写正式题库），用 `tiku_weekly_paper_get` / `tiku_weekly_paper_edit` / `tiku_weekly_paper_split` / `tiku_weekly_paper_merge` / `tiku_weekly_paper_student` 与面板共享校对，确认前必须先调用 `tiku_weekly_paper_preview` 展示试卷标题、题数、班级、学生与「接收人数：1」，老师明确确认后再调用 `tiku_weekly_paper_execute`。若对话取不到上传附件，引导老师在面板「⓪ 原卷录入与单生定向」选择文件，再由对话接着操作同一草稿。',
      '- 已有试卷先用 tiku_weekly_bank_search / bank_get 和 edu_list / edu_preview。只缺题时经确认用 edu_import 的 questions 模式，避免重复建卷。paper_bind 可按小问标签回填答案，paper_preflight 检查通过后再预演并请老师确认。',
      '- 失败时用 `tiku_weekly_retry` 或重新调用 `tiku_weekly_paper_execute` 断点续做，不要整批重跑。',
      `- 可视化界面在 ${PAGE_PATH}（DSH 侧边栏「每周课程」入口可直接打开）。`,
    ].join('\n'),
  });

  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
        // Already disposed.
      }
    }
    try {
      section();
    } catch {
      // Already disposed.
    }
    try {
      disposeRoutes?.();
    } catch {
      // Already disposed.
    }
    try {
      provided?.();
    } catch {
      // Already disposed.
    }
  };
}
