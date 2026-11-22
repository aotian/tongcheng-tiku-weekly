/**
 * The teacher-facing wizard, rendered by the Host on its own routes.
 *
 * Why a served page and not a slot component: the wizard needs a wide layout,
 * real drag-and-drop with file bytes, and a place to put full forms. DSH slots
 * are sized for conversation chrome. It still launches from inside DSH (the
 * sidebar entry opens it), stays same-origin, and shares the Host session.
 *
 * The page holds no secrets and no privilege of its own: every action is a
 * `fetch` to `/tiku-weekly/api/*`, where the Host checks the session and then
 * calls the same service methods the sidebar panel and the agent tools use.
 */

import { escapeHtml, page } from './page.js';

const BODY = `
<form class="top" id="loginBar">
  <div class="field"><label for="account">童澄账号</label><input id="account" type="text" autocomplete="username" placeholder="教师账号或邮箱"></div>
  <div class="field"><label for="password">密码</label><input id="password" type="password" autocomplete="current-password" placeholder="密码只用于本次登录"></div>
  <button class="primary" id="btnLogin" type="submit">登录</button>
  <span class="who" id="loginHint">密码不会被保存，令牌存在本机凭据里</span>
</form>

<div class="top" id="ctxBar" style="display:none">
  <div class="who" id="ctxWho" style="margin-left:0"></div>
  <details id="lessonCardView"><summary>对话备课题单</summary><div id="lessonCards"></div></details><div class="field"><label for="selClass">班级</label><select id="selClass"></select></div>
  <div class="field"><label for="selCourse">课程</label><select id="selCourse"></select></div>
  <div class="field"><label for="selPlan">教学计划</label><select id="selPlan"></select></div>
  <div class="field"><label for="selLesson">本周课次</label><select id="selLesson"><option value="">先在 ① 建课次，或选已有课次</option></select></div>
  <div class="field"><label for="selSubject">学科</label><input id="selSubject" type="text" value="信息科技"></div>
  <button type="button" id="btnRefresh">刷新</button>
  <button type="button" id="btnLogout">退出</button>
</div>

<div class="steps" id="stepNav" style="display:none">
  <button class="stepbtn" data-pane="p0" type="button">⓪ 原卷录入与单生定向</button>
  <button class="stepbtn on" data-pane="p1" type="button">① 建课 / 排课次 / 跨班复制</button>
  <button class="stepbtn" data-pane="p2" type="button">② 课件制作与双版上传</button>
  <button class="stepbtn" data-pane="p3" type="button">③ 绑题 · 作业 · 考试 · 任务链</button>
  <button class="stepbtn" data-pane="p4" type="button">④ 发布前预演与执行看板</button>
</div>

<div class="wrap">
  <div class="banner" id="banner" role="status" aria-live="polite"></div>

  <!-- Step 0: Paper intake & single-student targeted homework -->
  <section class="pane" id="p0">
    <div class="card">
      <h2>⓪ 从原卷录入，定向发给 1 名学生</h2>
      <p class="hint">支持文本 PDF、扫描 PDF、单张或多张试卷图片。识别后先生成可编辑草稿，不会写入正式题库；与 DSH 对话共享同一草稿 ID 与版本。</p>
      <div class="drop" id="dropPaper" tabindex="0" role="button" aria-label="选择试卷 PDF 或图片">
        <strong>拖拽 PDF / 试卷图片到这里，或点击选择（可多选）</strong>
        <span>多张图片可先调整页序再识别；对话里发起的草稿会自动载入</span>
      </div>
      <input type="file" id="filePaper" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.txt,.md" style="display:none">
      <div class="picked" id="paperFileQueue" style="margin-top:10px;display:none"></div>
      <div class="grid g3" style="margin-top:12px">
        <div class="fieldrow"><label for="paperTitle">试卷 / 作业标题</label><input id="paperTitle" type="text" placeholder="例：分数运算专项练习"></div>
        <div class="fieldrow"><label for="paperSubject">学科</label><input id="paperSubject" type="text" value="math" placeholder="math / chinese / english / cpp"></div>
        <div class="fieldrow"><label for="paperKnowledgeId">题库目标知识点 / 章节 ID</label><input id="paperKnowledgeId" type="text" placeholder="新建题目入库时必填"></div>
        <div class="fieldrow"><label for="paperClass">目标班级</label><select id="paperClass"></select></div>
        <div class="fieldrow"><label for="paperStudentQuery">目标学生姓名</label><input id="paperStudentQuery" type="text" placeholder="例：张同学 或完整姓名"></div>
        <div class="fieldrow"><label for="paperDue">作业截止时间</label><input id="paperDue" type="datetime-local"></div>
      </div>
      <div id="paperStudentBox" style="margin-top:10px"></div>
      <div class="actions">
        <button class="primary" type="button" id="btnPaperIngest">识别原卷生成校卷草稿</button>
        <button type="button" id="btnPaperMatchStudent">匹配目标学生</button>
        <button type="button" id="btnPaperSaveMeta">保存标题/班级/截止时间</button>
        <button type="button" id="btnPaperReload">同步对话最新草稿</button>
      </div>
    </div>

    <div class="card" id="paperWorkbench" style="display:none">
      <div class="actions" style="margin-top:0;justify-content:space-between">
        <div>
          <h2 id="paperDraftHeading">校卷工作台</h2>
          <p class="note" id="paperDraftMeta"></p>
        </div>
        <div class="actions" style="margin-top:0">
          <label style="display:flex;align-items:center;gap:6px;color:var(--text)"><input type="checkbox" id="paperOnlyFlagged">优先 / 仅看待人工确认</label>
        </div>
      </div>
      <div class="paper-tabs" id="paperNarrowTabs">
        <button type="button" class="on" data-ptab="questions">题目校对</button>
        <button type="button" data-ptab="source">原卷对照</button>
      </div>
      <div class="paper-split" id="paperSplit" data-tab="questions">
        <div class="paper-pane-src" id="paperSourcePane"></div>
        <div class="paper-pane-qs" id="paperQuestionsPane"></div>
      </div>
    </div>

    <div class="card" id="paperPublishCard" style="display:none">
      <h2>入库留存与单生定向确认</h2>
      <p class="hint">确认前必须先预演，核对试卷标题、题数、班级、学生姓名和「接收人数：1」。正式试卷仅草稿留存，学生端只收到 1 份定向作业。</p>
      <div class="actions">
        <button class="secondary" type="button" id="btnPaperPreview">预演单生定向发布（不写库）</button>
        <button class="primary" type="button" id="btnPaperExecute" disabled>确认入库并定向发给 1 名学生</button>
      </div>
      <div id="paperPreviewBox" style="margin-top:12px"></div>
    </div>
  </section>

  <!-- Step 1 -->
  <section class="pane active" id="p1">
    <div class="card">
      <h2>① 建课 / 排课次 / 跨班复制</h2>
      <p class="hint">选一种模式，填好后先在底部点「保存这一步」。所有内容都只是草稿，第 ④ 步确认发布后才会保存到童澄。</p>
      <div class="grid g3">
        <div class="fieldrow"><label for="mode">模式</label>
          <select id="mode">
            <option value="new-course">新建课程 + 章节 + 课次</option>
            <option value="append-lesson">在原课程追加课次</option>
            <option value="plan-copy">复制教学计划</option>
            <option value="chain-copy">跨班复制任务链</option>
          </select>
        </div>
      </div>

      <div id="blkCourse" class="grid g3" style="margin-top:12px">
        <div class="fieldrow"><label for="courseTitle">课程标题</label><input id="courseTitle" type="text" placeholder="例：三年级信息科技 · 第12周"></div>
        <div class="fieldrow"><label for="categoryName">课程分类</label><input id="categoryName" type="text" placeholder="默认「信息科技」"></div>
        <div class="fieldrow"><label for="courseStatus">建好后是否上架</label>
          <select id="courseStatus"><option value="">保持默认</option><option value="published">直接上架</option><option value="draft">存为草稿</option></select>
        </div>
      </div>

      <div id="blkChapter" class="grid g3" style="margin-top:12px">
        <div class="fieldrow"><label for="chapterTitle">章节标题</label><input id="chapterTitle" type="text" placeholder="例：第3章 循环与判断"></div>
        <div class="fieldrow"><label for="chapterOrderNo">章节序号</label><input id="chapterOrderNo" type="number" value="1" min="1"></div>
      </div>

      <div id="blkLesson" class="grid g3" style="margin-top:12px">
        <div class="fieldrow"><label for="appendChapterId">追加到哪个章节</label><select id="appendChapterId"></select></div>
        <div class="fieldrow"><label for="lessonTitle">课次标题</label><input id="lessonTitle" type="text" placeholder="例：第12周 · 循环嵌套"></div>
        <div class="fieldrow"><label for="lessonTopicId">绑定课件主题 topicId（可选）</label><input id="lessonTopicId" type="number" min="1"></div>
      </div>

      <div id="blkPlan" class="grid g2" style="margin-top:12px;display:none">
        <div class="fieldrow"><label for="planName">新计划名称</label><input id="planName" type="text" placeholder="例：2026 秋 · 第12周"></div>
        <div class="fieldrow"><label for="copyFromPlanId">从哪个计划复制（可选）</label><input id="copyFromPlanId" type="text" placeholder="源计划 UUID"></div>
      </div>

      <div id="blkChain" style="margin-top:12px;display:none">
        <div class="grid g2">
          <div class="fieldrow"><label for="sourceClassId">源班</label><select id="sourceClassId"></select></div>
          <div class="fieldrow"><label for="targetClassId">目标班</label><select id="targetClassId"></select></div>
        </div>
        <div class="actions">
          <button type="button" id="btnPreviewChain">预览差异</button>
          <label style="display:flex;align-items:center;gap:6px;color:var(--text)"><input type="checkbox" id="copyBindings" checked>同时复制绑题</label>
          <label style="display:flex;align-items:center;gap:6px;color:var(--text)"><input type="checkbox" id="copyFeedback">同时复制反馈</label>
        </div>
        <div id="chainResult" style="margin-top:10px"></div>
      </div>

      <div class="actions"><button class="primary" type="button" id="btnSave1">写入草稿</button></div>
      <p class="note" id="draftHint1"></p>
    </div>
  </section>

  <!-- Step 2 -->
  <section class="pane" id="p2">
    <div class="card">
      <h2>② 课件制作与双版上传</h2>
      <p class="hint">学生版课件不超过 50MB；教师私有版必须是单个 HTML 文件、不超过 3MB。文件在点「确认发布」时才真正上传。</p>
      <div class="grid g2">
        <div>
          <label>学生版 HTML / 资料</label>
          <div class="drop" id="dropStudent" tabindex="0" role="button" aria-live="polite" aria-label="选择学生版文件">
            <strong>拖拽文件到这里，或点击选择</strong>
            <span>上传到 OSS 后自动写入课件主题</span>
          </div>
          <input type="file" id="fileStudent" style="display:none">
          <div class="grid g2" style="margin-top:10px">
            <div class="fieldrow"><label for="studentName">课件名称</label><input id="studentName" type="text" placeholder="默认用文件名"></div>
            <div class="fieldrow"><label for="studentCategory">分类</label><input id="studentCategory" type="text" placeholder="可选"></div>
          </div>
          <label style="display:flex;align-items:center;gap:6px;margin-top:10px;color:var(--text)"><input type="checkbox" id="studentVisible" checked>学生可见</label>
        </div>
        <div>
          <label>教师私有版 HTML</label>
          <div class="drop" id="dropTeacher" tabindex="0" role="button" aria-live="polite" aria-label="选择教师私有版文件">
            <strong>拖拽 HTML 到这里，或点击选择</strong>
            <span>写入 topics.resource_meta.courseware_html</span>
          </div>
          <input type="file" id="fileTeacher" style="display:none">
          <div class="grid g2" style="margin-top:10px">
            <div class="fieldrow"><label for="teacherTopicId">挂到哪个课件</label><select id="teacherTopicId"><option value="">默认挂到本次新建的学生版课件</option></select></div>
            <div class="fieldrow"><label for="teacherName">文件名</label><input id="teacherName" type="text" placeholder="默认用文件名"></div>
          </div>
          <p class="note">私有版只有老师能看；学生版才会出现在学生端。</p>
        </div>
      </div>
      <div class="actions"><button class="primary" type="button" id="btnSave2">写入草稿</button></div>
      <p class="note" id="draftHint2"></p>
    </div>
  </section>

  <!-- Step 3 -->
  <section class="pane" id="p3">
    <div class="card">
      <h2>③-A 随堂练习（lesson_sidebar 绑题）</h2>
      <p class="hint">检索题库里的候选题，勾选后可以调顺序。发布后要改，需要先撤回。</p>
      <div class="grid g2">
        <div class="fieldrow"><label for="qKeyword">关键词</label><input id="qKeyword" type="text" placeholder="题干关键词"></div>
        <div class="fieldrow"><label for="qMode">作答模式</label>
          <select id="qMode"><option value="single_choice">单选答案</option><option value="multiple_choice">多选</option><option value="judge">判断</option><option value="short_text">简答</option><option value="code">代码</option><option value="oj">OJ 编程</option></select>
        </div>
      </div>
      <div class="actions"><button type="button" id="btnSearch">检索候选题</button></div>
      <div class="grid g2" style="margin-top:12px">
        <div><label>候选题</label><div class="qlist" id="qList"><p class="note" style="padding:10px">先检索，候选题由接口返回。</p></div></div>
        <div><label>已选（按顺序绑定）</label><div class="picked" id="qPicked"><p class="note">还没有选题目。</p></div></div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:12px;color:var(--text)"><input type="checkbox" id="bindingPublish" checked>保存草稿后立即发布</label>
    </div>

    <div class="card">
      <h2>③-B 课后作业（作业 v2）</h2>
      <p class="hint">截止时间与补交规则会被一直检查，不会因为到点而自动关闭，老师随时可以改。</p>
      <div class="grid g2">
        <div class="fieldrow"><label for="previousHomework">修改已有作业</label><select id="previousHomework"></select></div>
        <div class="fieldrow"><label for="hwTitle">作业标题</label><input id="hwTitle" type="text" placeholder="例：第12周课后练习"></div>
        <div class="fieldrow"><label for="hwDue">截止时间</label><input id="hwDue" type="datetime-local"></div>
        <div class="fieldrow"><label for="hwLate">补交策略</label>
          <select id="hwLate"><option value="closed">截止后关闭</option><option value="allow">允许补交</option><option value="allow_penalty">允许但要扣分</option></select>
        </div>
        <div class="fieldrow"><label for="hwPenalty">扣分比例（%）</label><input id="hwPenalty" type="number" min="0" max="100" value="20"></div>
        <div class="fieldrow"><label for="hwPublishType">发布范围</label>
          <select id="hwPublishType"><option value="public">全班公开</option><option value="targeted">定向到部分学生</option></select>
        </div>
        <div class="fieldrow"><label for="hwAssigned">定向学生 ID（逗号分隔）</label><input id="hwAssigned" type="text" placeholder="仅定向时必填"></div>
      </div>
      <div class="fieldrow" style="margin-top:10px"><label for="hwDesc">说明</label><textarea id="hwDesc" placeholder="可选"></textarea></div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;color:var(--text)"><input type="checkbox" id="hwUseBinding" checked>用上面选中的随堂题目作为作业题目</label>
    </div>

    <div class="card">
      <h2>③-C 随堂 / 课后考试（可选）</h2>
      <div class="grid g3">
        <div class="fieldrow"><label for="examTitle">考试标题</label><input id="examTitle" type="text"></div>
        <div class="fieldrow"><label for="examLimit">时长（分钟）</label><input id="examLimit" type="number" min="1" value="30"></div>
        <div class="fieldrow"><label for="examPass">及格分</label><input id="examPass" type="number" min="0" value="60"></div>
        <div class="fieldrow"><label for="examDue">截止时间</label><input id="examDue" type="datetime-local"></div>
        <div class="fieldrow"><label for="examScore">每题分值</label><input id="examScore" type="number" min="1" value="10"></div>
        <div class="fieldrow"><label>题目来源</label><input type="text" value="复用上方选中的随堂题目" readonly></div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;color:var(--text)"><input type="checkbox" id="examEnabled">本次同时创建考试</label>
    </div>

    <div class="card">
      <h2>③-D 课次任务链（5 个阶段）</h2>
      <p class="hint">「课后作业」阶段的作业与「课后拓展」阶段的考试二选一，不能在同一课次同时存在；单独设置均允许。视频仅限「课中」或「课后拓展」。</p>
      <div class="grid g3">
        <div class="fieldrow"><label for="taskType">任务类型</label>
          <select id="taskType"><option value="video">视频（引用课件主题）</option><option value="homework">作业</option><option value="exam">考试</option></select>
        </div>
        <div class="fieldrow"><label for="taskStage">阶段</label>
          <select id="taskStage"><option value="entrance">entrance 课前</option><option value="in_class" selected>in_class 课中</option><option value="exit">exit 课末</option><option value="homework">homework 课后作业</option><option value="after_class">after_class 课后拓展</option></select>
        </div>
        <div class="fieldrow"><label for="taskRef">引用（video 填 topicId，其它留空自动取本次创建）</label><input id="taskRef" type="text"></div>
      </div>
      <div class="actions"><button type="button" id="btnAddTask">加入任务链</button></div>
      <div class="picked" id="taskList" style="margin-top:10px"><p class="note">还没有任务。</p></div>
      <div class="grid g2" style="margin-top:12px">
        <div class="fieldrow"><label for="chatGroupId">发布后推送班级群（可选，填群 ID）</label><input id="chatGroupId" type="text"></div>
        <div class="fieldrow"><label for="chatNote">群卡片备注</label><input id="chatNote" type="text"></div>
      </div>
      <div class="actions"><button class="primary" type="button" id="btnSave3">写入草稿</button></div>
      <p class="note" id="draftHint3"></p>
    </div>
  </section>

  <!-- Step 4 -->
  <section class="pane" id="p4">
    <div class="card">
      <h2>④ 发布前预演与一键发布</h2>
      <p class="hint">先检查清单：这一步不会保存到童澄。确认无误后再点「确认发布给学生」，每一步都会显示结果，失败的那一步可以单独重试。</p>
      <div class="actions">
        <button class="secondary" type="button" id="btnDryRun">检查一下（不会真的发布）</button>
        <button class="primary" type="button" id="btnExecute" disabled>确认发布给学生</button>
      </div>
      <div id="draftDigest"></div>
      <div id="planBlocked"></div>
      <div class="table-wrap" id="planTable"></div>
    </div>
  </section>
</div>
`;

export function renderTeacherPage({ host }) {
  const script = SCRIPT.replace('__API_HOST__', JSON.stringify(host ?? ''));
  return page({
    title: '童澄每周课程发布助手',
    body: BODY,
    script,
  }).replace('</body>', `<noscript><div class="wrap"><div class="banner err show">这个页面需要 JavaScript。</div></div></noscript></body>`);
}

// Kept as a plain string so the page has no build step and no imports.
const SCRIPT = String.raw`
const API_BASE = '/tiku-weekly/api';
const API_HOST = __API_HOST__;
const state = {
  session: null, classes: [], classCourses: [], myCourses: [], chapters: [], lessons: [],
  candidates: [], candidatesById: new Map(), picked: [], tasks: [],
  chainPreview: null, batch: null, batchSse: null, step2Files: { student: null, teacher: null },
  draft: { step1: null, step2: null, step3: null }, plan: null,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function banner(text, kind) {
  const el = $('banner');
  el.className = 'banner show ' + (kind || 'err');
  el.textContent = text;
  if (kind !== 'err') setTimeout(() => { if (el.textContent === text) el.className = 'banner'; }, 6000);
}
function clearBanner() { $('banner').className = 'banner'; }

let busyCount = 0;
function setBusy(on, button) {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  document.body.classList.toggle('busy', busyCount > 0);
  if (button) {
    if (on) { button.dataset.label = button.textContent; button.disabled = true; button.classList.add('busy'); }
    else { button.disabled = false; button.classList.remove('busy'); if (button.dataset.label) button.textContent = button.dataset.label; }
  }
}

async function api(path, options) {
  const res = await fetch(API_BASE + path, {
    method: options && options.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options && options.headers),
    body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
    err.detail = data;
    throw err;
  }
  return data;
}
function showError(err) {
  const d = err.detail || {};
  banner(err.message + (d.fix ? ' — ' + d.fix : '') + (d.status ? '（HTTP ' + d.status + '）' : ''));
}

function opt(sel, items, value, label, placeholder) {
  const el = $(sel);
  const keep = el.value;
  if (!el.dataset.resting) el.dataset.resting = placeholder || '';
  el.innerHTML = (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '')
    + items.map((it) => '<option value="' + esc(value(it)) + '">' + esc(label(it)) + '</option>').join('');
  if (keep && items.some((it) => String(value(it)) === keep)) el.value = keep;
}

/** Say why a list is empty instead of leaving a blank dropdown. */
function optFail(sel, message) {
  const el = $(sel);
  el.innerHTML = '<option value="">' + esc(message) + '</option>';
}

// ── session ───────────────────────────────────────────────────────────────
const ROLE_LABEL = { teacher: '教师', admin: '管理员', student: '学生', free_user: '普通用户' };

async function loadStatus() {
  const s = await api('/status');
  state.session = s.session;
  if (!s.loggedIn) {
    $('loginBar').style.display = 'flex';
    $('ctxBar').style.display = 'none';
    $('stepNav').style.display = 'none';
    banner(s.reason || '还没有登录童澄账号。填好账号密码后点登录。', 'warn');
    return;
  }
  $('loginBar').style.display = 'none';
  $('ctxBar').style.display = 'flex';
  $('stepNav').style.display = 'flex';
  $('ctxWho').innerHTML = '<span class="pill">' + esc(s.session.fullName || s.session.username || s.session.email || '老师') + '</span>'
    + '<span class="pill">' + esc(ROLE_LABEL[s.session.role] || s.session.role || '未知角色') + '</span>'
    + (s.isTeacher ? '' : '<span class="pill err">当前账号不是教师，只能查看</span>');
  // A non-teacher cannot publish, so the forms are locked up front rather than
  // failing only at the last step.
  document.querySelectorAll('.pane .card').forEach((card) => card.classList.toggle('locked', !s.isTeacher));
  document.querySelectorAll('.stepbtn').forEach((btn) => { btn.disabled = !s.isTeacher; });
  await loadContext();
}

async function loadContext() {
  const cls = await api('/classes');
  state.classes = cls.classes;
  opt('selClass', state.classes, (c) => c.id, (c) => c.name + (c.expired ? '（已过期）' : '') + (c.ownedByMe ? '' : '（可管理）'), '选择班级');
  opt('paperClass', state.classes, (c) => c.id, (c) => c.name + (c.expired ? '（已过期）' : ''), '选择目标班级');
  opt('sourceClassId', state.classes, (c) => c.id, (c) => c.name, '源班');
  opt('targetClassId', state.classes, (c) => c.id, (c) => c.name, '目标班');
  const mine = await api('/my-courses');
  state.myCourses = mine.courses;
  const cardContext=await api('/card-context');
  if (!$('selClass').value && cardContext.classId) $('selClass').value=cardContext.classId;
  syncCourseOptions();
  await onClassChange();
  await loadActivePaperDraft(true);
}

function syncCourseOptions() {
  const items = state.myCourses.map((c) => ({ id: c.id, title: c.title }));
  opt('selCourse', items, (c) => c.id, (c) => c.title, '选择课程');
}

let classVersion=0;
async function refreshCards(){
  const id=$('selClass').value;
  if(!id)return;
  const result=await api('/cards?classId='+encodeURIComponent(id));
  if(id!==$('selClass').value)return;
  $('lessonCards').textContent=result.cards.map(c=>c.lesson+' · '+(c.studentName||c.studentId)+'：'+c.questions.map((q,i)=>(i+1)+'. '+q.title).join('，')).join(' ／ ') || '尚无对话备课题单';
}
$('lessonCardView').addEventListener('toggle',()=>{if($('lessonCardView').open)refreshCards().catch(showError)});
window.addEventListener('focus',()=>{if($('lessonCardView').open)refreshCards().catch(showError)});
async function onClassChange() {
  const version=++classVersion;
  state.batch=null; state.chainPreview=null;state.picked=[];state.tasks=[];state.editHomework=null;
  $('btnExecute').disabled=true;
  for(const id of ['selCourse','selPlan','selLesson','previousHomework','appendChapterId']) $(id).replaceChildren();
  $('lessonCards').textContent='';

  const classId = $('selClass').value;
  if (!classId) { opt('selPlan', [], (p) => p.id, (p) => p.name, '选择计划'); return; }
  $('sourceClassId').value = $('sourceClassId').value || classId;
  let bound;
  try {
    bound = await api('/class-courses?classId=' + encodeURIComponent(classId));
  } catch (e) {
    if(version!==classVersion)return;
    state.classCourses = [];
    optFail('selCourse', '课程加载失败，点「刷新」重试');
    showError(e);
    return;
  }
  if(version!==classVersion)return;
  state.classCourses = bound.courses;
  syncCourseOptions();
  const list=await api('/homework-list?classId='+encodeURIComponent(classId));
  if(version!==classVersion)return;
  opt('previousHomework',list.rows,r=>r.id,r=>r.title,'新建作业');
  await refreshCards();
  if(version!==classVersion)return;
  if (state.classCourses.length) {
    const existing = state.myCourses.slice();
    for (const c of state.classCourses) if (!existing.some((m) => m.id === c.courseId)) existing.push({ id: c.courseId, title: c.title });
    opt('selCourse', existing, (c) => c.id, (c) => c.title, '选择课程');
  }
}

async function onCourseChange() {
  const courseId = $('selCourse').value;
  opt('selPlan', [], (p) => p.id, (p) => p.name, '不指定');
  if (!courseId) { optFail('appendChapterId', '先选课程'); opt('selLesson', [], (l) => l.id, (l) => l.title, '先在 ① 创建课次，或选已有课次'); return; }
  try {
    const plans = await api('/plans?courseId=' + encodeURIComponent(courseId));
    opt('selPlan', plans.plans || [], (p) => p.id, (p) => p.name, '不指定');
    const ch = await api('/chapters?courseId=' + encodeURIComponent(courseId));
    state.chapters = ch.chapters;
    opt('appendChapterId', state.chapters, (c) => c.id, (c) => (c.orderNo ? c.orderNo + '. ' : '') + c.title, '选择章节');
    await refreshLessonOptions();
  } catch (e) {
    optFail('appendChapterId', '章节加载失败，点「刷新」重试');
    showError(e);
  }
}

/**
 * The lesson list is what makes step ③ reachable at all: a teacher picks "本周
 * 第12周 · 循环嵌套" by name, never by pasting an id.
 */
async function refreshLessonOptions() {
  const courseId = $('selCourse').value;
  const chapterId = $('appendChapterId').value;
  if (!courseId) return;
  try {
    const data = await api('/lessons?courseId=' + encodeURIComponent(courseId) + (chapterId ? '&chapterId=' + encodeURIComponent(chapterId) : ''));
    state.lessons = data.lessons || [];
    const placeholder = state.lessons.length ? '选择本周课次' : '这门课还没有课次，先在 ① 创建';
    opt('selLesson', state.lessons, (l) => l.id, (l) => (l.chapterTitle ? l.chapterTitle + ' · ' : '') + l.title, placeholder);
  } catch (e) {
    optFail('selLesson', '课次加载失败，点「刷新」重试');
  }
}

/**
 * The private deck normally attaches to the topic this batch creates from the
 * student file, so the picker leads with that and only offers real topics after.
 */
async function refreshTopicOptions() {
  const courseId = $('selCourse').value;
  let topics = [];
  if (courseId) {
    try { const data = await api('/topics?courseId=' + encodeURIComponent(courseId)); topics = data.topics || []; }
    catch (_) { topics = []; }
  }
  const el = $('teacherTopicId');
  const keep = el.value;
  el.innerHTML = '<option value="">默认挂到本次新建的学生版课件</option>'
    + topics.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name || ('课件 ' + t.id)) + '</option>').join('');
  if (keep && topics.some((t) => String(t.id) === keep)) el.value = keep;
}

// ── step 1 ────────────────────────────────────────────────────────────────
function syncMode() {
  const mode = $('mode').value;
  $('blkCourse').style.display = mode === 'new-course' ? 'grid' : 'none';
  $('blkChapter').style.display = mode === 'new-course' ? 'grid' : 'none';
  $('blkLesson').style.display = (mode === 'new-course' || mode === 'append-lesson') ? 'grid' : 'none';
  $('blkPlan').style.display = mode === 'plan-copy' ? 'grid' : 'none';
  $('blkChain').style.display = mode === 'chain-copy' ? 'block' : 'none';
}

async function previewChain() {
  const courseId = $('selCourse').value;
  const source = $('sourceClassId').value;
  const target = $('targetClassId').value;
  if (!courseId || !source || !target) return banner('跨班复制需要先选课程、源班、目标班', 'warn');
  $('chainResult').innerHTML = '<p class="note">正在比较两个班的任务…</p>';
  try {
    const data = await api('/chain/preview?courseId=' + encodeURIComponent(courseId)
      + '&sourceClassId=' + encodeURIComponent(source) + '&targetClassId=' + encodeURIComponent(target));
    state.chainPreview = { hash: data.previewHash || (data.preview && (data.preview.hash || data.preview.preview_hash)) || null, at: Date.now() };
    const groups = [['将复制', data.willCopy], ['将跳过', data.willSkip], ['冲突', data.willConflict]];
    $('chainResult').innerHTML = '<div class="grid g3">' + groups.map(([title, rows]) =>
      '<div class="card" style="margin:0"><h2 style="font-size:13px">' + esc(title) + ' · ' + ((rows || []).length) + '</h2>'
      + '<div class="note" style="margin-top:6px">' + ((rows || []).length ? rows.map((r) => '<div class="mono">' + esc(typeof r === 'string' ? r : JSON.stringify(r)) + '</div>').join('') : '无') + '</div></div>').join('') + '</div>'
      + '<p class="note">' + (state.chainPreview.hash
          ? '这个比较结果在 10 分钟内有效；期间两边班级有变化，需要重新比较。'
          : '这次比较暂时无法套用，请重新点「预览差异」。') + '</p>';
    if (!state.chainPreview.hash) banner('这次比较结果暂时无法套用，请重新点「预览差异」。', 'warn');
  } catch (e) { showError(e); }
}

// ── step 2 ────────────────────────────────────────────────────────────────
function bindDrop(dropId, inputId, key) {
  const drop = $(dropId), input = $(inputId);
  const pick = () => input.click();
  drop.addEventListener('click', pick);
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(key, e.dataTransfer.files[0], drop);
  });
  input.addEventListener('change', () => { if (input.files[0]) setFile(key, input.files[0], drop); });
}
function setFile(key, file, drop) {
  const limit = key === 'teacher' ? 3 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > limit) {
    banner((key === 'teacher' ? '教师私有版上限 3MB' : '学生版上限 50MB') + '，这个文件是 ' + (file.size / 1024 / 1024).toFixed(1) + 'MB');
    state.step2Files[key] = null;
    drop.innerHTML = '<strong>文件过大，已移除</strong><span>' + esc(file.name) + '</span>';
    return;
  }
  if (key === 'teacher' && !/\.html?$/i.test(file.name)) {
    banner('教师私有版只接受单个 HTML 文件，这个文件是「' + file.name + '」');
    state.step2Files[key] = null;
    drop.innerHTML = '<strong>只能选 HTML 文件</strong><span>已忽略 ' + esc(file.name) + '</span>';
    return;
  }
  state.step2Files[key] = file;
  drop.innerHTML = '<strong>' + esc(file.name) + '</strong><span>' + (file.size / 1024).toFixed(0) + ' KB · ' + esc(file.type || '未知类型') + '</span>';
  if (key === 'student' && !$('studentName').value) $('studentName').value = file.name.replace(/\.[^.]+$/, '');
  if (key === 'teacher' && !$('teacherName').value) $('teacherName').value = file.name;
}

async function fileToBase64(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  return btoa(bin);
}

// ── step 3 ────────────────────────────────────────────────────────────────
async function searchQuestions() {
  const classId = $('selClass').value, courseId = $('selCourse').value, lessonId = $('selLesson').value.trim();
  if (!classId || !courseId || !lessonId) return banner('检索候选题需要先选班级、课程，并填写目标课次 UUID', 'warn');
  setBusy(true, $('btnSearch'));
  try {
    const data = await api('/binding/candidates?classId=' + encodeURIComponent(classId) + '&courseId=' + encodeURIComponent(courseId)
      + '&lessonId=' + encodeURIComponent(lessonId) + '&q=' + encodeURIComponent($('qKeyword').value));
    state.candidates = data.candidates || [];
    state.candidatesById = new Map(state.candidates.map((c) => [String(c.id), c]));
    renderCandidates();
    if (!state.candidates.length) banner('没有找到候选题，换个关键词试试。', 'warn');
  } catch (e) { showError(e); }
  finally { setBusy(false, $('btnSearch')); }
}
function renderCandidates() {
  $('qList').innerHTML = state.candidates.length
    ? state.candidates.map((c) => '<label class="q"><input type="checkbox" data-qid="' + esc(c.id) + '"'
        + (state.picked.some((p) => p.questionId === String(c.id)) ? ' checked' : '') + '>'
        + '<span class="body"><span>' + esc((c.content || '').slice(0, 160)) + '</span>'
        + '<span class="meta">难度 ' + esc(c.difficulty || '-') + (c.type ? '<span class="chip">' + esc(c.type) + '</span>' : '')
        + (c.knowledgeId ? '<span class="chip">' + esc(String(c.knowledgeId).slice(0, 8)) + '</span>' : '') + '</span></span></label>').join('')
    : '<p class="note" style="padding:10px">没有候选题。</p>';
  $('qList').querySelectorAll('input[data-qid]').forEach((box) => {
    box.addEventListener('change', () => {
      const id = box.dataset.qid;
      if (box.checked) state.picked.push({ questionId: id, responseMode: $('qMode').value });
      // Changing the mode later re-applies it to every picked question.
      if (box.checked && $('qMode').value) state.picked[state.picked.length - 1].responseMode = $('qMode').value;
      else state.picked = state.picked.filter((p) => p.questionId !== id);
      renderPicked();
    });
  });
}
function renderPicked() {
  $('qPicked').innerHTML = state.picked.length
    ? state.picked.map((p, i) => '<div class="row"><span class="mono">' + (i + 1) + '</span><span class="grow">'
        + esc((state.candidatesById.get(p.questionId) || {}).content || p.questionId) + '</span>'
        + '<button type="button" data-up="' + i + '" aria-label="上移"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
        + '<button type="button" data-down="' + i + '" aria-label="下移"' + (i === state.picked.length - 1 ? ' disabled' : '') + '>↓</button>'
        + '<button type="button" data-rm="' + i + '" aria-label="移除">移除</button></div>').join('')
    : '<p class="note">还没有选题目。</p>';
  $('qPicked').querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.up, -1)));
  $('qPicked').querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.down, 1)));
  $('qPicked').querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    state.picked.splice(+b.dataset.rm, 1); renderPicked(); renderCandidates();
  }));
}
function move(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.picked.length) return;
  const [item] = state.picked.splice(index, 1);
  state.picked.splice(target, 0, item);
  renderPicked();
}

function addTask() {
  const taskType = $('taskType').value, stage = $('taskStage').value;
  const proposed = [...state.tasks, { taskType, stage }];
  if (proposed.some((t) => t.taskType === 'homework' && t.stage === 'homework') && proposed.some((t) => t.taskType === 'exam' && t.stage === 'after_class')) return banner('课后作业与课后拓展考试互斥，只能选择其中一种', 'warn');
  if (taskType === 'video' && !['in_class', 'after_class'].includes(stage)) return banner('视频仅限课中或课后拓展阶段', 'warn');
  if (state.tasks.some((t) => t.stage === stage)) return banner('阶段「' + stage + '」上已经挂了一个任务，先移除', 'warn');
  const ref = $('taskRef').value.trim();
  if (taskType === 'video' && !/^\d+$/.test(ref)) return banner('video 任务的引用必须是课件主题 topicId（整数）', 'warn');
  state.tasks.push({ taskType, stage, refId: taskType === 'video' ? Number(ref) : null });
  renderTasks();
}
function renderTasks() {
  $('taskList').innerHTML = state.tasks.length
    ? state.tasks.map((t, i) => '<div class="row"><span class="pill brand">' + esc(t.stage) + '</span><span class="grow">'
        + esc(t.taskType) + (t.refId ? ' · topicId ' + esc(t.refId) : ' · 自动取本次创建') + '</span>'
        + '<button type="button" data-rmtask="' + i + '">移除</button></div>').join('')
    : '<p class="note">还没有任务。</p>';
  $('taskList').querySelectorAll('[data-rmtask]').forEach((b) => b.addEventListener('click', () => {
    state.tasks.splice(+b.dataset.rmtask, 1); renderTasks();
  }));
}

// ── save drafts ───────────────────────────────────────────────────────────
function contextIds() {
  return { classId: $('selClass').value, courseId: $('selCourse').value, planId: $('selPlan').value || null, lessonId: $('selLesson').value.trim() || null };
}

/**
 * Send one section while keeping the other two. The Host merges sections, but
 * sending the whole current set makes that explicit and lets the teacher see
 * the digest of everything that will be published.
 */
function draftBody(section, value) {
  return { context: contextIds(), [section]: value, section };
}

async function saveStep1() {
  const mode = $('mode').value;
  const draft = { mode };
  if (mode === 'new-course') Object.assign(draft, {
    createCourse: true, courseTitle: $('courseTitle').value.trim(),
    categoryId: $('categoryName').value.trim() === '信息科技' ? null : ($('categoryName').value.trim() || null),
    courseStatus: $('courseStatus').value || null, chapterTitle: $('chapterTitle').value.trim(),
    chapterOrderNo: Number($('chapterOrderNo').value || 1),
  });
  if ((mode === 'new-course' || mode === 'append-lesson') && $('lessonTitle').value.trim()) {
    draft.addLesson = { chapterId: mode === 'append-lesson' ? $('appendChapterId').value : null, title: $('lessonTitle').value.trim(),
      topicId: $('lessonTopicId').value ? Number($('lessonTopicId').value) : null };
  }
  if (mode === 'plan-copy' && $('planName').value.trim()) draft.plan = { name: $('planName').value.trim(), copyFromPlanId: $('copyFromPlanId').value.trim() || undefined };
  if (mode === 'chain-copy') {
    if (!state.chainPreview || !state.chainPreview.hash) return banner('先点「预览差异」并拿到预览哈希，套用必须带上它', 'warn');
    if (Date.now() - state.chainPreview.at > 10 * 60 * 1000) return banner('预览已超过 10 分钟，请重新点「预览差异」', 'warn');
    draft.chainCopy = { sourceClassId: $('sourceClassId').value, targetClassId: $('targetClassId').value,
      copyBindings: $('copyBindings').checked, copyFeedback: $('copyFeedback').checked, expectedPreviewHash: state.chainPreview.hash };
  }
  const res = await api('/draft/step1', { method: 'POST', body: draftBody('step1', draft) });
  state.draft.step1 = draft;
  await refreshLessonOptions();
  $('draftHint1').textContent = '已保存 · ' + new Date().toLocaleTimeString();
  banner('第①步已保存到草稿（还没有发布）', 'ok');
  return res;
}

async function saveStep2() {
  const step2 = {};
  const student = state.step2Files.student;
  if (student) step2.student = {
    fileName: student.name, contentType: student.type || 'text/html', size: student.size,
    bytes: await fileToBase64(student), topicName: $('studentName').value.trim() || student.name,
    category: $('studentCategory').value.trim() || null, htmlVisibleToStudents: $('studentVisible').checked,
  };
  const teacher = state.step2Files.teacher;
  if (teacher) step2.teacher = { fileName: teacher.name, size: teacher.size, bytes: await fileToBase64(teacher),
    topicId: $('teacherTopicId').value ? Number($('teacherTopicId').value) : null };
  state.draft.step2 = step2;
  await api('/draft/step2', { method: 'POST', body: draftBody('step2', step2) });
  await refreshTopicOptions();
  $('draftHint2').textContent = '已保存 · ' + new Date().toLocaleTimeString();
  banner('第②步已保存到草稿（还没有发布）', 'ok');
}

async function saveStep3() {
  const step3 = {};
  if (state.picked.length) {
    const lesson = state.lessons.find((l) => l.id === $('selLesson').value);
    const resourceTopicId = lesson?.topicId ?? state.draft.step1?.addLesson?.topicId;
    step3.binding = { resourceTopicId, subject: $('selSubject').value.trim(), questions: state.picked.slice(),
      candidateIds: state.candidates.map((c) => String(c.id)), publish: $('bindingPublish').checked };
  }
  if ($('hwUseBinding').checked && state.picked.length) {
    const score = Number($('examScore').value || 10);
    step3.homework = {
      title: $('hwTitle').value.trim(), subject: $('selSubject').value.trim(), description: $('hwDesc').value,
      dueDate: $('hwDue').value ? new Date($('hwDue').value).toISOString() : null,
      status: 'published', publishType: $('hwPublishType').value,
      assignedTo: $('hwAssigned').value.split(',').map((s) => s.trim()).filter(Boolean),
      latePolicy: $('hwLate').value, lateUntil: null,
      latePenaltyPercent: Number($('hwPenalty').value || 0),
      items: state.picked.map((p, i) => ({ itemType: 'question', questionId: p.questionId, score, orderIndex: i, isRequired: true })),
    };
  }
  if(state.editHomework)step3.homework={...state.editHomework,title:$('hwTitle').value.trim(),description:$('hwDesc').value,dueDate:$('hwDue').value?new Date($('hwDue').value).toISOString():null,publishType:$('hwPublishType').value,assignedTo:$('hwAssigned').value.split(',').map(s=>s.trim()).filter(Boolean),latePolicy:$('hwLate').value,latePenaltyPercent:Number($('hwPenalty').value)};
  if ($('examEnabled').checked && state.picked.length) {
    const score = Number($('examScore').value || 10);
    step3.exam = {
      title: $('examTitle').value.trim() || $('hwTitle').value.trim(), timeLimit: Number($('examLimit').value || 30),
      passScore: Number($('examPass').value || 0), dueDate: $('examDue').value ? new Date($('examDue').value).toISOString() : null,
      showAnalysis: true, status: 'published',
      items: state.picked.map((p, i) => ({ questionId: p.questionId, score, sortOrder: i })),
    };
  }
  if (state.tasks.length) step3.tasks = state.tasks.slice();
  if ($('chatGroupId').value.trim()) step3.chat = { groupId: $('chatGroupId').value.trim(), note: $('chatNote').value };
  state.draft.step3 = step3;
  await api('/draft/step3', { method: 'POST', body: draftBody('step3', step3) });
  $('draftHint3').textContent = '已保存 · ' + new Date().toLocaleTimeString();
  banner('第③步已保存到草稿（还没有发布）', 'ok');
}

// ── step 4: dry run + execute ─────────────────────────────────────────────
async function dryRun() {
  try {
    setBusy(true, $('btnDryRun'));
    const res = await api('/dry-run', { method: 'POST', body: {classId:$('selClass').value} });
    state.lastDigest = res.digest || null;
    state.batch = res.batch;
    renderPlan(res.batch);
    $('btnExecute').disabled = res.batch.steps.length === 0 || res.batch.blocked.length > 0;
  } catch (e) { showError(e); }
  finally { setBusy(false, $('btnDryRun')); }
}

/**
 * The preview is the teacher's last checkpoint, so it leads with what will
 * happen to whom. Endpoints and request bodies live under 技术细节.
 */
function renderPlan(batch) {
  $('planBlocked').innerHTML = batch.blocked.length
    ? '<div class="banner warn show">还有 ' + batch.blocked.length + ' 项需要先处理，发布按钮已暂不可用：<br>'
      + batch.blocked.map((b) => '· ' + esc(b.reason)).join('<br>') + '</div>' : '';
  const digest = batch.digest || state.lastDigest;
  if (digest) {
    $('draftDigest').innerHTML = '<div class="note">本次将包含：① ' + esc(digest.step1) + '　② ' + esc(digest.step2)
      + '　③ ' + esc(digest.step3) + '　—— 共 ' + batch.steps.length + ' 项操作。</div>';
  }
  if (!batch.steps.length) {
    $('planTable').innerHTML = '<p class="note">还没有可执行的操作。请先在第 ①~③ 步填内容并「保存这一步」。</p>';
    return;
  }
  $('planTable').innerHTML = '<table><thead><tr><th>#</th><th>会发生什么</th><th>对象</th><th>状态</th><th></th></tr></thead><tbody>'
    + batch.steps.map((s, i) => '<tr>'
      + '<td>' + (i + 1) + '</td>'
      + '<td><strong>' + esc(s.whatHappens || s.title) + '</strong>'
        + (s.meta && s.meta.note ? '<div class="note">' + esc(s.meta.note) + '</div>' : '')
        + '<details><summary>技术细节</summary><div class="mono">' + esc(s.method) + ' ' + esc(s.endpoint) + '</div>'
        + '<pre>' + esc(JSON.stringify(s.preview, null, 2)) + '</pre></details></td>'
      + '<td>' + targetOf(s) + '</td>'
      + '<td><span class="st ' + esc(s.status) + '">' + stText(s.status) + '</span>'
        + (s.error ? '<div class="note danger">' + esc(s.error.message) + (s.error.fix ? '<br>' + esc(s.error.fix) : '') + '</div>' : '')
        + (s.result && s.result.link ? '<div class="note"><a href="' + esc(s.result.link) + '" target="_blank" rel="noopener">打开课件</a></div>' : '') + '</td>'
      + '<td>' + (s.status === 'failed' || s.status === 'waiting' ? '<button type="button" data-retry="' + esc(s.id) + '">重试这一项</button>' : '')
        + (s.undoCandidate ? ' <button type="button" data-undo="' + esc(s.id) + '">撤回</button>' : '') + '</td>'
      + '</tr>').join('') + '</tbody></table>';
  bindPlanActions();
}

/** The class/course this operation lands on, in the teacher's words. */
function targetOf(step) {
  const name = (sel) => { const el = $(sel); const o = el && el.options[el.selectedIndex]; return o && o.value ? o.textContent : ''; };
  const parts = [];
  if (step.id.startsWith('homework') || step.id.startsWith('binding') || step.id.startsWith('tasks') || step.id === 'class_course.bind') parts.push(name('selClass'));
  if (!step.id.startsWith('chat')) parts.push(name('selCourse'));
  if (step.id.startsWith('binding') || step.id.startsWith('tasks') || step.id === 'lesson.add') parts.push(name('selLesson'));
  return '<span class="note">' + esc(parts.filter(Boolean).join(' · ') || '—') + '</span>';
}

function stText(status) {
  return ({ waiting: '等待', running: '进行中', ok: '成功', failed: '失败', undone: '已撤回' })[status] || status;
}

function bindPlanActions() {
  $('planTable').querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => {
    const pre = $('prev-' + b.dataset.prev);
    pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
  }));
  $('planTable').querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', async () => {
    try { const res = await api('/execute/retry', { method: 'POST', body: { batchId: state.batch.id, stepId: b.dataset.retry } }); state.batch = res.batch; renderPlan(res.batch); }
    catch (e) { showError(e); }
  }));
  $('planTable').querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('确认撤回这一步？')) return;
    try { const res = await api('/execute/undo', { method: 'POST', body: { batchId: state.batch.id, stepId: b.dataset.undo } }); state.batch = res.batch; renderPlan(res.batch); banner('已撤回：' + res.label, 'ok'); }
    catch (e) { showError(e); }
  }));
}

async function execute() {
  if (!state.batch) return banner('先点「发布前预演」', 'warn');
  const cls = (() => { const el = $('selClass'); const o = el.options[el.selectedIndex]; return o && o.value ? o.textContent : '（未选班级）'; })();
  if (!confirm('确认发布给学生？\n\n班级：' + cls + '\n操作：' + state.batch.steps.length + ' 项\n\n确认后老师与学生都能看到。')) return;
  $('btnExecute').disabled = true;
  setBusy(true, $('btnExecute'));
  try {
    const res = await api('/execute', { method: 'POST', body: { batchId: state.batch.id } });
    state.batch = res.batch;
    renderPlan(res.batch);
    const failed = res.batch.summary.failed;
    banner(failed ? ('有 ' + failed + ' 步失败，可在表格里单步重试') : '全部步骤已发布成功', failed ? 'warn' : 'ok');
  } catch (e) { showError(e); $('btnExecute').disabled = false; }
  finally { setBusy(false, $('btnExecute')); }
}

// ── wiring ────────────────────────────────────────────────────────────────
$('loginBar').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!$('account').value.trim() || !$('password').value) {
    $('loginHint').textContent = '请先填写教师账号和密码';
    (!$('account').value.trim() ? $('account') : $('password')).focus();
    return;
  }
  $('loginHint').textContent = '正在登录…';
  clearBanner();
  setBusy(true, $('btnLogin'));
  try {
    await api('/login', { method: 'POST', body: { account: $('account').value, password: $('password').value } });
    $('password').value = '';
    await loadStatus();
    banner('登录成功', 'ok');
  } catch (e) { $('loginHint').textContent = e.message; showError(e); }
  finally { setBusy(false, $('btnLogin')); }
});
$('btnLogout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST', body: {} });
  location.reload();
});
$('btnRefresh').addEventListener('click', async () => { try { await loadStatus(); banner('已刷新', 'ok'); } catch (e) { showError(e); } });
$('selClass').addEventListener('change', () => onClassChange().catch(showError));
$('selCourse').addEventListener('change', () => onCourseChange().catch(showError));
$('appendChapterId').addEventListener('change', () => refreshLessonOptions().catch(showError));
$('mode').addEventListener('change', syncMode);
$('btnPreviewChain').addEventListener('click', previewChain);
$('btnSave1').addEventListener('click', () => saveStep1().catch(showError));
$('btnSave2').addEventListener('click', () => saveStep2().catch(showError));
$('previousHomework').addEventListener('change',async()=>{
  try {
    const id=$('previousHomework').value, cls=$('selClass').value;
    state.editHomework=null;
    if(!id)return;
    const {draft}=await api('/homework/edit',{method:'POST',body:{homeworkId:id,classId:cls}});
    if(cls!==$('selClass').value||id!==$('previousHomework').value)return;
    const h=draft.step3.homework;state.editHomework=h;
    $('hwTitle').value=h.title;$('hwDesc').value=h.description;
    $('hwDue').value=h.dueDate?new Date(new Date(h.dueDate).getTime()-new Date(h.dueDate).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
    $('hwPublishType').value=h.publishType;$('hwAssigned').value=h.assignedTo.join(',');
    $('hwLate').value=h.latePolicy;$('hwPenalty').value=h.latePenaltyPercent;
    banner('已载入原作业，保存后预演修改','ok');
  } catch(e){showError(e)}
});
$('btnSave3').addEventListener('click', () => saveStep3().catch(showError));
$('btnSearch').addEventListener('click', searchQuestions);
$('btnAddTask').addEventListener('click', addTask);
$('btnDryRun').addEventListener('click', dryRun);
$('btnExecute').addEventListener('click', execute);
function switchPane(paneId) {
  document.querySelectorAll('.stepbtn').forEach((b) => {
    const on = b.dataset.pane === paneId;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.pane').forEach((p) => {
    const active = p.id === paneId;
    p.classList.toggle('active', active);
    p.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
}
document.querySelectorAll('.stepbtn').forEach((btn) => btn.addEventListener('click', () => switchPane(btn.dataset.pane)));

// ── step 0: paper intake, shared proofreading & single-student delivery ──
state.paperFiles = [];
state.paperDraft = null;
state.paperPreview = null;

const FLAG_TEXT = { missing_answer: '待补答案', needs_review: '待核对', missing_image: '缺配图', possible_duplicate: '疑似重复' };

function toLocalDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function renderPaperQueue() {
  const box = $('paperFileQueue');
  if (!state.paperFiles.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'flex';
  box.innerHTML = state.paperFiles.map((f, i) => '<div class="row"><span class="mono">P' + (i + 1) + '</span>'
    + '<span class="grow">' + esc(f.name) + '（' + (f.size / 1024).toFixed(0) + ' KB）</span>'
    + '<button type="button" data-pfup="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
    + '<button type="button" data-pfdown="' + i + '"' + (i === state.paperFiles.length - 1 ? ' disabled' : '') + '>↓</button>'
    + '<button type="button" data-pfrm="' + i + '">移除</button></div>').join('');
  box.querySelectorAll('[data-pfup]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.pfup; const [it] = state.paperFiles.splice(i, 1); state.paperFiles.splice(i - 1, 0, it); renderPaperQueue();
  }));
  box.querySelectorAll('[data-pfdown]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.pfdown; const [it] = state.paperFiles.splice(i, 1); state.paperFiles.splice(i + 1, 0, it); renderPaperQueue();
  }));
  box.querySelectorAll('[data-pfrm]').forEach((b) => b.addEventListener('click', () => {
    state.paperFiles.splice(+b.dataset.pfrm, 1); renderPaperQueue();
  }));
}

function bindPaperDrop() {
  const drop = $('dropPaper'), input = $('filePaper');
  const addFiles = (list) => {
    for (const f of Array.from(list || [])) state.paperFiles.push(f);
    if (!$('paperTitle').value && state.paperFiles[0]) $('paperTitle').value = state.paperFiles[0].name.replace(/\.[^.]+$/, '');
    renderPaperQueue();
  };
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
}

async function loadActivePaperDraft(isInitial) {
  try {
    const res = await api('/paper/draft');
    state.paperDraft = res.draft || null;
    renderPaperDraft();
    const wantPane = new URLSearchParams(location.search).get('pane');
    if (isInitial && (wantPane === 'p0' || (state.paperDraft && !wantPane && state.paperDraft.execution?.status !== 'done'))) {
      if (wantPane === 'p0') switchPane('p0');
    }
  } catch (_) {}
}

function renderPaperStudentBox(targetStudent) {
  const box = $('paperStudentBox');
  if (!targetStudent) { box.innerHTML = ''; return; }
  if (targetStudent.status === 'matched' && targetStudent.selected) {
    box.innerHTML = '<div class="banner ok show" style="margin:0">已匹配唯一学生：<strong>' + esc(targetStudent.selected.full_name || targetStudent.selected.email)
      + '</strong>（接收人数：1）</div>';
  } else if (targetStudent.status === 'ambiguous' && (targetStudent.candidates || []).length) {
    box.innerHTML = '<div class="banner warn show" style="margin:0">班级内有 ' + targetStudent.candidates.length + ' 名重名候选，请选择唯一接收学生：'
      + '<div class="actions" style="margin-top:8px">' + targetStudent.candidates.map((s) =>
        '<button type="button" data-pickstu="' + esc(s.id) + '">' + esc(s.full_name) + (s.email ? '（' + esc(s.email) + '）' : '') + '</button>').join('') + '</div></div>';
    box.querySelectorAll('[data-pickstu]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const res = await api('/paper/student', { method: 'POST', body: { draftId: state.paperDraft?.id, classId: $('paperClass').value, studentId: b.dataset.pickstu } });
        state.paperDraft = res.draft; renderPaperDraft(); banner('已选定唯一学生', 'ok');
      } catch (e) { showError(e); }
    }));
  } else if (targetStudent.queryName) {
    box.innerHTML = '<div class="banner warn show" style="margin:0">未在所选班级匹配到「' + esc(targetStudent.queryName) + '」，请核对姓名或换班。</div>';
  } else { box.innerHTML = ''; }
}

function renderPaperDraft() {
  const d = state.paperDraft;
  if (!d) { $('paperWorkbench').style.display = 'none'; $('paperPublishCard').style.display = 'none'; return; }
  $('paperWorkbench').style.display = 'block';
  $('paperPublishCard').style.display = 'block';
  $('paperTitle').value = d.title || '';
  $('paperSubject').value = d.subject || 'math';
  if (d.classId) $('paperClass').value = d.classId;
  $('paperKnowledgeId').value = d.targetKnowledgeId || '';
  $('paperDue').value = toLocalDatetime(d.dueDate);
  $('paperStudentQuery').value = d.targetStudent?.selected?.full_name || d.targetStudent?.queryName || '';
  renderPaperStudentBox(d.targetStudent);

  const flaggedCount = (d.questions || []).filter((q) => (q.flags || []).length > 0).length;
  $('paperDraftHeading').textContent = '校卷工作台 · ' + (d.title || '未命名') + '（v' + (d.revision || 1) + '）';
  $('paperDraftMeta').textContent = '草稿 ID：' + d.id + ' · 共 ' + (d.questions || []).length + ' 题 · 待人工确认 ' + flaggedCount + ' 题 · 与对话实时共享';

  $('paperSourcePane').innerHTML = '<h2 style="font-size:13.5px;margin-bottom:8px">原卷页面（共 ' + (d.pages || []).length + ' 页）</h2>'
    + (d.pages || []).map((p, idx) => '<div class="card" style="padding:10px;margin-bottom:10px">'
      + '<div class="row" style="margin-bottom:6px"><strong>第 ' + p.pageNo + ' 页</strong><span class="grow note">' + esc(p.fileName) + '</span>'
      + '<button type="button" data-pgup="' + idx + '"' + (idx === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button type="button" data-pgdown="' + idx + '"' + (idx === d.pages.length - 1 ? ' disabled' : '') + '>↓</button></div>'
      + (p.url ? '<img src="' + esc(p.url) + '" alt="第' + p.pageNo + '页" style="max-width:100%;border-radius:6px;border:1px solid var(--line)">' : '<pre style="white-space:pre-wrap;font-size:12px">' + esc(p.textSnippet || '文本原卷') + '</pre>')
      + '</div>').join('');

  const onlyFlagged = $('paperOnlyFlagged').checked;
  const indexed = (d.questions || []).map((q, idx) => ({ q, idx }));
  const shown = onlyFlagged
    ? indexed.filter(({ q }) => (q.flags || []).length > 0)
    : indexed.slice().sort((a, b) => ((b.q.flags || []).length > 0 ? 1 : 0) - ((a.q.flags || []).length > 0 ? 1 : 0) || a.idx - b.idx);

  $('paperQuestionsPane').innerHTML = (shown.length ? shown : indexed).map(({ q, idx }) => {
    const flagsHtml = (q.flags || []).map((f) => '<span class="pill" style="background:#fff4e0;color:#7a4f00;border-color:#efd093">' + esc(FLAG_TEXT[f] || f) + '</span>').join('');
    const reuseHtml = q.reuseQuestionId ? '<span class="pill brand">复用题库 #' + esc(String(q.reuseQuestionId).slice(0, 8)) + '</span>' : '';
    const dupHtml = (q.duplicateCandidates || []).length ? '<div class="note" style="margin-top:6px;padding:8px;background:#f6f8fa;border-radius:6px">疑似重复候选：'
      + q.duplicateCandidates.map((c) => '<div class="row" style="margin-top:4px"><span class="grow">相似度 ' + Math.round(c.similarity * 100) + '%：' + esc(c.contentPreview) + '</span>'
      + '<button type="button" data-reuse="' + esc(q.id) + '" data-rid="' + esc(c.id) + '">' + (q.reuseQuestionId === c.id ? '已选复用' : '复用此题') + '</button></div>').join('')
      + (q.reuseQuestionId ? '<button type="button" style="margin-top:4px" data-reuse="' + esc(q.id) + '" data-rid="">改为新建入库</button>' : '') + '</div>' : '';
    const imgsHtml = (q.images || []).length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">'
      + q.images.map((u) => '<img src="' + esc(u) + '" style="max-height:96px;border-radius:4px;border:1px solid var(--line)">').join('') + '</div>' : '';
    return '<div class="card" style="padding:12px;margin-bottom:10px" data-qcard="' + esc(q.id) + '">'
      + '<div class="row" style="margin-bottom:8px;flex-wrap:wrap"><strong>第 ' + (idx + 1) + ' 题</strong>'
      + '<span class="note">原题号 ' + esc(q.originalNo) + ' · ' + esc(q.sourceRegion || '未定位') + '</span>' + flagsHtml + reuseHtml + '</div>'
      + '<div class="fieldrow"><label>题干（保留公式与小问）</label><textarea data-qcontent="' + esc(q.id) + '">' + esc(q.content) + '</textarea></div>'
      + '<div class="grid g3" style="margin-top:8px">'
      + '<div class="fieldrow"><label>参考答案（空则标待补）</label><input type="text" data-qans="' + esc(q.id) + '" value="' + esc(q.correct_option || '') + '"></div>'
      + '<div class="fieldrow"><label>分值</label><input type="number" min="1" data-qscore="' + esc(q.id) + '" value="' + esc(q.score || 10) + '"></div>'
      + '<div class="fieldrow"><label>配图 URL（逗号分隔）</label><input type="text" data-qimgs="' + esc(q.id) + '" value="' + esc((q.images || []).join(',')) + '"></div>'
      + '</div>' + imgsHtml + dupHtml
      + '<div class="actions">'
      + '<button class="primary" type="button" data-qsave="' + esc(q.id) + '">保存本题</button>'
      + '<button type="button" data-qsplit="' + (idx + 1) + '">拆分错粘</button>'
      + (idx < d.questions.length - 1 ? '<button type="button" data-qmerge="' + (idx + 1) + '">与下题合并</button>' : '')
      + '<button type="button" data-qup="' + idx + '"' + (idx === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button type="button" data-qdown="' + idx + '"' + (idx === d.questions.length - 1 ? ' disabled' : '') + '>↓</button>'
      + '</div></div>';
  }).join('');

  // Bind page reorder
  $('paperSourcePane').querySelectorAll('[data-pgup],[data-pgdown]').forEach((b) => b.addEventListener('click', async () => {
    const delta = b.dataset.pgup !== undefined ? -1 : 1;
    const idx = Number(b.dataset.pgup ?? b.dataset.pgdown);
    const order = d.pages.map((p) => p.pageNo);
    const [item] = order.splice(idx, 1); order.splice(idx + delta, 0, item);
    try { const res = await api('/paper/pages/reorder', { method: 'POST', body: { draftId: d.id, pageOrder: order } }); state.paperDraft = res.draft; renderPaperDraft(); }
    catch (e) { showError(e); }
  }));
  // Bind question save / reuse / split / merge / reorder
  $('paperQuestionsPane').querySelectorAll('[data-qsave]').forEach((b) => b.addEventListener('click', async () => {
    const qid = b.dataset.qsave;
    const content = $('paperQuestionsPane').querySelector('[data-qcontent="' + qid + '"]').value;
    const correct_option = $('paperQuestionsPane').querySelector('[data-qans="' + qid + '"]').value;
    const score = Number($('paperQuestionsPane').querySelector('[data-qscore="' + qid + '"]').value || 10);
    const images = $('paperQuestionsPane').querySelector('[data-qimgs="' + qid + '"]').value.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await api('/paper/question/edit', { method: 'POST', body: { draftId: d.id, questionId: qid, patch: { content, correct_option, score, images, needsReview: false } } });
      state.paperDraft = res.draft; renderPaperDraft(); banner('已保存题目修正，对话与面板已同步（v' + res.draft.revision + '）', 'ok');
    } catch (e) { showError(e); }
  }));
  $('paperQuestionsPane').querySelectorAll('[data-reuse]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const res = await api('/paper/question/edit', { method: 'POST', body: { draftId: d.id, questionId: b.dataset.reuse, patch: { reuseQuestionId: b.dataset.rid || null } } });
      state.paperDraft = res.draft; renderPaperDraft();
    } catch (e) { showError(e); }
  }));
  $('paperQuestionsPane').querySelectorAll('[data-qsplit]').forEach((b) => b.addEventListener('click', async () => {
    const second = prompt('输入拆出作为下一题的题干文本（留空则按中点拆分）：');
    if (second === null) return;
    try {
      const res = await api('/paper/question/split', { method: 'POST', body: { draftId: d.id, questionNumber: Number(b.dataset.qsplit), secondContent: second } });
      state.paperDraft = res.draft; renderPaperDraft(); banner('已拆分为两道题', 'ok');
    } catch (e) { showError(e); }
  }));
  $('paperQuestionsPane').querySelectorAll('[data-qmerge]').forEach((b) => b.addEventListener('click', async () => {
    const n = Number(b.dataset.qmerge);
    if (!confirm('确认将第 ' + n + ' 题与第 ' + (n + 1) + ' 题合并？')) return;
    try {
      const res = await api('/paper/question/merge', { method: 'POST', body: { draftId: d.id, firstNumber: n, secondNumber: n + 1 } });
      state.paperDraft = res.draft; renderPaperDraft(); banner('已合并题目', 'ok');
    } catch (e) { showError(e); }
  }));
  $('paperQuestionsPane').querySelectorAll('[data-qup],[data-qdown]').forEach((b) => b.addEventListener('click', async () => {
    const delta = b.dataset.qup !== undefined ? -1 : 1;
    const idx = Number(b.dataset.qup ?? b.dataset.qdown);
    const ids = d.questions.map((q) => q.id);
    const [item] = ids.splice(idx, 1); ids.splice(idx + delta, 0, item);
    try { const res = await api('/paper/questions/reorder', { method: 'POST', body: { draftId: d.id, orderedIds: ids } }); state.paperDraft = res.draft; renderPaperDraft(); }
    catch (e) { showError(e); }
  }));

  const execBtn = $('btnPaperExecute');
  if (d.execution?.status === 'partial') execBtn.textContent = '断点续做：仅补做失败步骤';
  else if (d.execution?.status === 'done') execBtn.textContent = '已完成入库与单生定向发布';
  else execBtn.textContent = '确认入库并定向发给 1 名学生';
}

$('paperNarrowTabs').querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => {
  $('paperNarrowTabs').querySelectorAll('[data-ptab]').forEach((x) => x.classList.toggle('on', x === b));
  $('paperSplit').dataset.tab = b.dataset.ptab;
}));
$('paperOnlyFlagged').addEventListener('change', renderPaperDraft);

$('btnPaperIngest').addEventListener('click', async () => {
  if (!state.paperFiles.length) return banner('请先选择 PDF 或试卷图片', 'warn');
  setBusy(true, $('btnPaperIngest'));
  try {
    const files = [];
    for (const f of state.paperFiles) files.push({ fileName: f.name, mimeType: f.type, bytesBase64: await fileToBase64(f) });
    const res = await api('/paper/ingest', { method: 'POST', body: {
      title: $('paperTitle').value.trim(), subject: $('paperSubject').value.trim() || 'math',
      classId: $('paperClass').value || null, studentName: $('paperStudentQuery').value.trim() || null,
      dueDate: $('paperDue').value ? new Date($('paperDue').value).toISOString() : null,
      targetKnowledgeId: $('paperKnowledgeId').value.trim() || null, files,
    } });
    state.paperDraft = res.draft; state.paperFiles = []; renderPaperQueue(); renderPaperDraft();
    banner('原卷识别完成，已生成共享校卷草稿（尚未写入正式题库）', 'ok');
  } catch (e) { showError(e); }
  finally { setBusy(false, $('btnPaperIngest')); }
});

$('btnPaperMatchStudent').addEventListener('click', async () => {
  if (!state.paperDraft) return banner('请先识别原卷生成草稿', 'warn');
  try {
    const res = await api('/paper/student', { method: 'POST', body: { draftId: state.paperDraft.id, classId: $('paperClass').value, studentName: $('paperStudentQuery').value.trim() } });
    state.paperDraft = res.draft; renderPaperDraft();
  } catch (e) { showError(e); }
});

$('btnPaperSaveMeta').addEventListener('click', async () => {
  if (!state.paperDraft) return banner('当前没有活跃草稿', 'warn');
  try {
    const res = await api('/paper/meta', { method: 'POST', body: {
      draftId: state.paperDraft.id, title: $('paperTitle').value.trim(), subject: $('paperSubject').value.trim() || 'math',
      classId: $('paperClass').value || null, targetKnowledgeId: $('paperKnowledgeId').value.trim() || null,
      dueDate: $('paperDue').value ? new Date($('paperDue').value).toISOString() : null,
    } });
    state.paperDraft = res.draft; renderPaperDraft(); banner('已保存试卷元信息', 'ok');
  } catch (e) { showError(e); }
});

$('btnPaperReload').addEventListener('click', () => loadActivePaperDraft(false).then(() => banner('已同步最新草稿', 'ok')).catch(showError));

$('btnPaperPreview').addEventListener('click', async () => {
  if (!state.paperDraft) return banner('请先识别原卷生成草稿', 'warn');
  try {
    const p = await api('/paper/preview?draftId=' + encodeURIComponent(state.paperDraft.id));
    state.paperPreview = p;
    $('btnPaperExecute').disabled = p.blocked.length > 0;
    $('paperPreviewBox').innerHTML = (p.blocked.length ? '<div class="banner err show">阻塞项：<br>' + p.blocked.map((x) => '· ' + esc(x)).join('<br>') + '</div>' : '')
      + (p.warnings.length ? '<div class="banner warn show">提醒：<br>' + p.warnings.map((x) => '· ' + esc(x)).join('<br>') + '</div>' : '')
      + '<div class="card" style="margin:0;padding:12px">'
      + '<div><strong>' + esc(p.summary.paperTitle) + '</strong> · 共 ' + p.summary.questionCount + ' 题（新题 ' + p.summary.newQuestionCount + ' / 复用 ' + p.summary.reusedQuestionCount + '）</div>'
      + '<div class="note" style="margin-top:6px">班级：' + esc(p.summary.className || '未选') + ' · 学生：<strong>' + esc(p.summary.studentName || '未匹配') + '</strong> · <strong style="color:var(--brand)">' + esc(p.summary.recipientLabel) + '</strong></div>'
      + '<div class="note" style="margin-top:4px">' + esc(p.summary.deliveryPolicy) + '</div>'
      + '<div style="margin-top:8px">' + p.steps.map((s) => '<div class="note">· ' + esc(s.title) + '：' + esc(s.willSkip ? '已完成/跳过' : s.status) + '</div>').join('') + '</div></div>';
  } catch (e) { showError(e); }
});

$('btnPaperExecute').addEventListener('click', async () => {
  if (!state.paperDraft || !state.paperPreview) return banner('请先点击预演确认收件人数', 'warn');
  const sum = state.paperPreview.summary;
  if (!confirm('确认入库并定向发布？\n\n标题：' + sum.paperTitle + '\n题数：' + sum.questionCount + '\n班级：' + sum.className + '\n学生：' + sum.studentName + '\n' + sum.recipientLabel)) return;
  setBusy(true, $('btnPaperExecute'));
  try {
    const res = await api('/paper/execute', { method: 'POST', body: { draftId: state.paperDraft.id } });
    state.paperDraft = res.draft; renderPaperDraft();
    banner('已完成：正式留存试卷 ID ' + res.examId + '，单生定向作业 ID ' + res.homeworkId + '（接收人数：1）', 'ok');
  } catch (e) { showError(e); await loadActivePaperDraft(false); }
  finally { setBusy(false, $('btnPaperExecute')); }
});

window.addEventListener('focus', () => { if ($('p0').classList.contains('active')) loadActivePaperDraft(false); });
bindPaperDrop();
bindDrop('dropStudent', 'fileStudent', 'student');
bindDrop('dropTeacher', 'fileTeacher', 'teacher');
syncMode();
loadStatus().catch(showError);
`;
