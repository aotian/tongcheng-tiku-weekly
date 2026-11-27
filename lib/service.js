/**
 * The `tikuWeekly` Host service.
 *
 * Every caller — the served teacher page, the in-DSH sidebar panel, and the
 * agent tools — goes through these methods. There is exactly one implementation
 * per operation, so a preview from the panel and a write from the page cannot
 * disagree about fields or validation.
 */

import { createUpdater } from './updater.js';
import { losslessJson } from './json-safe.js';
import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, join} from 'node:path';
import { DEFAULT_HOSTS, WeeklyError, requestJson } from './http.js';
import * as api from './api.js';
import {
  buildExamBody, buildQuestionRefs, buildTaskChain, changeBindingState, changeTaskChainState,
  createExam, createExamQuestions, createHomeworkV2, deleteHomeworkV2, isTeacherRole, listChapters,
  listClassCourses, listClasses, listMyCourses, previewClassTaskChainCopy, readBinding, readProfile,
  readTasks, sbBase, saveBindingDraft, saveTaskChainDraft, updateHomeworkV2,
} from './api.js';
import {
  clearSession, ensureSession, publicSession, readSession as readStoredSession, signIn, writeSession,
} from './session.js';
import { compilePlan } from './plan.js';
import { Runner } from './runner.js';
import { edu, bank } from './paper-bank.js';
import { PaperIntakeService } from './paper-intake.js';
import { listCoursewarePresets, preflightUploadedCourseware, renderCoursewarePair } from './courseware-v2.js';

function emptyDraft() {
  return { context: {}, step1: {}, step2: {}, step3: {} };
}

/** Drop empty strings so choosing no lesson does not overwrite a chosen one with ''. */
function cleanContext(context) {
  const out = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
}

export class WeeklyService {
  /**
   * @param {object} options
   * @param {object} options.credentials - the host credentials service
   */
  constructor({ credentials, paperIntake } = {}) {
    this.updater = createUpdater();
    this.credentials = credentials;
    this.runner = new Runner();
    this.paperIntake = paperIntake ?? new PaperIntakeService();
    this.cardDrafts = new Map();
    this.activeCardClass = new Map();
    /** @type {Map<string, object>} drafts keyed by teacher uid */
    this.drafts = new Map();
    this.courseDraftRoot = join(homedir(), '.dsh/storages/tiku-weekly/course-drafts');
    /** @type {Map<string, object>} batches owned by banners, keyed by batch id */
    this.listeners = new Map();
  }

  // ── session ─────────────────────────────────────────────────────────────

  /** Sign in; keeps the token in a credential record, never in the draft. */
  async login(account, password) {
    const session = await signIn(this.credentials, DEFAULT_HOSTS.teach, account, password);
    const profile = await readProfile(DEFAULT_HOSTS.tiku, session.accessToken);
    await this.persistProfile(session, profile);
    return this.describeSession(session, profile);
  }

  /** Drop the stored session. */
  async logout() {
    await clearSession(this.credentials);
    this.drafts.clear();
    return { loggedIn: false };
  }

  /**
   * The current session, or `null` when there is none usable.
   * A nearly-expired token is refreshed once, and the rotated tokens are saved.
   */
  async current() {
    const stored = await readStoredSession(this.credentials);
    if (!stored) return null;
    const session = await ensureSession(this.credentials);
    if (!session) return null;
    return session;
  }

  async persistProfile(session, profile) {
    await writeSession(this.credentials, session, profile);
  }

  describeSession(session, profile) {
    return {
      loggedIn: true,
      session: publicSession({ ...session, ...(profile ?? {}) }),
      userId: profile?.id ?? session.userId,
      isTeacher: isTeacherRole(profile?.role ?? session.role),
    };
  }

  /** Status for the top context bar; never includes tokens. */
  async status() {
    const session = await this.current();
    if (!session) return { loggedIn: false, session: null, isTeacher: false };
    try {
      const profile = await readProfile(DEFAULT_HOSTS.tiku, session.accessToken);
      if (profile.role !== session.role) await this.persistProfile(session, profile);
      return this.describeSession(session, profile);
    } catch (error) {
      if (error instanceof WeeklyError && error.status === 401) {
        await clearSession(this.credentials);
        return { loggedIn: false, session: null, isTeacher: false, reason: '登录已过期，请重新登录' };
      }
      // Anything else (network, 5xx) keeps the session: the token is not known bad.
      return this.describeSession(session, { id: session.userId, role: session.role });
    }
  }

  /** Resolve a session or throw a Chinese error the UI can show directly. */
  async requireTeacher() {
    const session = await this.current();
    if (!session) throw new WeeklyError('还没有登录童澄账号', { code: 'NO_SESSION', fix: '在顶部输入账号密码登录。' });
    const profile = await readProfile(DEFAULT_HOSTS.tiku, session.accessToken);
    if (!isTeacherRole(profile.role)) {
      throw new WeeklyError(`当前账号身份是「${profile.role ?? '未知'}」，不是教师`, {
        code: 'NOT_TEACHER',
        fix: '请用教师或管理员账号登录。',
      });
    }
    return { session, profile, token: session.accessToken, userId: profile.id, host: DEFAULT_HOSTS.teach };
  }

  // ── context reads ───────────────────────────────────────────────────────

  async classes() {
    const { host, token, userId } = await this.requireTeacher();
    return { classes: await listClasses(DEFAULT_HOSTS.tiku, token, userId) };
  }

  async classCourses(classId) {
    if (!classId) throw new WeeklyError('缺少 classId', { code: 'NO_CLASS' });
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, classId);
    return { courses: await listClassCourses(host, token, classId) };
  }

  async myCourses() {
    const { host, token } = await this.requireTeacher();
    return { courses: await listMyCourses(host, token) };
  }

  /**
   * Lessons under a course (optionally one chapter), so the teacher picks
   * 「第12周 · 循环嵌套」by name and never handles a lesson id by hand.
   */
  async lessons(courseId, chapterId) {
    if (!courseId) throw new WeeklyError('缺少 courseId', { code: 'NO_COURSE' });
    const { host, token } = await this.requireTeacher();
    const chapters = await listChapters(host, token, courseId);
    const targetChapters = chapterId ? chapters.filter((row) => row.id === chapterId) : chapters;
    const lessons = [];
    for (const chapter of targetChapters) {
      const rows = await requestJson({
        base: `${sbBase(host)}/rest/v1`,
        pathname: '/lessons',
        token,
        apikey: true,
        params: {
          select: 'id,title,chapter_id,topic_id,order_no',
          chapter_id: `eq.${chapter.id}`,
          order: 'order_no.asc,id.asc',
          limit: 100,
        },
      });
      for (const row of Array.isArray(rows) ? rows : []) {
        lessons.push({
          id: row.id,
          title: row.title ?? '（未命名课次）',
          chapterId: row.chapter_id ?? chapter.id,
          chapterTitle: chapter.title,
          topicId: row.topic_id ?? null,
        });
      }
    }
    return { lessons };
  }

  /** Courseware topics of one course, for attaching the private deck. */
  async topics(courseId) {
    const { host, token } = await this.requireTeacher();
    const rows = await requestJson({
      base: `${sbBase(host)}/rest/v1`,
      pathname: '/topics',
      token,
      apikey: true,
      params: {
        select: 'id,name,category,html_url,created_at',
        ...(courseId ? { course_id: `eq.${courseId}` } : {}),
        order: 'created_at.desc',
        limit: 100,
      },
    }).catch((error) => {
      // A deployment may not expose `course_id` on topics; a recent list is
      // still the honest answer rather than an invented one.
      if (error instanceof WeeklyError && (error.status === 400 || error.status === 404)) return [];
      throw error;
    });
    return { topics: Array.isArray(rows) ? rows.map((row) => ({ id: row.id, name: row.name, htmlUrl: row.html_url ?? null })) : [] };
  }

  async chapters(courseId) {
    if (!courseId) throw new WeeklyError('缺少 courseId', { code: 'NO_COURSE' });
    const { host, token } = await this.requireTeacher();
    return { chapters: await listChapters(host, token, courseId) };
  }

  /** Teaching plans of one course, read through PostgREST with the caller's JWT. */
  async plans(courseId) {
    if (!courseId) throw new WeeklyError('缺少 courseId', { code: 'NO_COURSE' });
    const { host, token } = await this.requireTeacher();
    const rows = await requestJson({
      base: `${sbBase(host)}/rest/v1`,
      pathname: '/plans',
      token,
      apikey: true,
      params: { select: 'id,course_id,name,created_at', course_id: `eq.${courseId}`, order: 'created_at.desc', limit: 100 },
    }).catch((error) => {
      // `plans` may not be readable through RLS on every deployment; an empty
      // list is honest, and the UI says "不指定" rather than inventing rows.
      if (error instanceof WeeklyError && (error.status === 403 || error.status === 404)) return [];
      throw error;
    });
    return { plans: Array.isArray(rows) ? rows.map((row) => ({ id: row.id, name: row.name })) : [] };
  }

  /**
   * Require a class in the platform-authorized list and reject expired classes.
   */
  async assertClassUsable(host, token, userId, classId) {
    const classes = await listClasses(DEFAULT_HOSTS.tiku, token, userId);
    const target = classes.find((row) => row.id === classId);
    if (!target) throw new WeeklyError('该班级不存在或当前账号无管理权限', { code: 'CLASS_NOT_FOUND' });
    if (target.expired) {
      throw new WeeklyError(`班级「${target.name}」已过期`, {
        code: 'CLASS_EXPIRED',
        fix: '请延长班级有效期，或换一个有效班级。',
      });
    }
    return target;
  }

  // ── binding + task chain ────────────────────────────────────────────────

  async candidates({ classId, courseId, lessonId, keyword }) {
    if (!classId || !courseId || !lessonId) {
      throw new WeeklyError('检索候选题需要班级、课程、课次三个 ID', { code: 'MISSING_IDS' });
    }
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, classId);
    const payload = await readBinding(host, token, { lessonId, classId, courseId, keyword });
    return {
      candidates: extractCandidates(payload),
      binding: payload?.binding ?? payload?.current ?? null,
    };
  }

  async tasks({ classId, courseId, lessonId }) {
    if (!classId || !courseId || !lessonId) throw new WeeklyError('需要班级、课程、课次三个 ID', { code: 'MISSING_IDS' });
    const { host, token } = await this.requireTeacher();
    return { tasks: await readTasks(host, token, { lessonId, classId, courseId }) };
  }

  async previewChain({ courseId, sourceClassId, targetClassId }) {
    if (!courseId || !sourceClassId || !targetClassId) {
      throw new WeeklyError('跨班复制需要课程、源班、目标班', { code: 'MISSING_IDS' });
    }
    if (sourceClassId === targetClassId) throw new WeeklyError('源班和目标班不能是同一个班', { code: 'SAME_CLASS' });
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, sourceClassId);
    await this.assertClassUsable(host, token, userId, targetClassId);
    const preview = await previewClassTaskChainCopy(host, token, { courseId, sourceClassId, targetClassId });
    // The hash is whatever the preview endpoint returns; it is carried back
    // unchanged in `expected_preview_hash`. No digest is fabricated locally.
    const hash = findHash(preview);
    return {
      preview,
      previewHash: hash,
      willCopy: firstArray(preview, ['will_copy', 'willCopy', 'copy', 'items']),
      willSkip: firstArray(preview, ['will_skip', 'willSkip', 'skip', 'skipped']),
      willConflict: firstArray(preview, ['will_conflict', 'willConflict', 'conflict', 'conflicts']),
    };
  }

  // ── drafts ──────────────────────────────────────────────────────────────

  draftKey(userId, classId) {
    return classId ? `${userId}:${classId}` : userId;
  }

  courseDraftPath(userId, classId) {
    const safe = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return join(this.courseDraftRoot, safe(userId), `${safe(classId)}.json`);
  }

  readCourseDraft(userId, classId) {
    const key = this.draftKey(userId, classId);
    if (this.drafts.has(key)) return this.drafts.get(key);
    if (!classId) return null;
    const file = this.courseDraftPath(userId, classId);
    if (!existsSync(file)) return null;
    const draft = JSON.parse(readFileSync(file, 'utf8'));
    this.drafts.set(key, draft);
    return draft;
  }

  writeCourseDraft(userId, draft) {
    const classId = draft?.context?.classId || null;
    draft.updatedAt = new Date().toISOString();
    this.drafts.set(this.draftKey(userId, classId), draft);
    if (!classId) return draft;
    const file = this.courseDraftPath(userId, classId);
    mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(draft), { mode: 0o600 });
    renameSync(tmp, file);
    return draft;
  }

  listCourseDrafts(userId) {
    const byClass = new Map();
    const remember = (classId, draft) => {
      if (!classId || !draft) return;
      byClass.set(classId, {
        classId,
        courseId: draft.context?.courseId ?? null,
        lessonId: draft.context?.lessonId ?? null,
        lessonTitle: draft.step1?.addLesson?.title ?? null,
        homeworkTitle: draft.step3?.homework?.title ?? null,
        updatedAt: draft.updatedAt ?? null,
      });
    };
    for (const [key, draft] of this.drafts) {
      if (!key.startsWith(`${userId}:`)) continue;
      remember(key.slice(userId.length + 1), draft);
    }
    const dir = join(this.courseDraftRoot, String(userId || '').replace(/[^a-zA-Z0-9_-]/g, ''));
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.json')) continue;
        const classId = name.slice(0, -'.json'.length);
        if (byClass.has(classId)) continue;
        try { remember(classId, this.readCourseDraft(userId, classId)); } catch { /* skip unreadable */ }
      }
    }
    return [...byClass.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  resolveCourseDraft(userId, classId) {
    if (classId) return this.readCourseDraft(userId, classId) ?? emptyDraft();
    const open = this.listCourseDrafts(userId);
    if (open.length > 1) {
      throw new WeeklyError('有多份未完成的课件草稿，请指定 classId', { code: 'COURSE_DRAFT_AMBIGUOUS' });
    }
    if (open.length === 1) return this.readCourseDraft(userId, open[0].classId) ?? emptyDraft();
    return this.drafts.get(this.draftKey(userId)) ?? emptyDraft();
  }

  async lessonCards({classId, studentId, lesson, questions, revision}) {
    const {host,token,userId}=await this.requireTeacher();
    if (!classId) throw new WeeklyError('请先选择班级');
    await this.assertClassUsable(host,token,userId,classId);
    if(![classId,userId].every(id=>/^[a-zA-Z0-9-]+$/.test(id))) throw new WeeklyError('班级或账号标识无效');
    const key=userId+'/'+classId;
    const dir=join(homedir(),'.dsh/storages/tiku-weekly/cards',userId);
    const file=join(dir,classId+'.json');
    if(!this.cardDrafts.has(key)&&existsSync(file))this.cardDrafts.set(key,JSON.parse(readFileSync(file,'utf8')));
    if (!questions) return this.cardDrafts.get(key) ?? {revision:0,cards:[]};
    const read=(table,params)=>requestJson({base:sbBase(host)+'/rest/v1',pathname:'/'+table,token,apikey:true,params});
    if (!lesson || questions.length!==6 || questions.some(q=>!q.title || !q.reason || !/^[0-9a-f-]{36}$/i.test(q.id))) throw new WeeklyError('请提供对应课次及六道真实题目、选题理由');
    const [member,rows]=await Promise.all([read('class_students',{select:'student_id',class_id:'eq.'+classId,student_id:'eq.'+studentId}),read('quiz_questions',{select:'id,oj_problem_id',type:'eq.oj',oj_problem_id:'not.is.null',id:'in.('+questions.map(q=>q.id).join(',')+')'})]);
    if(!member.length || new Set(rows.map(r=>r.oj_problem_id)).size!==6) throw new WeeklyError('请核对在班学生和六个不同的 OJ 题号');
    const current=this.cardDrafts.get(key) ?? {revision:0,cards:[]};
    if(revision!==current.revision) throw new WeeklyError('草稿版本已变化，请先读最新题单再修改');
    const [person]=await read('profiles',{id:'eq.'+studentId,select:'full_name,username'});
    if((this.cardDrafts.get(key)?.revision ?? 0)!==revision)throw new WeeklyError('草稿版本已变化，请重读');
    const next={revision:revision+1,cards:[...current.cards.filter(c=>c.studentId!==studentId),{studentId,studentName:person?.full_name||person?.username,lesson,questions}]};
    mkdirSync(dir,{recursive:true,mode:0o700});
    writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});
    renameSync(file+'.tmp',file);
    this.activeCardClass.set(userId,classId);
    this.cardDrafts.set(key,next);
    return next;
  }

  async prepareCard({sourceClassId,sourceStudentId,revision,classId,studentId,courseId,lessonId,title,dueDate}) {
    const {host,token,userId}=await this.requireTeacher();
    await this.assertClassUsable(host,token,userId,classId);
    const source=await this.lessonCards({classId:sourceClassId});
    const card=source.cards.find(c=>c.studentId===sourceStudentId);
    if (!card || revision!==source.revision) throw new WeeklyError('题单已变化，请重读再预演');
    const read=(table,params)=>requestJson({base:sbBase(host)+'/rest/v1',pathname:'/'+table,token,apikey:true,params});
    const [member,bound,lessons,existing]=await Promise.all([
      read('class_students',{select:'student_id',class_id:'eq.'+classId,student_id:'eq.'+studentId}),
      this.classCourses(classId),this.lessons(courseId),
      read('homework',{select:'id,title,assigned_to',class_id:'eq.'+classId,title:'eq.'+title}),
    ]);
    if(!member.length || !bound.courses.some(c=>c.courseId===courseId) || !lessons.lessons.some(l=>l.id===lessonId))throw new WeeklyError('目标学生、班级、课程或课次不匹配');
    if(existing.some(h=>h.assigned_to?.includes(studentId)))throw new WeeklyError('该学生已收到同名作业，请从已有作业修改');
    const homework={title,dueDate,status:'published',publishType:'targeted',assignedTo:[studentId],subject:'C++',items:card.questions.map((q,i)=>({questionId:q.id,title:q.title,score:10,orderIndex:i}))};
    const planInput={context:{classId,courseId,lessonId},step1:{},step2:{},step3:{homework,tasks:[{taskType:'homework',stage:'in_class'}]}};
    const plan=compilePlan({...planInput,teacherId:userId,host});
    const batch=this.runner.create({ownerId:userId,plan,payload:planInput});
    this.runner.get(userId,batch.id).draftVersion=this.readCourseDraft(userId, classId)?.updatedAt;
    return {batch,studentId,title,questions:card.questions};
  }

  async cardContext() {
    const {userId}=await this.requireTeacher();
    return {classId:this.activeCardClass.get(userId) || null};
  }
  async homeworkList(classId) {
    const {host,token,userId}=await this.requireTeacher();
    await this.assertClassUsable(host,token,userId,classId);
    return {rows:await requestJson({base:sbBase(host)+'/rest/v1',pathname:'/homework',token,apikey:true,params:{select:'id,title',class_id:'eq.'+classId,order:'created_at.desc',limit:100}})};
  }

  async listOpenCourseDrafts() {
    const { userId } = await this.requireTeacher();
    return { courseDrafts: this.listCourseDrafts(userId) };
  }

  async getDraft(classId) {
    const { userId } = await this.requireTeacher();
    const draft = this.resolveCourseDraft(userId, classId || null);
    return { ...draft, draft, courseDrafts: this.listCourseDrafts(userId) };
  }

  async putDraftSection(section, { context, ...rest }) {
    const { userId } = await this.requireTeacher();
    const classId = context?.classId || null;
    const draft = this.readCourseDraft(userId, classId) ?? emptyDraft();
    if (context) draft.context = { ...draft.context, ...cleanContext(context) };
    // A section that arrives with nothing keeps what was already there: saving
    // step ③ must never silently drop step ①. 另一个班的草稿留在自己的键上。
    if (section === 'step1' && rest.step1) draft.step1 = rest.step1;
    if (section === 'step2' && (rest.step2 || rest.studentFile || rest.teacherFile)) {
      draft.step2 = materializeStep2(rest.step2 || {}, {
        studentFile: rest.studentFile,
        teacherFile: rest.teacherFile,
      });
    }
    if (section === 'step3' && rest.step3) draft.step3 = rest.step3;
    this.writeCourseDraft(userId, draft);
    return { draft, courseDrafts: this.listCourseDrafts(userId) };
  }

  /**
   * Seed the draft from an existing homework or task chain, so the teacher
   * edits a copy instead of rebuilding it in the form.
   */
  async startEdit({ homeworkId, lessonId, classId, courseId }) {
    const { host, token, userId } = await this.requireTeacher();
    const targetClassId = classId || null;
    const draft = (targetClassId ? this.readCourseDraft(userId, targetClassId) : await this.getDraftFor(userId).then((row) => row.draft)) ?? emptyDraft();
    if (homeworkId) {
      const [row] = await requestJson({
        base: `${sbBase(host)}/rest/v1`,
        pathname: '/homework',
        token,
        apikey: true,
        params: { select: '*', id: `eq.${homeworkId}`, limit: 1 },
      });
      if (row && classId && row.class_id !== classId) throw new WeeklyError('作业不属于当前班级');
      if (!row) throw new WeeklyError('找不到这份作业', { code: 'NOT_FOUND' });
      const items = await requestJson({
        base: `${sbBase(host)}/rest/v1`,
        pathname: '/homework_items',
        token,
        apikey: true,
        params: { select: '*', archived_at:'is.null', homework_id: `eq.${homeworkId}`, order: 'order_index.asc', limit: 200 },
      });
      draft.context = { ...draft.context, classId: row.class_id, courseId: courseId ?? draft.context.courseId ?? null };
      draft.step3 = {
        ...draft.step3,
        homework: {
          existingHomeworkId: homeworkId,
          title: row.title ?? '',
          subject: row.subject ?? '',
          description: row.description ?? '',
          dueDate: row.due_date ?? null,
          status: row.status === 'closed' ? 'closed' : 'published',
          publishType: row.publish_type ?? 'public',
          assignedTo: Array.isArray(row.assigned_to) ? row.assigned_to : [],
          latePolicy: row.late_policy ?? 'closed',
          lateUntil: row.late_until ?? null,
          latePenaltyPercent: Number(row.late_penalty_percent ?? 0),
          items: (Array.isArray(items) ? items : []).map((item, index) => ({
            id:item.id,title:item.title,prompt_md:item.prompt_md,response_kinds:item.response_kinds,code_languages:item.code_languages,max_files:item.max_files,
            itemType: item.item_type ?? 'question',
            questionId: item.question_id,
            score: Number(item.score ?? 0),
            orderIndex: item.order_index ?? index,
            isRequired: item.is_required !== false,
          })),
        },
      };
    }
    if (lessonId) {
      draft.context = { ...draft.context, lessonId, classId: classId ?? draft.context.classId, courseId: courseId ?? draft.context.courseId };
      const payload = await readTasks(host, token, { lessonId, classId: classId ?? draft.context.classId, courseId });
      const list = payload?.tasks ?? payload?.data?.tasks ?? [];
      draft.step3 = {
        ...draft.step3,
        tasks: (Array.isArray(list) ? list : []).map((task) => ({
          taskType: task.task_type ?? task.taskType,
          stage: task.stage,
          refId: task.ref_id ?? task.refId ?? null,
        })),
      };
    }
    this.writeCourseDraft(userId, draft);
    return { draft, courseDrafts: this.listCourseDrafts(userId) };
  }

  async getDraftFor(userId, classId) {
    return { draft: this.readCourseDraft(userId, classId || null) ?? this.drafts.get(this.draftKey(userId)) ?? emptyDraft() };
  }

  async clearDraft(classId) {
    const { userId } = await this.requireTeacher();
    const id = classId || null;
    this.drafts.delete(this.draftKey(userId, id));
    if (id) {
      const file = this.courseDraftPath(userId, id);
      if (existsSync(file)) unlinkSync(file);
    }
    return { draft: emptyDraft(), courseDrafts: this.listCourseDrafts(userId) };
  }

  // ── dry run + execution ─────────────────────────────────────────────────

  /**
   * Compile the current draft into a plan. Writes nothing.
   *
   * Binary uploads are kept out of the plan and attached at execution time, so
   * a preview never carries megabytes of base64.
   */
  async dryRun(expectedClass) {
    const { userId } = await this.requireTeacher();
    const draft = this.resolveCourseDraft(userId, expectedClass || null);
    if(expectedClass!==undefined && expectedClass!==draft.context.classId) throw new WeeklyError("草稿班级与面板不一致，请先保存当前班草稿");
    const decoded = decodeUploads(draft.step2 ?? {});
    const plan = compilePlan({
      teacherId: userId,
      context: draft.context ?? {},
      step1: draft.step1 ?? {},
      step2: decoded.step2,
      step3: draft.step3 ?? {},
      host: DEFAULT_HOSTS.teach,
    });
    for (const issue of preflightUploadedCourseware(decoded.runtime).issues) {
      plan.blocked.push({
        id: 'courseware.quality',
        code: issue.code,
        reason: `${issue.code}：${issue.message}`,
      });
    }
    // Attach the raw uploads to the batch payload so execution has the bytes;
    // the preview only ever shows metadata, so nothing megabytes-large is sent back.
    const payload = { ...draft, step2: { ...decoded.step2, ...decoded.runtime } };
    const batch = this.runner.create({ ownerId: userId, plan, payload:structuredClone(payload) });
    this.runner.get(userId,batch.id).draftVersion=draft.updatedAt;
    return losslessJson({ batch, digest: plan.digest });
  }

  async execute(batchId) {
    const { userId, token, host } = await this.requireTeacher();
    const batch=this.runner.get(userId,batchId);
    if(batch && batch.draftVersion!==this.readCourseDraft(userId, batch.payload?.context?.classId || null)?.updatedAt) throw new WeeklyError('草稿已变化，请重新预演');
    const view = await this.runner.execute(userId, batchId, {
      host,
      token,
      teacherId: userId,
      onProgress: (next) => this.emit(userId, batchId, next),
    });
    return { batch: view };
  }

  async retry(batchId, stepId) {
    const { userId, token, host } = await this.requireTeacher();
    const batch=this.runner.get(userId,batchId);
    if(batch && batch.draftVersion!==this.readCourseDraft(userId, batch.payload?.context?.classId || null)?.updatedAt) throw new WeeklyError('草稿已变化，请重新预演');
    const view = await this.runner.retry(userId, batchId, stepId, {
      host, token, teacherId: userId, onProgress: (next) => this.emit(userId, batchId, next),
    });
    return { batch: view };
  }

  async undo(batchId, stepId) {
    const { userId, token, host } = await this.requireTeacher();
    const result = await this.runner.undo(userId, batchId, stepId, { host, token });
    return result;
  }

  batch(userId, batchId) {
    const batch = this.runner.get(userId, batchId);
    if (!batch) throw new WeeklyError('找不到这次预演', { code: 'NO_BATCH' });
    return { batch: this.runner.viewOf(batch) };
  }

  // ── progress events for the served page ─────────────────────────────────

  subscribe(batchId, sink) {
    const set = this.listeners.get(batchId) ?? new Set();
    set.add(sink);
    this.listeners.set(batchId, set);
    return () => {
      set.delete(sink);
      if (set.size === 0) this.listeners.delete(batchId);
    };
  }

  emit(userId, batchId, view) {
    const set = this.listeners.get(batchId);
    if (!set) return;
    for (const sink of set) {
      try {
        sink(view);
      } catch {
        // A closed stream must not break the run.
      }
    }
  }

  // ── direct one-shot operations used by tools ────────────────────────────

  /** Create a class owned by the caller. `teacher_id` is never taken from input. */
  async createClass({ name, expiresAt }) {
    if (!name) throw new WeeklyError('班级名称不能为空', { code: 'NO_NAME' });
    const { host, token, userId } = await this.requireTeacher();
    return api.createClass(host, token, { name, teacherId: userId, expiresAt });
  }

  /** Bind a course to a class. */
  async bindCourse({ classId, courseId, planId }) {
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, classId);
    return api.bindCourseToClass(host, token, { classId, courseId, planId });
  }

  /** Create a course row. */
  async createCourse({ title, categoryId }) {
    if (!title) throw new WeeklyError('课程标题不能为空', { code: 'NO_TITLE' });
    const { host, token } = await this.requireTeacher();
    return api.createCourse(host, token, { title, categoryId });
  }

  /** Publish or unpublish a course. */
  async setCourseStatus({ courseId, status }) {
    const { host, token } = await this.requireTeacher();
    return api.setCourseStatus(host, token, courseId, status);
  }

  /** Create a chapter. */
  async createChapter({ courseId, title, orderNo, planId }) {
    if (!courseId || !title) throw new WeeklyError('章节需要课程和标题', { code: 'MISSING_FIELDS' });
    const { host, token } = await this.requireTeacher();
    return api.createChapter(host, token, { courseId, title, orderNo: Number(orderNo ?? 1), planId });
  }

  /** Create a courseware topic from an already-uploaded URL. */
  async createTopic({ name, htmlUrl, category, htmlVisibleToStudents }) {
    if (!name) throw new WeeklyError('课件名称不能为空', { code: 'NO_NAME' });
    const { host, token } = await this.requireTeacher();
    return api.createTopic(host, token, { name, htmlUrl, category, htmlVisibleToStudents });
  }

  /** Save (and optionally publish) a lesson_sidebar binding for a lesson. */
  async saveBinding({ lessonId, classId, courseId, resourceTopicId, subject, questions, publish }) {
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, classId);
    const candidates = await readBinding(host, token, { lessonId, classId, courseId });
    const candidateIds = extractCandidates(candidates).map((item) => String(item.id));
    const questionRefs = buildQuestionRefs({ subject, questions, candidateIds });
    const saved = await putOrWithdrawFirstThenSave(host, token, { lessonId, classId, courseId, resourceTopicId, questionRefs });
    if (publish) await changeBindingState(host, token, { lessonId, classId, courseId, action: 'publish' });
    return { saved, published: Boolean(publish) };
  }

  /** Publish or withdraw a lesson binding. */
  async bindingState({ lessonId, classId, courseId, action }) {
    const { host, token } = await this.requireTeacher();
    return changeBindingState(host, token, { lessonId, classId, courseId, action });
  }

  /** Save homework v2 and publish it (`status: published`) as one call. */
  async createHomework(input) {
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, input.classId);
    return createHomeworkV2(host, token, input);
  }

  /** Edit, re-due, or switch the status of an existing homework. */
  async updateHomework(homeworkId, input) {
    if (!homeworkId) throw new WeeklyError('缺少作业 ID', { code: 'NO_ID' });
    const { host, token } = await this.requireTeacher();
    return updateHomeworkV2(host, token, homeworkId, input);
  }

  /** Soft-delete a homework. */
  async deleteHomework(homeworkId) {
    if (!homeworkId) throw new WeeklyError('缺少作业 ID', { code: 'NO_ID' });
    const { host, token } = await this.requireTeacher();
    return deleteHomeworkV2(host, token, homeworkId);
  }

  /** Save and publish a lesson task chain. */
  async saveTasks({ lessonId, classId, courseId, tasks, publish = true }) {
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, classId);
    const normalized = buildTaskChain({ classId, courseId, tasks });
    const saved = await putTasks(host, token, { lessonId, classId, courseId, normalized });
    if (publish) await changeTaskChainState(host, token, { lessonId, classId, courseId, action: 'publish' });
    return { saved, published: Boolean(publish) };
  }

  /** Create an exam row plus its question rows. */
  async createExam(input) {
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, input.classId);
    const compiled = buildExamBody(input, userId);
    const row = await createExam(host, token, input, userId);
    const examId = row?.id;
    if (!examId) throw new WeeklyError('创建考试后没有返回 exam id', { code: 'NO_EXAM_ID' });
    const rows = await createExamQuestions(host, token, examId, compiled.questions);
    return { exam: row, questions: Array.isArray(rows) ? rows.length : null };
  }

  // ── paper intake & single-student targeted homework ─────────────────────

  async classStudents(classId) {
    if (!classId) throw new WeeklyError('缺少 classId', { code: 'NO_CLASS' });
    const { host, token, userId } = await this.requireTeacher();
    await this.assertClassUsable(host, token, userId, classId);
    return { students: await this.paperIntake.listClassStudentsRemote(host, token, classId) };
  }

  async knowledgeNodes(filter = {}) {
    const { host, token } = await this.requireTeacher();
    return this.paperIntake.listKnowledgeNodesRemote(host, token, filter ?? {});
  }

  async paperBankTool(name, args) {
    let ctx;
    try { ctx = await this.requireTeacher(); }
    catch (error) {
      if (['NO_SESSION', 'NOT_TEACHER', 'REFRESH_FAILED'].includes(error.code) || [401, 403].includes(error.status)) error.code = 'BANK_AUTH_FAILED';
      throw error;
    }
    switch (name) {
      case 'edu_list': return edu(ctx, 'list', args);
      case 'edu_preview': return edu(ctx, 'preview', args);
      case 'edu_import': return edu(ctx, 'import', args);
      case 'bank_search': return bank(ctx, args);
      case 'bank_get': return bank(ctx, args, true);
      case 'paper_bind': return this.paperIntake.bind(ctx, args);
      case 'paper_image_upload': return this.paperIntake.upload(ctx, args);
      case 'paper_set_images': return this.paperIntake.setImages(ctx, args);
      case 'paper_preflight': return this.paperIntake.preflight(ctx, args);
      default: throw new WeeklyError('未知题库操作');
    }
  }

  async paperIngest(input = {}) {
    const { host, token, userId } = await this.requireTeacher();
    let className = input.className ?? null;
    if (input.classId) {
      const cls = await this.assertClassUsable(host, token, userId, input.classId);
      className = className || cls.name;
    }
    return this.paperIntake.ingest({ ...input, host, token, userId, className });
  }

  async paperGet(draftId) {
    const { userId } = await this.requireTeacher();
    return this.paperIntake.getDraft(userId, draftId);
  }

  async paperOpen(draftId) {
    const { userId } = await this.requireTeacher();
    const draft = this.paperIntake.store.activate(userId, draftId);
    if (!draft) throw new WeeklyError('找不到这份录入草稿', { code: 'NO_PAPER_DRAFT' });
    return this.paperIntake.getDraft(userId, draft.id);
  }

  async paperUpdateMeta({ draftId, ...patch } = {}) {
    const { host, token, userId } = await this.requireTeacher();
    if (patch.classId) {
      const cls = await this.assertClassUsable(host, token, userId, patch.classId);
      patch.className = patch.className || cls.name;
    }
    return this.paperIntake.updateMeta(userId, draftId, patch);
  }

  async paperResolveStudent({ draftId, classId, className, studentName, studentId } = {}) {
    const { host, token, userId } = await this.requireTeacher();
    let resolvedClassName = className;
    if (classId) {
      const cls = await this.assertClassUsable(host, token, userId, classId);
      resolvedClassName = resolvedClassName || cls.name;
    }
    return this.paperIntake.resolveStudent({
      host, token, userId, draftId, classId, className: resolvedClassName, studentName, studentId,
    });
  }

  async paperReorderPages({ draftId, pageOrder } = {}) {
    const { userId } = await this.requireTeacher();
    return this.paperIntake.reorderPages(userId, draftId, pageOrder);
  }

  async paperEditQuestion(args = {}) {
    return this.paperIntake.editVerified(await this.requireTeacher(), args);
  }

  async paperSplitQuestion({ draftId, questionId, questionNumber, splitIndex, secondContent } = {}) {
    const { userId } = await this.requireTeacher();
    return this.paperIntake.splitQuestion(userId, draftId, { questionId, questionNumber, splitIndex, secondContent });
  }

  async paperMergeQuestions({ draftId, firstNumber, secondNumber } = {}) {
    const { userId } = await this.requireTeacher();
    return this.paperIntake.mergeQuestions(userId, draftId, { firstNumber, secondNumber });
  }

  async paperReorderQuestions({ draftId, orderedIds } = {}) {
    const { userId } = await this.requireTeacher();
    return this.paperIntake.reorderQuestions(userId, draftId, orderedIds);
  }

  async paperPreview(draftId) {
    const { userId } = await this.requireTeacher();
    return this.paperIntake.previewPublish(userId, draftId);
  }

  async paperExecute(draftId) {
    const { host, token, userId } = await this.requireTeacher();
    const draft = this.paperIntake.requireDraft(userId, draftId);
    if (draft.classId) await this.assertClassUsable(host, token, userId, draft.classId);
    return this.paperIntake.executePublish({ host, token, userId, draftId: draft.id });
  }

  // ── unified K12 courseware v2.1 templates ───────────────────────────────

  coursewarePresets() {
    return listCoursewarePresets();
  }

  async generateCoursewareV2(input = {}) {
    let specInput = input && typeof input === 'object' ? { ...input } : {};
    if (specInput.specFile) {
      const rawSpec = JSON.parse(readFileSync(String(specInput.specFile), 'utf8'));
      const loaded = rawSpec && typeof rawSpec === 'object' && rawSpec.callArgs && typeof rawSpec.callArgs === 'object'
        ? rawSpec.callArgs
        : rawSpec;
      specInput = { ...loaded, ...specInput };
    }
    const rendered = renderCoursewarePair(specInput);
    if (Array.isArray(rendered.issues) && rendered.issues.length) {
      throw new WeeklyError(`课件未通过质量门（${rendered.issues.length} 项），未写入草稿`, {
        code: 'COURSEWARE_QUALITY_BLOCKED',
        status: 400,
        issues: rendered.issues,
      });
    }
    const saveToDraft = specInput.saveToDraft !== false;
    let draft = null;
    if (saveToDraft) {
      const step2 = {
        student: {
          fileName: rendered.studentFileName,
          contentType: 'text/html',
          size: rendered.studentSize,
          bytes: rendered.studentBase64,
          topicName: rendered.topicName,
          category: rendered.category,
          htmlVisibleToStudents: specInput.htmlVisibleToStudents !== false,
        },
        teacher: {
          fileName: rendered.teacherFileName,
          size: rendered.teacherSize,
          bytes: rendered.teacherBase64,
          topicId: specInput.topicId ? Number(specInput.topicId) : null,
        },
      };
      const saved = await this.putDraftSection('step2', { context: specInput.context, step2 });
      draft = saved.draft;
    }
    let outputFiles = null;
    if (specInput.outputDir) {
      const outDir = String(specInput.outputDir).trim();
      mkdirSync(outDir, { recursive: true });
      const prefix = String(specInput.filePrefix || '').trim();
      const stuName = prefix ? `${prefix}-student.html` : rendered.studentFileName;
      const teaName = prefix ? `${prefix}-teacher.html` : rendered.teacherFileName;
      const stuPath = join(outDir, stuName);
      const teaPath = join(outDir, teaName);
      const specPath = join(outDir, 'spec.json');
      writeFileSync(stuPath, rendered.studentHtml, 'utf8');
      writeFileSync(teaPath, rendered.teacherHtml, 'utf8');
      writeFileSync(specPath, JSON.stringify(specInput, null, 2), 'utf8');
      outputFiles = { student: stuPath, teacher: teaPath, spec: specPath };
    }
    return {
      version: rendered.version,
      preset: rendered.preset,
      presetName: rendered.presetName,
      category: rendered.category,
      topicName: rendered.topicName,
      studentFileName: rendered.studentFileName,
      teacherFileName: rendered.teacherFileName,
      studentSize: rendered.studentSize,
      teacherSize: rendered.teacherSize,
      studentSlideCount: rendered.studentSlideCount,
      teacherSlideCount: rendered.teacherSlideCount,
      lessonKind: rendered.lessonKind,
      missingPhonetics: rendered.missingPhonetics,
      warnings: rendered.warnings,
      savedToDraft: saveToDraft,
      draftUpdatedAt: draft?.updatedAt ?? null,
      ...(outputFiles ? { outputFiles } : {}),
    };
  }

  /** The teacher page's read-only prerequisites, in one call. */
  async bootstrap() {
    const status = await this.status();
    if (!status.loggedIn) return { status };
    try {
      const { host, token, userId } = await this.requireTeacher();
      const [classes, courses] = await Promise.all([
        listClasses(DEFAULT_HOSTS.tiku, token, userId),
        listMyCourses(host, token),
      ]);
      return { status, classes, courses };
    } catch (error) {
      return { status, error: error instanceof WeeklyError ? error.toJSON() : { message: String(error) } };
    }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/** Candidate rows may arrive under several keys depending on the route version. */
function extractCandidates(payload) {
  const list =
    payload?.candidates ??
    payload?.data?.candidates ??
    payload?.binding?.candidates ??
    payload?.available ??
    [];
  return Array.isArray(list) ? list : [];
}

const HASH_KEYS = ['hash', 'preview_hash', 'expected_preview_hash', 'previewHash'];

function findHash(payload) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of HASH_KEYS) {
    if (typeof payload[key] === 'string' && payload[key]) return payload[key];
  }
  const nested = payload.preview ?? payload.data ?? null;
  if (nested && typeof nested === 'object') return findHash(nested);
  return null;
}

function firstArray(payload, keys) {
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) if (Array.isArray(payload[key])) return payload[key];
  return [];
}

/**
 * Published bindings refuse edits, so a save against a published binding first
 * asks the contract's own withdraw action, then saves.
 */
async function putOrWithdrawFirstThenSave(host, token, { lessonId, classId, courseId, resourceTopicId, questionRefs }) {
  try {
    return await saveBindingDraft(host, token, { lessonId, classId, courseId, resourceTopicId, questionRefs });
  } catch (error) {
    if (!(error instanceof WeeklyError) || error.status !== 409) throw error;
    await changeBindingState(host, token, { lessonId, classId, courseId, action: 'withdraw' });
    return saveBindingDraft(host, token, { lessonId, classId, courseId, resourceTopicId, questionRefs });
  }
}

async function putTasks(host, token, { lessonId, classId, courseId, normalized }) {
  try {
    return await saveTaskChainDraft(host, token, { lessonId, classId, courseId, tasks: normalized });
  } catch (error) {
    if (!(error instanceof WeeklyError) || error.status !== 409) throw error;
    await changeTaskChainState(host, token, { lessonId, classId, courseId, action: 'withdraw' });
    return saveTaskChainDraft(host, token, { lessonId, classId, courseId, tasks: normalized });
  }
}

function coursewareBytesMatch(upload) {
  if (!upload || typeof upload !== 'object' || !upload.bytes || !Number.isInteger(upload.size)) return false;
  return Buffer.from(upload.bytes, 'base64').length === upload.size;
}

function coursewarePath(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return '';
  for (const key of ['path', 'localPath']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  return '';
}

function readCoursewareHtml(filePath, roleLabel) {
  const target = String(filePath || '').trim();
  if (!target) throw new WeeklyError(`${roleLabel}课件路径为空`, { code: 'COURSEWARE_PATH_INVALID' });
  let info;
  try { info = statSync(target); }
  catch { throw new WeeklyError(`找不到${roleLabel}课件文件：${target}`, { code: 'COURSEWARE_PATH_MISSING' }); }
  if (info.isDirectory()) throw new WeeklyError(`${roleLabel}课件路径是目录，请传入 HTML 文件：${target}`, { code: 'COURSEWARE_PATH_DIRECTORY' });
  if (!info.isFile()) throw new WeeklyError(`${roleLabel}课件路径不是文件：${target}`, { code: 'COURSEWARE_PATH_NOT_FILE' });
  const bytes = readFileSync(target);
  return {
    fileName: basename(target),
    contentType: 'text/html',
    size: bytes.length,
    bytes: bytes.toString('base64'),
  };
}

function materializeCoursewareSide(existing, explicitPath, roleLabel) {
  const path = explicitPath || coursewarePath(existing);
  if (coursewareBytesMatch(existing)) return existing;
  if (!path) return existing && typeof existing === 'object' ? existing : undefined;
  const read = readCoursewareHtml(path, roleLabel);
  const extra = existing && typeof existing === 'object' ? { ...existing } : {};
  delete extra.path;
  delete extra.localPath;
  delete extra.bytes;
  delete extra.size;
  delete extra.fileName;
  delete extra.contentType;
  return { ...extra, ...read };
}

function materializeStep2(step2 = {}, extras = {}) {
  const next = { ...(step2 && typeof step2 === 'object' ? step2 : {}) };
  const studentPath = extras.studentFile || next.studentFile || coursewarePath(next.student);
  const teacherPath = extras.teacherFile || next.teacherFile || coursewarePath(next.teacher);
  delete next.studentFile;
  delete next.teacherFile;
  if (studentPath || next.student) next.student = materializeCoursewareSide(next.student, studentPath, '学生版');
  if (teacherPath || next.teacher) next.teacher = materializeCoursewareSide(next.teacher, teacherPath, '教师版');
  return next;
}

/**
 * The draft stores uploads as base64 so the served page and the panel share one
 * shape. The plan only needs metadata; the runner needs bytes. This splits the
 * two and never puts bytes into the preview.
 */
function decodeUploads(step2) {
  const runtime = {};
  const shown = {};
  for (const version of ['student', 'teacher']) {
    const upload = step2[version];
    if (upload && !coursewareBytesMatch(upload)) {
      throw new WeeklyError('课件草稿里没有文件内容。请把本机 HTML 路径放在 studentFile / teacherFile，或 student.path / teacher.path，插件会读取文件。', { code: 'INCOMPLETE_UPLOAD' });
    }
  }
  if (step2.student?.bytes) {
    const bytes = Buffer.from(step2.student.bytes, 'base64');
    const meta = { ...step2.student };
    delete meta.bytes;
    shown.student = meta;
    runtime.student = { ...meta, file: { bytes: new Uint8Array(bytes), size: bytes.length, fileName: meta.fileName, contentType: meta.contentType } };
  }
  if (step2.teacher?.bytes) {
    const bytes = Buffer.from(step2.teacher.bytes, 'base64');
    const meta = { ...step2.teacher };
    delete meta.bytes;
    shown.teacher = meta;
    runtime.teacher = { ...meta, file: { bytes: new Uint8Array(bytes), fileName: meta.fileName } };
  }
  if (step2.topicPatch) shown.topicPatch = step2.topicPatch;
  return { step2: shown, runtime };
}
