/**
 * HTTP layer for the weekly-course plugin.
 *
 * Two hard rules, both enforced here rather than left to callers:
 *
 * 1. Every Supabase/PostgREST request goes through the same-origin reverse
 *    proxy `{host}/sb/...`. No `*.supabase.co` origin is ever addressed.
 * 2. Every request carries the signed-in teacher's JWT as `Authorization`.
 *    The anon key travels as `apikey` only, because it is what selects the
 *    PostgREST role; RLS still evaluates as the signed-in user. The service
 *    role key is never used.
 */

/** Public anon key: identifies the project and selects the `anon` role. RLS still applies. */
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuaHZma3JteHJ4Y2hyb2FnbWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMDA2OTAsImV4cCI6MjA4Mzc3NjY5MH0.5dowI6gBQUzmHbxEemZ2QKhtkk5WoAIMTpftms-O1x0';

export const DEFAULT_HOSTS = {
  tiku: 'https://tiku.tongchengweilai.com',
  teach: 'https://teach.tongchengweilai.com',
};

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

/** A failure that carries a Chinese explanation, the HTTP status, and the safe endpoint. */
export class WeeklyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'WeeklyError';
    this.status = details.status ?? null;
    this.code = details.code ?? null;
    this.endpoint = details.endpoint ?? null;
    this.body = details.body ?? null;
    this.fix = details.fix ?? null;
  }
  /** A stable, JSON-safe shape for tool results and HTTP responses. */
  toJSON() {
    return {
      message: this.message,
      status: this.status,
      code: this.code,
      endpoint: this.endpoint,
      fix: this.fix,
      ...(this.issues?.length ? { issues: this.issues } : {}),
    };
  }
}

/** Map the error codes the contract names to a fix a teacher can act on. */
function fixHint(status, body) {
  const code = String(body?.code ?? body?.error_code ?? '');
  const message = String(body?.message ?? body?.error?.message ?? '');
  if (status === 409 || code === '23502' || /school_id/.test(message)) {
    return '当前教师账号还没有配置默认学校（quiz_school_members.school_id），请管理员在教师管理里为这个账号补上默认学校后再发布。';
  }
  if (status === 401 || code === 'invalid_token' || code === 'PGRST301') {
    return '登录已过期，请在顶部重新登录童澄账号。';
  }
  if (status === 403 || code === '42501' || /permission denied/.test(message)) {
    return '这个账号没有该操作的权限：班级必须归属当前老师且未过期，题目与作业需在可写范围内。';
  }
  if (status === 404) {
    return '目标不存在或已被删除，请刷新班级/课程列表后重试。';
  }
  if (status === 413) {
    return '文件超过服务端限制，请压缩后重传。';
  }
  if (status >= 500) {
    return '童澄服务端异常，稍后可在看板上点「单步重试」。';
  }
  return null;
}

function backendMessage(payload) {
  return (
    payload?.error?.message ??
    payload?.message ??
    payload?.error_description ??
    payload?.error ??
    payload?.detail ??
    (typeof payload === 'string' ? payload.slice(0, 300) : undefined)
  );
}

function safeEndpoint(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url);
  }
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function toError(response, payload, url) {
  const status = response.status;
  const message = backendMessage(payload);
  return new WeeklyError(
    message ? String(message) : `请求失败（HTTP ${status}）`,
    {
      status,
      code: payload?.code ?? payload?.error_code ?? null,
      endpoint: safeEndpoint(url),
      body: payload ?? null,
      fix: fixHint(status, payload),
    },
  );
}

/** Build a URL under one of the fixed hosts. `sbBase` marks the `/sb` proxy prefix. */
export function buildUrl(base, pathname, params) {
  const url = new URL(`${String(base).replace(/\/+$/, '')}${pathname}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * JSON request against the Tongcheng API or PostgREST.
 *
 * @param options.base - absolute base, e.g. `https://teach.../sb`
 * @param options.pathname - path under that base
 * @param options.method - HTTP method
 * @param options.token - the teacher's access token (required)
 * @param options.body - JSON body
 * @param options.apikey - send the anon key as `apikey` (PostgREST only)
 */
export async function requestJson(options) {
  const {
    base, pathname, method = 'GET', token, body, params, apikey = false, headers = {},
    prefer, timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  if (!token) throw new WeeklyError('尚未登录童澄账号，请先在顶部登录', { code: 'NO_SESSION' });

  const url = buildUrl(base, pathname, params);
  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...headers,
  };
  if (apikey) requestHeaders.apikey = SUPABASE_ANON_KEY;
  if (prefer) requestHeaders.Prefer = prefer;

  let payloadText;
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    payloadText = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: payloadText,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? '请求超时' : error?.message ?? '网络错误';
    throw new WeeklyError(`无法连接童澄服务：${reason}`, {
      code: 'NETWORK',
      endpoint: safeEndpoint(url),
    });
  }

  const payload = await readBody(response);
  if (!response.ok) throw toError(response, payload, url);
  return payload;
}

/**
 * Exchange an account and password for a Supabase session.
 *
 * The password is used only in this request body. It is never stored, logged,
 * or echoed back.
 */
export async function passwordSignIn(host, account, password) {
  const base = host.replace(/\/+$/, '');
  const raw = String(account ?? '').trim();
  if (!raw || !password) throw new WeeklyError('账号和密码都不能为空');
  const candidates = raw.includes('@') ? [raw] : [`${raw}@tongcheng.internal`, raw];

  let lastError = null;
  for (const email of candidates) {
    let response;
    try {
      response = await fetch(`${base}/sb/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = new WeeklyError(`无法连接童澄登录服务：${error?.message ?? '网络错误'}`, {
        code: 'NETWORK',
        endpoint: `${base}/sb/auth/v1/token`,
      });
      continue;
    }
    const payload = await readBody(response);
    if (response.ok && payload?.access_token) {
      return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token ?? null,
        expiresAt: payload.expires_at ?? null,
        email: payload.user?.email ?? email,
        userId: payload.user?.id ?? null,
      };
    }
    lastError = new WeeklyError('账号或密码错误', {
      status: response.status,
      code: payload?.error_code ?? payload?.code ?? null,
      endpoint: `${base}/sb/auth/v1/token`,
      fix: '请确认账号是教师账号，或改用完整邮箱登录。',
    });
    if (response.status !== 400 && response.status !== 401) break;
  }
  throw lastError ?? new WeeklyError('账号或密码错误');
}

/** Trade a refresh token for a fresh session. */
export async function refreshSignIn(host, refreshToken) {
  const base = host.replace(/\/+$/, '');
  let response;
  try {
    response = await fetch(`${base}/sb/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WeeklyError(`刷新登录失败：${error?.message ?? '网络错误'}`, { code: 'NETWORK' });
  }
  const payload = await readBody(response);
  if (!response.ok || !payload?.access_token) {
    throw new WeeklyError('登录已过期，请重新登录', {
      status: response.status,
      code: 'REFRESH_FAILED',
      fix: '刷新令牌也已失效，请在顶部重新输入账号密码。',
    });
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: payload.expires_at ?? null,
    email: payload.user?.email ?? null,
    userId: payload.user?.id ?? null,
  };
}

/**
 * Sign a browser-side OSS upload for a student-visible course asset.
 *
 * Returns the signed PostObject form; the caller posts `fields` first and
 * `file` last, then uses `public_url` when writing `topics`.
 */
export async function signCourseAsset(base, token, file) {
  const signature = await requestJson({
    base,
    pathname: '/api/upload/sign',
    method: 'POST',
    token,
    body: {
      purpose: 'course-asset',
      fileName: file.fileName,
      contentType: file.contentType ?? 'application/octet-stream',
      size: file.size,
    },
  });
  if (!signature?.url || !signature?.fields) {
    throw new WeeklyError('上传签名返回格式异常：缺少 url 或 fields', { code: 'SIGN_BAD_SHAPE' });
  }
  return signature;
}

/** Upload bytes through the signed PostObject form. `fields` first, `file` last. */
export async function postSignedObject(signature, file) {
  const form = new FormData();
  for (const [key, value] of Object.entries(signature.fields)) form.append(key, String(value));
  const blob = new Blob([file.bytes], { type: file.contentType ?? 'application/octet-stream' });
  form.append('file', blob, file.fileName);

  let response;
  try {
    response = await fetch(signature.url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WeeklyError(`课件上传到 OSS 失败：${error?.message ?? '网络错误'}`, {
      code: 'UPLOAD_NETWORK',
      endpoint: signature.url,
    });
  }
  if (!response.ok) {
    const payload = await readBody(response);
    throw new WeeklyError(`课件上传到 OSS 失败（HTTP ${response.status}）`, {
      status: response.status,
      code: 'UPLOAD_HTTP',
      endpoint: signature.url,
      body: payload,
      fix: '签名可能已过期，请重新选择文件后重试。',
    });
  }
  return { ok: true, publicUrl: signature.public_url ?? signature.publicUrl ?? null };
}
