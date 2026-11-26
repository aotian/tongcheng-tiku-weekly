/**
 * Paper intake, proofreading, dedup, official archival exam, and single-student
 * targeted homework workflow.
 *
 * Shared by both the teacher GUI (`/tiku-weekly`) and the DSH chat tools
 * (`tiku_weekly_paper_*`) through the exact same persisted draft store.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { bank, bind, bindingEvidence, preflight, setImages, teacherPost, upload } from './paper-bank.js';
import { DEFAULT_HOSTS, WeeklyError, requestJson } from './http.js';
import { createExam, createExamQuestions, createHomeworkV2, restBase } from './api.js';

// The commit API identifies a server draft, not a question number in the local paper.
function explainQualityGate(error, writtenRows, pending, questions) {
  if (!(error instanceof WeeklyError) || error.code !== 'question_quality_gate_failed') return;
  const issues = error.body?.issues;
  if (!Array.isArray(issues)) return;
  const byId = new Map();
  for (const row of writtenRows ?? []) {
    const question = pending[Number(row.sort_order) - 1];
    if (row.id && question) byId.set(row.id, question);
  }
  error.issues = issues.filter(item => item && typeof item === 'object').map(item => {
    const question = byId.get(item.draft_id);
    const code = String(item.code ?? '');
    const message = String(item.message ?? '');
    let field = item.field || null;
    if (!field && code.startsWith('image_')) {
      const index = question?.images?.indexOf(item.url) ?? -1;
      field = index >= 0 ? `images[${index}]` : 'images';
    } else if (!field && (code === 'primary_knowledge_required' || message.includes('target_knowledge_id'))) {
      field = 'target_knowledge_id';
    } else if (!field && code === 'question_contract_invalid') {
      if (/题目内容不能为空|题干引用/.test(message)) field = 'content';
      else if (message.startsWith('case_sensitive')) field = 'case_sensitive';
      else if (message.includes('每空至少')) field = 'question_payload.blanks / correct_option';
    }
    return { ...item, draft_id: item.draft_id ?? null, questionNumber: question ? questions.indexOf(question) + 1 : null,
      field, code, message };
  });
  const lines = error.issues.map(issue => {
    const label = issue.questionNumber ? `第 ${issue.questionNumber} 题` : `草稿 ${issue.draft_id || '未指定'}`;
    return `${label} · ${issue.field || '字段未返回'} · ${issue.message || issue.code}（${issue.code}）`;
  });
  if (lines.length) error.message += '\n' + lines.join('\n');
}

const STORAGE_ROOT = () => join(homedir(), '.dsh/storages/tiku-weekly/papers');

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VISUAL_CUE_RE = /(如图|如图所示|如上图|如下图|下图|见图|右图|左图|附图|图\s*[①②③④⑤⑥⑦⑧⑨⑩0-9一二三四五六七八九十]|统计图|折线图|柱状图|扇形图|条形图|数轴|平面直角坐标系)/;
const UNCLEAR_CUE_RE = /(\[模糊\]|\[看不清\]|\[待核对\]|\?\?\?)/;

function teacherApiHost(host) {
  return host === DEFAULT_HOSTS.teach ? DEFAULT_HOSTS.tiku : host;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function safeUserId(userId) {
  if (!userId || !/^[a-zA-Z0-9_-]+$/.test(String(userId))) {
    throw new WeeklyError('用户标识无效', { code: 'BAD_USER_ID' });
  }
  return String(userId);
}

function safeDraftId(draftId) {
  if (!draftId || !/^[a-zA-Z0-9_-]+$/.test(String(draftId))) {
    throw new WeeklyError('草稿 ID 无效', { code: 'BAD_DRAFT_ID' });
  }
  return String(draftId);
}

/** Normalize text for duplicate / similarity comparison. */
export function normalizeForDedup(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*(?:第?\s*\d+\s*题|\d+\s*[\.、．\)）]|\(\d+\))\s*/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？；：、“”‘’（）()\[\]【】,.!?;:'"`]/g, '')
    .toLowerCase();
}

/** Character bigram Dice coefficient in [0, 1]. */
export function textSimilarity(a, b) {
  const na = normalizeForDedup(a);
  const nb = normalizeForDedup(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = new Map();
  for (let i = 0; i < na.length - 1; i += 1) {
    const g = na.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < nb.length - 1; i += 1) {
    const g = nb.slice(i, i + 2);
    const count = bigrams.get(g) ?? 0;
    if (count > 0) {
      overlap += 1;
      bigrams.set(g, count - 1);
    }
  }
  return (2 * overlap) / (na.length - 1 + nb.length - 1);
}

/** Compute review flags for one draft question. */
export function computeQuestionFlags(q) {
  const flags = [];
  const answer = String(q.correct_option ?? '').trim();
  const content = String(q.content ?? '').trim();
  const images = Array.isArray(q.images) ? q.images.filter(Boolean) : [];
  if (!answer && q.type !== 'material') flags.push('missing_answer');
  if (!content || content.length < 6 || UNCLEAR_CUE_RE.test(content) || q.needsReview === true) {
    flags.push('needs_review');
  }
  if (VISUAL_CUE_RE.test(content) && images.length === 0) flags.push('missing_image');
  if (Array.isArray(q.duplicateCandidates) && q.duplicateCandidates.length > 0 && !q.reuseQuestionId) {
    flags.push('possible_duplicate');
  }
  return flags;
}

export function flagLabels(flags) {
  const map = {
    missing_answer: '待补答案',
    needs_review: '待核对',
    missing_image: '缺配图',
    possible_duplicate: '疑似重复',
  };
  return (flags ?? []).map((f) => map[f] ?? f);
}

/** Match a teacher's student name query against active class students. */
export function matchStudentsByName(students, queryName) {
  const list = Array.isArray(students) ? students : [];
  const raw = String(queryName ?? '').trim();
  if (!raw) return { status: 'unmatched', selected: null, candidates: list, queryName: '' };
  const lower = raw.toLowerCase();
  const exact = list.filter((s) => String(s.full_name ?? '').trim().toLowerCase() === lower);
  if (exact.length === 1) return { status: 'matched', selected: exact[0], candidates: exact, queryName: raw };
  if (exact.length > 1) return { status: 'ambiguous', selected: null, candidates: exact, queryName: raw };

  // Strip polite suffix like "张同学" -> "张"
  const stem = raw.replace(/(?:同学|学生)$/, '').trim().toLowerCase();
  const matched = list.filter((s) => {
    const name = String(s.full_name ?? '').trim().toLowerCase();
    const email = String(s.email ?? '').trim().toLowerCase();
    return (stem && (name.includes(stem) || name.startsWith(stem))) || name.includes(lower) || email.includes(lower);
  });
  if (matched.length === 1) return { status: 'matched', selected: matched[0], candidates: matched, queryName: raw };
  if (matched.length > 1) return { status: 'ambiguous', selected: null, candidates: matched, queryName: raw };
  return { status: 'unmatched', selected: null, candidates: list, queryName: raw };
}

/** Match draft questions against existing question bank rows (read-only). */
export function annotateDuplicates(questions, bankRows) {
  const rows = Array.isArray(bankRows) ? bankRows : [];
  const indexed = rows.map((r) => ({ id: String(r.id), content: String(r.content ?? ''), norm: normalizeForDedup(r.content) }));
  return questions.map((q) => {
    const norm = normalizeForDedup(q.content);
    let exactMatchId = null;
    const duplicateCandidates = [];
    if (norm.length >= 6) {
      for (const row of indexed) {
        if (!row.norm) continue;
        if (row.norm === norm) {
          exactMatchId = row.id;
          duplicateCandidates.push({ id: row.id, similarity: 1, contentPreview: row.content.slice(0, 100), exact: true });
        } else {
          const sim = textSimilarity(q.content, row.content);
          if (sim >= 0.65) {
            duplicateCandidates.push({ id: row.id, similarity: Number(sim.toFixed(2)), contentPreview: row.content.slice(0, 100), exact: false });
          }
        }
      }
      duplicateCandidates.sort((a, b) => b.similarity - a.similarity);
    }
    const next = {
      ...q,
      exactMatchId,
      duplicateCandidates: duplicateCandidates.slice(0, 3),
    };
    next.flags = computeQuestionFlags(next);
    return next;
  });
}

/** Normalize a parsed question into our editable paper draft question shape. */
function normalizeDraftQuestion(raw, index, pages, { pageOffset = 0, offsetRelativePage = false } = {}) {
  const pageCount = pages.length;
  const rawPageNum = raw.sourcePage ?? raw.source_page ?? raw.page;
  let sourcePage = null;
  if (rawPageNum !== undefined && rawPageNum !== null && rawPageNum !== '' && Number.isInteger(Number(rawPageNum))) {
    let parsedPage = Number(rawPageNum);
    const batchPageCount = pageCount - pageOffset;
    if (offsetRelativePage && pageOffset > 0 && parsedPage >= 1 && parsedPage <= batchPageCount) {
      parsedPage += pageOffset;
    }
    sourcePage = Math.max(1, Math.min(pageCount || 999, parsedPage));
  } else if (pageCount === 1) {
    sourcePage = 1;
  }
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  if ((raw.usePageImage || raw.attachPageImage) && sourcePage) {
    const pageObj = pages.find((p) => p.pageNo === sourcePage && p.url);
    if (pageObj?.url && !images.includes(pageObj.url)) {
      images.push(pageObj.url);
    }
  }
  const item = {
    id: raw.id && typeof raw.id === 'string' && raw.id.startsWith('pq-') ? raw.id : makeId('pq'),
    originalNo: String(raw.originalNo ?? raw.original_no ?? (index + 1)),
    sourcePage,
    sourceRegion: raw.sourceRegion ?? raw.source_region ?? (sourcePage ? `第 ${sourcePage} 页` : '未定位'),
    type: String(raw.type || 'open-ended'),
    content: String(raw.content ?? '').trim(),
    options: Array.isArray(raw.options) ? raw.options : [],
    correct_option: String(raw.correct_option ?? raw.correctOption ?? '').trim(),
    analysis: String(raw.analysis ?? '').trim(),
    score: Number.isFinite(Number(raw.score)) && Number(raw.score) > 0 ? Number(raw.score) : 10,
    difficulty: Math.min(5, Math.max(1, Number.parseInt(raw.difficulty ?? 3, 10) || 3)),
    images,
    parts: Array.isArray(raw.parts) ? raw.parts : [],
    knowledge_points: Array.isArray(raw.knowledge_points) ? raw.knowledge_points : [],
    target_knowledge_id: raw.target_knowledge_id ?? raw.targetKnowledgeId ?? null,
    needsReview: Boolean(raw.needsReview),
    reuseQuestionId: raw.reuseQuestionId ?? null,
    exactMatchId: raw.exactMatchId ?? null,
    duplicateCandidates: Array.isArray(raw.duplicateCandidates) ? raw.duplicateCandidates : [],
  };
  item.flags = computeQuestionFlags(item);
  return item;
}

/** Build multipart upload helper using Node 22 native FormData + Blob. */
async function postMultipart(url, token, buildForm, timeoutMs = 180_000) {
  const form = buildForm();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new WeeklyError(data?.error || data?.message || `上传/解析失败（HTTP ${res.status}）`, {
        status: res.status,
        code: data?.code || `HTTP_${res.status}`,
      });
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export class PaperIntakeStore {
  constructor({ rootDir } = {}) {
    this.rootDir = rootDir ?? STORAGE_ROOT();
    this.locks = new Map();
  }

  userDir(userId) {
    return join(this.rootDir, safeUserId(userId));
  }

  draftPath(userId, draftId) {
    return join(this.userDir(userId), `${safeDraftId(draftId)}.json`);
  }

  activePath(userId) {
    return join(this.userDir(userId), 'active.json');
  }

  save(userId, draft) {
    const owner = this.locks.get(userId + ':' + draft.id);
    if (owner && owner !== draft) throw new WeeklyError('草稿正在发布，请稍后重试', { code: 'IN_FLIGHT' });
    const dir = this.userDir(userId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    draft.updatedAt = nowIso();
    const target = this.draftPath(userId, draft.id);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(draft, null, 2), { mode: 0o600 });
    renameSync(tmp, target);
    const activeTmp = `${this.activePath(userId)}.tmp`;
    writeFileSync(activeTmp, JSON.stringify({ activeDraftId: draft.id, updatedAt: draft.updatedAt }), { mode: 0o600 });
    renameSync(activeTmp, this.activePath(userId));
    return draft;
  }

  load(userId, draftId) {
    const id = draftId || this.getActiveId(userId);
    if (!id) return null;
    const target = this.draftPath(userId, id);
    if (!existsSync(target)) return null;
    return JSON.parse(readFileSync(target, 'utf8'));
  }

  getActiveId(userId) {
    const p = this.activePath(userId);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8'))?.activeDraftId ?? null;
    } catch {
      return null;
    }
  }

  list(userId) {
    const dir = this.userDir(userId);
    if (!existsSync(dir)) return [];
    const activeId = this.getActiveId(userId);
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json') && name !== 'active.json')
      .map((name) => {
        try {
          const d = JSON.parse(readFileSync(join(dir, name), 'utf8'));
          return {
            id: d.id,
            title: d.title,
            revision: d.revision,
            questionCount: d.questions?.length ?? 0,
            pageCount: d.pages?.length ?? 0,
            classId: d.classId ?? null,
            className: d.className ?? null,
            studentName: d.targetStudent?.selected?.full_name ?? d.targetStudent?.queryName ?? null,
            executionStatus: d.execution?.status ?? 'draft',
            active: d.id === activeId,
            updatedAt: d.updatedAt,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
}

export class PaperIntakeService {
  /**
   * @param {object} options
   * @param {PaperIntakeStore} [options.store]
   * @param {object} [options.deps] - injectable backend calls for unit tests
   */
  constructor({ store, deps } = {}) {
    this.store = store ?? new PaperIntakeStore();
    this.deps = deps ?? {};
  }

  // ── Backend adapters (overridable in tests) ─────────────────────────────

  async bankRows(ctx, ids, allowMissing = false) {
    if (this.deps.bankRows) return this.deps.bankRows(ids);
    return (await bank(ctx, { questionIds: ids }, true, allowMissing)).questions;
  }

  async imageMetadata(ctx, url) {
    if (this.deps.imageMetadata) return this.deps.imageMetadata(url);
    return teacherPost(ctx, '/api/teacher/question-image-quality', { url });
  }

  bind(ctx, args) { return bind(this, ctx, args, textSimilarity, computeQuestionFlags); }
  setImages(ctx, args) { return setImages(this, ctx, args, computeQuestionFlags); }
  upload(ctx, args) { return upload(this, ctx, args); }
  preflight(ctx, args) { return preflight(this, ctx, this.requireDraft(ctx.userId, args.draftId)); }

  async parseDocumentRemote(host, token, { fileName, mimeType, bytes }) {
    if (this.deps.parseDocument) return this.deps.parseDocument({ fileName, mimeType, bytes });
    const url = `${teacherApiHost(host)}/api/parse-documents`;
    return postMultipart(url, token, () => {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mimeType }), fileName);
      return form;
    });
  }

  async uploadImageRemote(host, token, { fileName, mimeType, bytes }) {
    if (this.deps.uploadImage) return this.deps.uploadImage({ fileName, mimeType, bytes });
    const url = `${teacherApiHost(host)}/api/upload-image`;
    return postMultipart(url, token, () => {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mimeType }), fileName);
      form.append('folder', 'question-images');
      return form;
    });
  }

  async parseImportQuestionsRemote(host, token, payload) {
    if (this.deps.parseImportQuestions) return this.deps.parseImportQuestions(payload);
    return requestJson({
      base: teacherApiHost(host),
      pathname: '/api/teacher/import/parse',
      method: 'POST',
      token,
      body: payload,
      timeoutMs: 180_000,
    });
  }

  async listClassStudentsRemote(host, token, classId) {
    if (this.deps.listClassStudents) return this.deps.listClassStudents(classId);
    const res = await requestJson({
      base: teacherApiHost(host),
      pathname: '/api/teacher/homework-v2/class-students',
      token,
      params: { class_id: classId },
    });
    return Array.isArray(res?.students) ? res.students : [];
  }

  async listRecentBankQuestionsRemote(host, token) {
    if (this.deps.listRecentBankQuestions) return this.deps.listRecentBankQuestions();
    const ctx = { host, token };
    const first = await bank(ctx, { limit: 100 });
    if (first.count <= 100) return first.questions;
    const next = await bank(ctx, { limit: 100, page: 2 });
    return [...first.questions, ...next.questions];
  }

  async listKnowledgeNodesRemote(host, token, { keyword = '', subject = '', type = '', parentId = null, onlyWithKgCode = false, limit = 50 } = {}) {
    let rows;
    if (this.deps.listKnowledgeNodes) {
      rows = await this.deps.listKnowledgeNodes({ keyword, subject, type, parentId, onlyWithKgCode, limit });
    } else {
      const params = {
        select: 'id,parent_id,name,type,level,sort_order,is_leaf,path,metadata',
        order: 'sort_order.asc,id.asc',
        limit: 2000,
      };
      if (type) params.type = `eq.${String(type).trim()}`;
      if (parentId === 'null' || parentId === 'root') params.parent_id = 'is.null';
      else if (parentId !== null && parentId !== undefined && String(parentId).trim() !== '') params.parent_id = `eq.${String(parentId).trim()}`;
      rows = await requestJson({
        base: restBase(host),
        pathname: '/knowledge_tree',
        token,
        apikey: true,
        params,
      });
    }
    const list = Array.isArray(rows) ? rows : [];
    const kw = String(keyword || '').trim().toLowerCase();
    const subj = String(subject || '').trim().toLowerCase();
    const typeFilter = String(type || '').trim().toLowerCase();
    const capped = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));

    const normalized = list.map((row) => {
      const pathArr = Array.isArray(row.path) ? row.path.filter(Boolean).map(String) : [];
      const kgCode = row.metadata?.kg_code ?? row.kg_code ?? null;
      const fullPath = pathArr.length > 0 ? pathArr.join(' / ') : String(row.name ?? '');
      return {
        id: String(row.id),
        parentId: row.parent_id !== null && row.parent_id !== undefined ? String(row.parent_id) : null,
        name: String(row.name ?? ''),
        type: row.type ?? null,
        level: row.level ?? null,
        isLeaf: Boolean(row.is_leaf),
        path: pathArr,
        fullPath,
        kgCode: kgCode ? String(kgCode) : null,
      };
    });

    const filtered = normalized.filter((n) => {
      if (typeFilter && String(n.type ?? '').toLowerCase() !== typeFilter) return false;
      if (onlyWithKgCode && !n.kgCode) return false;
      const haystack = `${n.name} ${n.fullPath} ${n.kgCode ?? ''}`.toLowerCase();
      if (subj && !haystack.includes(subj)) return false;
      if (kw && !haystack.includes(kw)) return false;
      return true;
    });

    return {
      totalMatched: filtered.length,
      returned: Math.min(filtered.length, capped),
      nodes: filtered.slice(0, capped),
    };
  }

  async createImportJobRemote(host, token, payload) {
    if (this.deps.createImportJob) return this.deps.createImportJob(payload);
    return requestJson({
      base: teacherApiHost(host),
      pathname: '/api/teacher/import/jobs',
      method: 'POST',
      token,
      body: payload,
    });
  }

  async writeImportDraftsRemote(host, token, payload) {
    if (this.deps.writeImportDrafts) return this.deps.writeImportDrafts(payload);
    return requestJson({
      base: teacherApiHost(host),
      pathname: '/api/teacher/import/drafts',
      method: 'POST',
      token,
      body: payload,
    });
  }

  async commitImportJobRemote(host, token, payload) {
    if (this.deps.commitImportJob) return this.deps.commitImportJob(payload);
    return requestJson({
      base: teacherApiHost(host),
      pathname: '/api/teacher/import/commit',
      method: 'POST',
      token,
      body: payload,
      timeoutMs: 120_000,
    });
  }

  async createArchiveExamRemote(host, token, input, userId) {
    if (this.deps.createArchiveExam) return this.deps.createArchiveExam(input, userId);
    const exam = await createExam(host, token, { ...input, status: 'draft' }, userId);
    if (!exam?.id) throw new WeeklyError('创建留存试卷未返回 exam id', { code: 'NO_EXAM_ID' });
    return exam;
  }

  async attachExamQuestionsRemote(host, token, examId, rows) {
    if (this.deps.attachExamQuestions) return this.deps.attachExamQuestions(examId, rows);
    return createExamQuestions(host, token, examId, rows);
  }

  async createTargetedHomeworkRemote(host, token, input) {
    if (this.deps.createTargetedHomework) return this.deps.createTargetedHomework(input);
    return createHomeworkV2(host, token, input);
  }

  // ── 1. Intake & Parse (never writes official question bank) ─────────────

  async ingest({
    host,
    token,
    userId,
    title,
    subject,
    classId,
    className,
    studentName,
    dueDate,
    latePolicy,
    targetKnowledgeId,
    totalScore,
    files = [],
    textContent = '',
    questions: providedQuestions = null,
    appendToDraftId = null,
  }) {
    const hasProvidedQuestions = Array.isArray(providedQuestions) && providedQuestions.length > 0;
    if ((!Array.isArray(files) || files.length === 0) && !String(textContent || '').trim() && !hasProvidedQuestions) {
      throw new WeeklyError('请先选择 PDF 或试卷图片（支持单张/多张），或直接提供已识别的结构化题目数组', { code: 'NO_FILES' });
    }

    let existingDraft = null;
    if (appendToDraftId) {
      existingDraft = this.requireDraft(userId, appendToDraftId);
      if (existingDraft.execution?.status === 'done') {
        throw new WeeklyError('该草稿已发布，不能再追加题目，请新建草稿', { code: 'DRAFT_ALREADY_PUBLISHED', status: 409 });
      }
    }

    const pageOffset = existingDraft ? existingDraft.pages.length : 0;
    const newPages = [];
    const textParts = [];
    const warnings = [];
    let primarySourceType = 'text';

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      let bytes = null;
      const fileName = f.fileName || (f.localPath ? basename(f.localPath) : `page-${pageOffset + i + 1}.png`);
      const ext = extname(fileName).toLowerCase();
      const mimeType = f.mimeType || MIME_BY_EXT[ext] || 'application/octet-stream';

      if (f.bytesBase64) {
        bytes = Buffer.from(f.bytesBase64, 'base64');
      } else if (f.localPath) {
        if (!existsSync(f.localPath)) {
          throw new WeeklyError(`找不到本地文件：${f.localPath}`, { code: 'FILE_NOT_FOUND' });
        }
        bytes = readFileSync(f.localPath);
      } else if (f.url) {
        newPages.push({ pageNo: pageOffset + newPages.length + 1, fileName, mimeType, sourceType: 'image', url: f.url });
        primarySourceType = 'image';
        continue;
      } else {
        throw new WeeklyError(`第 ${i + 1} 个附件缺少文件内容或路径`, { code: 'EMPTY_FILE' });
      }

      if (mimeType === 'application/pdf' || ext === '.pdf' || ext === '.docx' || ext === '.txt' || ext === '.md') {
        primarySourceType = ext === '.pdf' ? 'pdf' : (ext === '.docx' ? 'word' : 'text');
        if (hasProvidedQuestions) {
          newPages.push({ pageNo: pageOffset + newPages.length + 1, fileName, mimeType, sourceType: primarySourceType, url: null, textSnippet: '' });
        } else {
          const parsed = await this.parseDocumentRemote(host, token, { fileName, mimeType, bytes });
          const d = parsed?.data ?? parsed ?? {};
          if (d.originalContent) textParts.push(String(d.originalContent));
          if (Array.isArray(d.warnings)) warnings.push(...d.warnings);
          const docImages = Array.isArray(d.images) ? d.images : [];
          if (docImages.length > 0) {
            for (const img of docImages) {
              newPages.push({
                pageNo: pageOffset + newPages.length + 1,
                fileName: `${fileName}#p${img.page || newPages.length + 1}`,
                mimeType: img.contentType || 'image/png',
                sourceType: 'pdf_page',
                url: img.url,
              });
            }
          } else {
            newPages.push({ pageNo: pageOffset + newPages.length + 1, fileName, mimeType, sourceType: primarySourceType, url: null, textSnippet: String(d.originalContent || '').slice(0, 600) });
          }
        }
      } else if (IMAGE_MIMES.has(mimeType)) {
        primarySourceType = 'image';
        const uploaded = await this.uploadImageRemote(host, token, { fileName, mimeType, bytes });
        const url = uploaded?.url || uploaded?.data?.url;
        if (!url) throw new WeeklyError(`图片 ${fileName} 上传成功但未返回 URL`, { code: 'NO_IMAGE_URL' });
        newPages.push({ pageNo: pageOffset + newPages.length + 1, fileName, mimeType, sourceType: 'image', url });
      } else {
        throw new WeeklyError(`不支持的原卷格式：${fileName}（支持 PDF、PNG/JPG/WEBP 图片、Word）`, { code: 'UNSUPPORTED_FILE' });
      }
    }

    const allPages = existingDraft ? [...existingDraft.pages, ...newPages] : newPages;
    let rawQuestions = [];

    if (hasProvidedQuestions) {
      rawQuestions = providedQuestions.filter((q) => q && typeof q === 'object' && String(q.content ?? '').trim());
      if (rawQuestions.length === 0) {
        throw new WeeklyError('直接传入的题目数组中没有包含有效题干（content）', { code: 'NO_QUESTIONS_PARSED' });
      }
    } else {
      if (String(textContent || '').trim()) textParts.push(String(textContent).trim());
      const imageUrls = newPages.map((p) => p.url).filter(Boolean);
      const contentForParse = textParts.join('\n\n').trim()
        || newPages.map((p) => `【原卷第${p.pageNo}页：${p.fileName}】${p.url || ''}`).join('\n');

      const aiParsed = await this.parseImportQuestionsRemote(host, token, {
        content: contentForParse,
        source_type: primarySourceType,
        title: title || existingDraft?.title || files[0]?.fileName?.replace(/\.[^.]+$/, '') || '原卷录入草稿',
        target_knowledge_id: targetKnowledgeId || existingDraft?.targetKnowledgeId || null,
        image_urls: imageUrls,
      });
      rawQuestions = aiParsed?.data?.questions ?? aiParsed?.questions ?? [];
      if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        throw new WeeklyError('未识别出任何题目，请检查原卷清晰度或换图重试', { code: 'NO_QUESTIONS_PARSED' });
      }
    }

    const bankRows = await this.listRecentBankQuestionsRemote(host, token);
    const questionOffset = existingDraft ? existingDraft.questions.length : 0;
    const offsetRelativePage = Boolean(existingDraft && newPages.length > 0);
    const normalized = rawQuestions.map((q, i) => normalizeDraftQuestion(q, questionOffset + i, allPages, { pageOffset, offsetRelativePage }));
    const annotatedQuestions = annotateDuplicates(normalized, bankRows);

    if (existingDraft) {
      existingDraft.pages = allPages;
      existingDraft.questions = [...existingDraft.questions, ...annotatedQuestions];
      if (warnings.length > 0) existingDraft.warnings = [...(existingDraft.warnings ?? []), ...warnings];
      if (title) existingDraft.title = String(title).trim();
      if (subject) existingDraft.subject = String(subject).trim();
      if (dueDate) existingDraft.dueDate = dueDate;
      if (latePolicy) existingDraft.latePolicy = latePolicy;
      if (targetKnowledgeId) existingDraft.targetKnowledgeId = targetKnowledgeId;
      if (classId) {
        existingDraft.classId = classId;
        if (className) existingDraft.className = className;
      }
      if ((classId || studentName) && existingDraft.classId && existingDraft.targetStudent?.status !== 'matched') {
        const students = await this.listClassStudentsRemote(host, token, existingDraft.classId);
        const qName = studentName ?? existingDraft.targetStudent?.queryName ?? '';
        existingDraft.targetStudent = qName
          ? matchStudentsByName(students, qName)
          : { queryName: '', status: 'unmatched', selected: null, candidates: students };
      }
      existingDraft.revision += 1;
      this.store.save(userId, existingDraft);
      return {
        draft: existingDraft,
        appended: true,
        appendedCount: annotatedQuestions.length,
        appendedPageCount: newPages.length,
        skippedRemoteParse: hasProvidedQuestions,
      };
    }

    let targetStudent = { queryName: String(studentName || '').trim(), status: 'unmatched', selected: null, candidates: [] };
    if (classId) {
      const students = await this.listClassStudentsRemote(host, token, classId);
      targetStudent = studentName
        ? matchStudentsByName(students, studentName)
        : { queryName: '', status: 'unmatched', selected: null, candidates: students };
    }

    const draft = {
      id: makeId('paper'),
      revision: 1,
      ...(totalScore != null ? { totalScore } : {}),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      title: String(title || files[0]?.fileName?.replace(/\.[^.]+$/, '') || '原卷录入专项练习').trim(),
      subject: String(subject || 'math').trim(),
      classId: classId || null,
      className: className || null,
      targetKnowledgeId: targetKnowledgeId || null,
      dueDate: dueDate || null,
      latePolicy: latePolicy || 'closed',
      sourceType: primarySourceType,
      warnings,
      pages: allPages,
      questions: annotatedQuestions,
      targetStudent,
      execution: {
        status: 'draft',
        importJobId: null,
        questionIdMap: {},
        examId: null,
        examQuestionsLinked: false,
        homeworkId: null,
        lastError: null,
        steps: {
          commitQuestions: { status: 'waiting' },
          archiveExam: { status: 'waiting' },
          targetedHomework: { status: 'waiting' },
        },
      },
    };
    this.store.save(userId, draft);
    return {
      draft,
      appended: false,
      appendedCount: annotatedQuestions.length,
      appendedPageCount: newPages.length,
      skippedRemoteParse: hasProvidedQuestions,
    };
  }

  // ── 2. Shared Draft Editing (Chat + GUI read/write the exact same draft) ─

  getDraft(userId, draftId) {
    const draft = this.store.load(userId, draftId);
    if (!draft) return { draft: null, drafts: this.store.list(userId) };
    return { draft, drafts: this.store.list(userId) };
  }

  requireDraft(userId, draftId) {
    const draft = this.store.load(userId, draftId);
    if (!draft) throw new WeeklyError('当前没有正在校对的原卷草稿，请先上传原卷', { code: 'NO_PAPER_DRAFT' });
    return draft;
  }

  updateMeta(userId, draftId, patch = {}) {
    const draft = this.requireDraft(userId, draftId);
    for (const key of ['title', 'totalScore', 'subject', 'classId', 'className', 'targetKnowledgeId', 'dueDate', 'latePolicy']) {
      if (patch[key] !== undefined) draft[key] = patch[key];
    }
    draft.revision += 1;
    this.store.save(userId, draft);
    return { draft };
  }

  async resolveStudent({ host, token, userId, draftId, classId, className, studentName, studentId }) {
    const draft = this.requireDraft(userId, draftId);
    const targetClassId = classId || draft.classId;
    if (!targetClassId) throw new WeeklyError('请先选择班级再匹配学生', { code: 'NO_CLASS' });
    draft.classId = targetClassId;
    if (className) draft.className = className;

    const students = await this.listClassStudentsRemote(host, token, targetClassId);
    if (studentId) {
      const found = students.find((s) => String(s.id) === String(studentId));
      if (!found) throw new WeeklyError('该学生不在当前班级有效名单中', { code: 'STUDENT_NOT_IN_CLASS' });
      draft.targetStudent = { queryName: found.full_name || studentName || '', status: 'matched', selected: found, candidates: [found] };
    } else {
      draft.targetStudent = matchStudentsByName(students, studentName ?? draft.targetStudent?.queryName ?? '');
    }
    draft.revision += 1;
    this.store.save(userId, draft);
    return { draft, targetStudent: draft.targetStudent };
  }

  reorderPages(userId, draftId, pageOrder) {
    const draft = this.requireDraft(userId, draftId);
    if (!Array.isArray(pageOrder) || pageOrder.length !== draft.pages.length) {
      throw new WeeklyError('页序数组长度必须与当前页数一致', { code: 'BAD_PAGE_ORDER' });
    }
    const byOldNo = new Map(draft.pages.map((p) => [p.pageNo, p]));
    const nextPages = [];
    const oldToNew = new Map();
    pageOrder.forEach((oldNo, idx) => {
      const p = byOldNo.get(Number(oldNo));
      if (!p) throw new WeeklyError(`页码 ${oldNo} 不存在`, { code: 'BAD_PAGE_NO' });
      const newNo = idx + 1;
      oldToNew.set(p.pageNo, newNo);
      nextPages.push({ ...p, pageNo: newNo });
    });
    draft.pages = nextPages;
    draft.questions = draft.questions.map((q) => (
      q.sourcePage && oldToNew.has(q.sourcePage)
        ? { ...q, sourcePage: oldToNew.get(q.sourcePage), sourceRegion: `第 ${oldToNew.get(q.sourcePage)} 页` }
        : q
    ));
    draft.revision += 1;
    this.store.save(userId, draft);
    return { draft };
  }

  findQuestionIndex(draft, { questionId, questionNumber }) {
    if (questionId) {
      const idx = draft.questions.findIndex((q) => q.id === questionId);
      if (idx >= 0) return idx;
    }
    if (questionNumber !== undefined && questionNumber !== null) {
      const num = Number(questionNumber);
      if (Number.isInteger(num) && num >= 1 && num <= draft.questions.length) return num - 1;
      const byOrig = draft.questions.findIndex((q) => String(q.originalNo) === String(questionNumber));
      if (byOrig >= 0) return byOrig;
    }
    throw new WeeklyError('未找到指定题号的草稿题目', { code: 'QUESTION_NOT_FOUND' });
  }

  async editVerified(ctx, args) {
    const { draftId, questionId, questionNumber, patch, confirmLowConfidence } = args;
    if (patch?.reuseQuestionId) {
      const draft = this.requireDraft(ctx.userId, draftId);
      const index = this.findQuestionIndex(draft, { questionId, questionNumber });
      const [row] = await this.bankRows(ctx, [patch.reuseQuestionId]);
      if (!row) throw new WeeklyError('正式题不存在', { code: 'BANK_NOT_FOUND' });
      const match = bindingEvidence({ ...draft.questions[index], ...patch }, row, index + 1, draft.targetKnowledgeId, textSimilarity);
      if (match.confidence === 'low' && confirmLowConfidence !== true) {
        const error = new WeeklyError('题库匹配置信度较低，请核对后确认', { code: 'BIND_CONFIDENCE_LOW' });
        error.issues = [match];
        throw error;
      }
      const current = this.requireDraft(ctx.userId, draft.id);
      if (current.revision !== draft.revision || current.execution.examId || Object.keys(current.execution.questionIdMap || {}).length) throw new WeeklyError('草稿已变更或已提交');
      return this.editQuestion(ctx.userId, draft.id, args);
    }
    return this.editQuestion(ctx.userId, draftId, args);
  }

  editQuestion(userId, draftId, { questionId, questionNumber, patch = {} }) {
    const draft = this.requireDraft(userId, draftId);
    const idx = this.findQuestionIndex(draft, { questionId, questionNumber });
    const current = draft.questions[idx];
    const next = {
      ...current,
      ...(patch.originalNo !== undefined ? { originalNo: String(patch.originalNo) } : {}),
      ...(patch.type !== undefined ? { type: String(patch.type) } : {}),
      ...(patch.content !== undefined ? { content: String(patch.content) } : {}),
      ...(patch.options !== undefined ? { options: Array.isArray(patch.options) ? patch.options : current.options } : {}),
      ...(patch.correct_option !== undefined ? { correct_option: String(patch.correct_option) } : {}),
      ...(patch.analysis !== undefined ? { analysis: String(patch.analysis) } : {}),
      ...(patch.score !== undefined ? { score: Number(patch.score) || current.score } : {}),
      ...(patch.images !== undefined ? { images: Array.isArray(patch.images) ? patch.images.filter(Boolean) : current.images } : {}),
      ...(patch.parts !== undefined ? { parts: Array.isArray(patch.parts) ? patch.parts : current.parts } : {}),
      ...(patch.sourcePage !== undefined ? { sourcePage: patch.sourcePage ? Number(patch.sourcePage) : null } : {}),
      ...(patch.reuseQuestionId !== undefined ? { reuseQuestionId: patch.reuseQuestionId || null } : {}),
      ...(patch.target_knowledge_id !== undefined || patch.targetKnowledgeId !== undefined
        ? { target_knowledge_id: (patch.target_knowledge_id ?? patch.targetKnowledgeId) || null }
        : {}),
      needsReview: patch.needsReview !== undefined ? Boolean(patch.needsReview) : false,
    };
    next.flags = computeQuestionFlags(next);
    if (JSON.stringify(current) === JSON.stringify(next)) return { draft, question: current, index: idx + 1 };
    draft.questions[idx] = next;
    draft.revision += 1;
    this.store.save(userId, draft);
    return { draft, question: next, index: idx + 1 };
  }

  splitQuestion(userId, draftId, { questionId, questionNumber, splitIndex, secondContent }) {
    const draft = this.requireDraft(userId, draftId);
    const idx = this.findQuestionIndex(draft, { questionId, questionNumber });
    const src = draft.questions[idx];
    let firstText = src.content;
    let secondText = String(secondContent ?? '').trim();
    if (!secondText) {
      const pos = Number.isInteger(Number(splitIndex)) ? Number(splitIndex) : Math.floor(src.content.length / 2);
      if (pos <= 0 || pos >= src.content.length) {
        throw new WeeklyError('拆分位置无效，请提供拆分后的第二题题干或有效字符位置', { code: 'BAD_SPLIT' });
      }
      firstText = src.content.slice(0, pos).trim();
      secondText = src.content.slice(pos).trim();
    } else if (src.content.includes(secondText)) {
      firstText = src.content.replace(secondText, '').trim();
    }
    const q1 = { ...src, content: firstText, reuseQuestionId: null };
    q1.flags = computeQuestionFlags(q1);
    const q2 = normalizeDraftQuestion({
      originalNo: `${src.originalNo}-2`,
      sourcePage: src.sourcePage,
      sourceRegion: src.sourceRegion,
      type: src.type,
      content: secondText,
      score: src.score,
      difficulty: src.difficulty,
      images: [],
    }, idx + 1, draft.pages);
    draft.questions.splice(idx, 1, q1, q2);
    draft.revision += 1;
    this.store.save(userId, draft);
    return { draft, splitInto: [q1, q2] };
  }

  mergeQuestions(userId, draftId, { firstNumber, secondNumber }) {
    const draft = this.requireDraft(userId, draftId);
    const i1 = this.findQuestionIndex(draft, { questionNumber: firstNumber });
    const i2 = this.findQuestionIndex(draft, { questionNumber: secondNumber });
    if (i1 === i2) throw new WeeklyError('不能将同一道题与自身合并', { code: 'SAME_QUESTION' });
    const [low, high] = i1 < i2 ? [i1, i2] : [i2, i1];
    const q1 = draft.questions[low];
    const q2 = draft.questions[high];
    const merged = {
      ...q1,
      content: `${q1.content}\n${q2.content}`.trim(),
      options: q1.options?.length ? q1.options : (q2.options ?? []),
      correct_option: [q1.correct_option, q2.correct_option].filter(Boolean).join('；'),
      analysis: [q1.analysis, q2.analysis].filter(Boolean).join('\n'),
      images: [...new Set([...(q1.images ?? []), ...(q2.images ?? [])])],
      parts: [...(q1.parts ?? []), ...(q2.parts ?? [])],
      score: Number(q1.score || 0) + Number(q2.score || 0),
      reuseQuestionId: null,
    };
    merged.flags = computeQuestionFlags(merged);
    draft.questions.splice(high, 1);
    draft.questions[low] = merged;
    draft.revision += 1;
    this.store.save(userId, draft);
    return { draft, merged };
  }

  reorderQuestions(userId, draftId, orderedIds) {
    const draft = this.requireDraft(userId, draftId);
    if (!Array.isArray(orderedIds) || orderedIds.length !== draft.questions.length) {
      throw new WeeklyError('题序数组长度必须与当前题目数量一致', { code: 'BAD_ORDER' });
    }
    const byId = new Map(draft.questions.map((q) => [q.id, q]));
    const next = orderedIds.map((id) => {
      const q = byId.get(id);
      if (!q) throw new WeeklyError(`题序中包含未知题目 ID：${id}`, { code: 'UNKNOWN_QUESTION' });
      return q;
    });
    draft.questions = next;
    draft.revision += 1;
    this.store.save(userId, draft);
    return { draft };
  }

  // ── 3. Preview & Idempotent Resumable Execution ─────────────────────────

  previewPublish(userId, draftId) {
    const draft = this.requireDraft(userId, draftId);
    const blocked = [];
    const warnings = [];

    if (!draft.title?.trim()) blocked.push('缺少试卷/作业标题');
    if (!draft.questions?.length) blocked.push('题单为空，无法入库或发布');
    if (!draft.classId) blocked.push('尚未选择目标班级');
    if (!draft.dueDate) blocked.push('尚未设置作业截止时间');

    if (draft.targetStudent?.status === 'ambiguous') {
      blocked.push(`班级内存在重名学生「${draft.targetStudent.queryName}」，请先在候选名单中明确选择 1 人`);
    } else if (draft.targetStudent?.status !== 'matched' || !draft.targetStudent?.selected?.id) {
      blocked.push('尚未精确匹配到唯一的目标接收学生');
    }

    const newQuestions = draft.questions.filter((q) => !q.reuseQuestionId && !draft.execution.questionIdMap[q.id]);
    const missingKnowledge = newQuestions.filter((q) => !q.target_knowledge_id && !draft.targetKnowledgeId);
    if (missingKnowledge.length > 0) {
      blocked.push('新建题目入库前需指定题库章节/知识点 ID（targetKnowledgeId）；可先调用 tiku_weekly_knowledge_nodes 查询系统知识树节点自动匹配');
    }

    const needReviewCount = draft.questions.filter((q) => (q.flags ?? []).length > 0).length;
    if (needReviewCount > 0) {
      warnings.push(`有 ${needReviewCount} 道题存在「待补答案 / 待核对 / 缺配图 / 疑似重复」标记，建议确认后再发`);
    }

    const reusedCount = draft.questions.filter((q) => Boolean(q.reuseQuestionId)).length;
    const totalScore = draft.questions.reduce((sum, q) => sum + Number(q.score || 10), 0);

    return {
      draftId: draft.id,
      revision: draft.revision,
      blocked,
      warnings,
      summary: {
        paperTitle: draft.title,
        questionCount: draft.questions.length,
        newQuestionCount: draft.questions.length - reusedCount,
        reusedQuestionCount: reusedCount,
        totalScore,
        classId: draft.classId,
        className: draft.className || draft.classId,
        studentId: draft.targetStudent?.selected?.id ?? null,
        studentName: draft.targetStudent?.selected?.full_name ?? draft.targetStudent?.queryName ?? null,
        recipientCount: draft.targetStudent?.selected?.id ? 1 : 0,
        recipientLabel: draft.targetStudent?.selected?.id ? '接收人数：1' : '接收人数：0（未匹配）',
        dueDate: draft.dueDate,
        deliveryPolicy: '正式试卷仅作草稿留存（is_published=false），学生端只收到 1 份定向作业，不重复发考试。',
      },
      steps: [
        {
          id: 'commitQuestions',
          title: '新题入库（跳过已复用与已入库题目）',
          status: draft.execution.steps.commitQuestions?.status ?? 'waiting',
          willSkip: newQuestions.length === 0,
        },
        {
          id: 'archiveExam',
          title: '创建正式留存试卷（仅存档，不向学生发布）',
          status: draft.execution.steps.archiveExam?.status ?? 'waiting',
          willSkip: Boolean(draft.execution.examId && draft.execution.examQuestionsLinked),
        },
        {
          id: 'targetedHomework',
          title: `定向发布作业给 1 名学生（${draft.targetStudent?.selected?.full_name ?? '待选'}）`,
          status: draft.execution.steps.targetedHomework?.status ?? 'waiting',
          willSkip: Boolean(draft.execution.homeworkId),
        },
      ],
    };
  }

  /**
   * Execute commit -> archive exam -> single-student targeted homework.
   * Safe against double-click and partial failure retries: every step persists
   * its real remote ID immediately and is skipped on subsequent retries.
   */
  async executePublish({ host, token, userId, draftId }) {
    const draft = this.requireDraft(userId, draftId);
    const lockKey = `${userId}:${draft.id}`;
    if (this.store.locks.has(lockKey)) {
      throw new WeeklyError('正在执行发布，请勿重复点击确认', { code: 'IN_FLIGHT', status: 409 });
    }

    // Already completely published: idempotent return, never create a 2nd homework.
    if (draft.execution.status === 'done' && draft.execution.homeworkId) {
      return {
        reusedQuestionCount: draft.questions.filter(q => q.reuseQuestionId).length,
        newQuestionCount: draft.questions.filter(q => !q.reuseQuestionId).length,
        idempotent: true,
        alreadyPublished: true,
        draft,
        examId: draft.execution.examId,
        homeworkId: draft.execution.homeworkId,
        questionIds: draft.questions.map((q) => q.reuseQuestionId || draft.execution.questionIdMap[q.id]),
      };
    }

    this.store.locks.set(lockKey, draft);
    try {
      const check = await preflight(this, { host, token }, draft);
      if (!check.ok) {
        const error = new WeeklyError('提交前预检未通过', { code: 'PREFLIGHT_BLOCKED' });
        error.issues = check.errors;
        throw error;
      }
      if (this.requireDraft(userId, draft.id).revision !== draft.revision) throw new WeeklyError('预检期间草稿发生变更，请重新确认');
      const preview = this.previewPublish(userId, draft.id);
      if (preview.blocked.length > 0) {
        throw new WeeklyError(`尚有未完成项：${preview.blocked.join('；')}`, { code: 'BLOCKED', status: 400 });
      }

      const exec = draft.execution;
      exec.lastError = null;

      // Step 1: Commit new questions (idempotent per draft item)
      const pendingNew = draft.questions.filter((q) => !q.reuseQuestionId && !exec.questionIdMap[q.id]);
      if (pendingNew.length > 0) {
        exec.steps.commitQuestions = { status: 'running' };
        this.store.save(userId, draft);
        try {
          const fallbackKnowledgeId = draft.targetKnowledgeId || pendingNew.find((q) => q.target_knowledge_id)?.target_knowledge_id || null;
          if (!exec.importJobId) {
            const jobRes = await this.createImportJobRemote(host, token, {
              title: draft.title,
              source_type: draft.sourceType || 'pdf',
              target_knowledge_id: fallbackKnowledgeId,
              status: 'reviewing',
            });
            const jobId = jobRes?.data?.id ?? jobRes?.id;
            if (!jobId) throw new WeeklyError('创建导入任务未返回 job_id', { code: 'NO_JOB_ID' });
            exec.importJobId = jobId;
            this.store.save(userId, draft);
          }

          const written = await this.writeImportDraftsRemote(host, token, {
            job_id: exec.importJobId,
            replace: true,
            drafts: pendingNew.map((q, idx) => ({
              sort_order: idx + 1,
              status: 'approved',
              target_knowledge_id: q.target_knowledge_id || fallbackKnowledgeId,
              type: q.type === 'fill-in-blank' ? 'blank' : q.type,
              content: q.content,
              options: q.options,
              correct_option: q.correct_option,
              analysis: q.analysis,
              difficulty: q.difficulty,
              score: q.score,
              images: q.images,
              knowledge_points: q.knowledge_points,
              parts: q.parts,
            })),
          });

          let commitRes;
          try {
            commitRes = await this.commitImportJobRemote(host, token, {
              job_id: exec.importJobId,
              commit_type: 'questions',
            });
          } catch (error) {
            explainQualityGate(error, Array.isArray(written?.data) ? written.data : [], pendingNew, draft.questions);
            throw error;
          }
          const committedIds = commitRes?.data?.question_ids ?? commitRes?.question_ids ?? [];
          if (committedIds.length !== pendingNew.length) {
            throw new WeeklyError(`题目入库数量不匹配：预期 ${pendingNew.length}，实际 ${committedIds.length}`, { code: 'COMMIT_COUNT_MISMATCH' });
          }
          pendingNew.forEach((q, idx) => {
            exec.questionIdMap[q.id] = committedIds[idx];
          });
          exec.steps.commitQuestions = { status: 'ok', inserted: committedIds.length };
          this.store.save(userId, draft);
        } catch (error) {
          exec.status = 'partial';
          exec.lastError = error?.message ?? String(error);
          exec.steps.commitQuestions = { status: 'failed', error: exec.lastError };
          this.store.save(userId, draft);
          throw error;
        }
      } else {
        exec.steps.commitQuestions = { status: 'ok', skipped: true };
      }

      // Resolve ordered official question IDs (preserving exact original paper order)
      const orderedItems = draft.questions.map((q, idx) => {
        const realId = q.reuseQuestionId || exec.questionIdMap[q.id];
        if (!realId) throw new WeeklyError(`第 ${idx + 1} 题缺少正式题目 ID`, { code: 'MISSING_REAL_QUESTION_ID' });
        return {
          draftQuestionId: q.id,
          questionId: realId,
          score: Number(q.score || 10),
          orderIndex: idx,
          sortOrder: idx + 1,
        };
      });

      // Step 2: Create official archival exam (draft / unpublished so student never receives duplicate exam)
      if (!exec.examId || !exec.examQuestionsLinked) {
        exec.steps.archiveExam = { status: 'running' };
        this.store.save(userId, draft);
        try {
          if (!exec.examId) {
            const exam = await this.createArchiveExamRemote(host, token, {
              title: draft.title,
              description: `原卷录入存档（定向作业专用，仅教师留存）`,
              classId: draft.classId,
              timeLimit: 60,
              passScore: Math.round(orderedItems.reduce((s, i) => s + i.score, 0) * 0.6),
              showAnalysis: true,
              status: 'draft',
              dueDate: draft.dueDate,
              publishType: 'targeted',
              assignedTo: [draft.targetStudent.selected.id],
              items: orderedItems.map((i) => ({ questionId: i.questionId, score: i.score, sortOrder: i.sortOrder })),
            }, userId);
            exec.examId = exam.id;
            this.store.save(userId, draft);
          }
          if (!exec.examQuestionsLinked) {
            await this.attachExamQuestionsRemote(
              host,
              token,
              exec.examId,
              orderedItems.map((i) => ({ problem_id: i.questionId, score: i.score, sort_order: i.sortOrder })),
            );
            exec.examQuestionsLinked = true;
            this.store.save(userId, draft);
          }
          exec.steps.archiveExam = { status: 'ok', examId: exec.examId };
          this.store.save(userId, draft);
        } catch (error) {
          exec.status = 'partial';
          exec.lastError = error?.message ?? String(error);
          exec.steps.archiveExam = { status: 'failed', error: exec.lastError };
          this.store.save(userId, draft);
          throw error;
        }
      }

      // Step 3: Publish single-student targeted homework in exact same question order
      if (!exec.homeworkId) {
        exec.steps.targetedHomework = { status: 'running' };
        this.store.save(userId, draft);
        try {
          const hwRes = await this.createTargetedHomeworkRemote(host, token, {
            title: draft.title,
            classId: draft.classId,
            subject: draft.subject || 'math',
            description: `依据正式留存试卷（ID: ${exec.examId}）定向布置`,
            dueDate: draft.dueDate,
            status: 'published',
            publishType: 'targeted',
            assignedTo: [draft.targetStudent.selected.id],
            latePolicy: draft.latePolicy || 'closed',
            lateUntil: null,
            latePenaltyPercent: 0,
            items: orderedItems.map((i) => ({
              itemType: 'question',
              questionId: i.questionId,
              score: i.score,
              orderIndex: i.orderIndex,
              isRequired: true,
            })),
          });
          const homeworkId = hwRes?.homework_id ?? hwRes?.data?.id ?? hwRes?.id;
          if (!homeworkId) throw new WeeklyError('定向作业创建成功但未返回 homework_id', { code: 'NO_HOMEWORK_ID' });
          exec.homeworkId = homeworkId;
          exec.steps.targetedHomework = {
            status: 'ok',
            homeworkId,
            recipientCount: 1,
            studentId: draft.targetStudent.selected.id,
          };
          exec.status = 'done';
          this.store.save(userId, draft);
        } catch (error) {
          exec.status = 'partial';
          exec.lastError = error?.message ?? String(error);
          exec.steps.targetedHomework = { status: 'failed', error: exec.lastError };
          this.store.save(userId, draft);
          throw error;
        }
      }

      return {
        reusedQuestionCount: check.reusedCount,
        newQuestionCount: check.newCount,
        idempotent: false,
        alreadyPublished: false,
        draft,
        examId: exec.examId,
        homeworkId: exec.homeworkId,
        questionIds: orderedItems.map((i) => i.questionId),
        recipientCount: 1,
        student: draft.targetStudent.selected,
      };
    } finally {
      this.store.locks.delete(lockKey);
    }
  }
}
