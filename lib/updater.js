import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const NAME = 'tongcheng-tiku-weekly';
const REPO = 'https://gitee.com/35084032/tongcheng-tiku-weekly';
const SOURCES = [
  [REPO + '/raw/main/package.json', REPO + '/repository/archive/main.zip'],
  ['https://raw.githubusercontent.com/aotian/tongcheng-tiku-weekly/main/package.json',
   'https://codeload.github.com/aotian/tongcheng-tiku-weekly/zip/refs/heads/main'],
];
const LIMIT = 32 * 1024 * 1024;
const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const BLOCKED = '开发目录、链接安装或未识别的安装位置不能自动覆盖，请使用 Gitee 地址手动更新。';

function parseVersion(version) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/.exec(version);
  if (!m || [m[4], m[5]].some(part => part && !part.split('.').every(id => /^[a-zA-Z0-9-]+$/.test(id))) ||
      m[4]?.split('.').some(id => /^0\d+$/.test(id))) throw new Error('无效的插件版本号');
  return { core: m.slice(1, 4).map(BigInt), pre: m[4]?.split('.') };
}

export function compareVersions(a, b) {
  const left = parseVersion(a), right = parseVersion(b);
  const cmp = (x, y) => x < y ? -1 : x > y ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    const diff = cmp(left.core[i], right.core[i]);
    if (diff) return diff;
  }
  if (!left.pre || !right.pre) return Number(!left.pre) - Number(!right.pre);
  for (let i = 0; i < Math.min(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return cmp(BigInt(x), BigInt(y));
    return xn === yn ? cmp(x, y) : xn ? -1 : 1;
  }
  return cmp(left.pre.length, right.pre.length);
}

function manifest(bytes) {
  const pkg = JSON.parse(bytes);
  if (pkg.name !== NAME) throw new Error('安装包名称与插件不匹配');
  parseVersion(pkg.version);
  return pkg;
}

async function readRemote(url, limit, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) throw new Error('下载超过大小限制');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

async function mirrored(read) {
  const errors = [];
  for (const source of SOURCES) {
    try { return await read(source); }
    catch (e) { errors.push(e.message); }
  }
  throw new Error('Gitee 和 GitHub 更新源均未成功：' + errors.join(' / '));
}

const checksumTable = Uint32Array.from({length: 256}, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value;
});
function crc32(bytes) {
  let sum = 0xffffffff;
  for (const byte of bytes) sum = checksumTable[(sum ^ byte) & 255] ^ (sum >>> 8);
  return (~sum) >>> 0;
}

// Repository archives have one wrapper folder. Decode into memory before any
// filesystem write; only regular files from the runtime package are installed.
export function unpackZip(zip) {
  let end = zip.length - 22;
  for (; end >= Math.max(0, zip.length - 65557); end--) {
    if (zip.readUInt32LE(end) === 0x06054b50 && end + 22 + zip.readUInt16LE(end + 20) === zip.length) break;
  }
  if (end < Math.max(0, zip.length - 65557)) throw new Error('ZIP 尾部无效');
  const count = zip.readUInt16LE(end + 10);
  let pos = zip.readUInt32LE(end + 16);
  const central = pos;
  if (!count || count > 4096 || zip.readUInt32LE(end + 4) || count !== zip.readUInt16LE(end + 8) ||
      pos + zip.readUInt32LE(end + 12) !== end) throw new Error('不支持此 ZIP 格式');
  const files = new Map(), names = new Set();
  let wrapper, total = 0;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > end || zip.readUInt32LE(pos) !== 0x02014b50) throw new Error('ZIP 目录损坏');
    const flags = zip.readUInt16LE(pos + 8), method = zip.readUInt16LE(pos + 10);
    const crc = zip.readUInt32LE(pos + 16), packed = zip.readUInt32LE(pos + 20), size = zip.readUInt32LE(pos + 24);
    const local = zip.readUInt32LE(pos + 42), nameLen = zip.readUInt16LE(pos + 28);
    const name = zip.subarray(pos + 46, pos + 46 + nameLen);
    const type = (zip.readUInt32LE(pos + 38) >>> 16) & 0xf000;
    pos += 46 + nameLen + zip.readUInt16LE(pos + 30) + zip.readUInt16LE(pos + 32);
    const entry = new TextDecoder('utf-8', {fatal:true}).decode(name);
    const dir = entry.endsWith('/');
    const parts = (dir ? entry.slice(0, -1) : entry).split('/');
    if (parts.some(p => !p || /[. ]$|[\\:*?"<>|\x00-\x1f]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) throw new Error('ZIP 路径不安全');
    wrapper ??= parts[0];
    if (parts[0] !== wrapper || (!dir && parts.length < 2) || (type && type !== (dir ? 0x4000 : 0x8000))) throw new Error('ZIP 目录结构或条目类型无效');
    const key = parts.slice(1).join('/');
    const folded = key.normalize('NFC').toLowerCase();
    if (names.has(folded)) throw new Error('ZIP 路径重复');
    names.add(folded);
    total += size;
    if (pos > end || total > LIMIT || flags & 1 || ![0, 8].includes(method) || local + 30 > central ||
        zip.readUInt32LE(local) !== 0x04034b50 || zip.readUInt16LE(local + 8) !== method) throw new Error('ZIP 条目无效');
    const ln = zip.readUInt16LE(local + 26);
    const start = local + 30 + ln + zip.readUInt16LE(local + 28);
    if (start + packed > central || !name.equals(zip.subarray(local + 30, local + 30 + ln))) throw new Error('ZIP 条目边界无效');
    const compressed = zip.subarray(start, start + packed);
    const bytes = method === 8 ? inflateRawSync(compressed, {maxOutputLength: Math.max(size, 1)}) : compressed;
    if (bytes.length !== size || crc32(bytes) !== crc) throw new Error('ZIP 内容校验失败');
    if (!dir) files.set(key, bytes);
  }
  if (pos !== end) throw new Error('ZIP 目录长度无效');
  return files;
}

async function existing(file) {
  try { return await fs.lstat(file); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

export function createUpdater({ root = DEFAULT_ROOT, home = process.env.DSH_HOME || path.join(homedir(), '.dsh'), fetcher = fetch } = {}) {
  root = path.resolve(root);
  home = path.resolve(home);
  async function canUpdate() {
    // ESM normally resolves symlinks before import.meta.url. An external link
    // target is therefore not enough evidence of an installed plugin.
    const rel = path.relative(home, root).split(path.sep).join('/');
    if (!/^(plugins\/[^/]+|profiles\/[^/]+\/node_modules\/(?:@[^/]+\/)?[^/]+)$/.test(rel)) return false;
    for (let dir = root; ; dir = path.dirname(dir)) {
      const stat = await existing(dir);
      if (!stat?.isDirectory() || stat.isSymbolicLink() || await existing(path.join(dir, '.git'))) return false;
      if (dir === home) break;
    }
    return true;
  }
  const local = async () => manifest(await fs.readFile(path.join(root, 'package.json')));
  async function check() {
    const currentVersion = (await local()).version;
    const latestVersion = await mirrored(async ([url]) => manifest(await readRemote(url, 128 * 1024, fetcher)).version);
    return { currentVersion, latestVersion, hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      canAutoUpdate: await canUpdate(), repoUrl: REPO };
  }
  async function apply() {
    if (!await canUpdate()) throw new Error(BLOCKED);
    const lock = root + '.update-lock';
    try { await fs.mkdir(lock); }
    catch (e) { if (e.code === 'EEXIST') throw new Error('已有更新正在进行，或上次更新需要恢复：' + lock); throw e; }
    const staged = path.join(lock, 'new'), backup = path.join(lock, 'previous');
    let moved = false;
    try {
      const info = await check();
      if (!info.hasUpdate) return { ...info, restartRequired: false };
      const files = await mirrored(async ([, url]) => {
        const archive = unpackZip(await readRemote(url, LIMIT, fetcher));
        for (const key of ['package.json', 'index.js', 'client.js', 'lib/service.js']) {
          if (!archive.get(key)?.length) throw new Error('更新包缺少 ' + key);
        }
        if (manifest(archive.get('package.json')).version !== info.latestVersion) throw new Error('更新包版本与检查结果不符');
        return archive;
      });
      await fs.mkdir(staged);
      for (const [key, bytes] of files) {
        if (!/^(?:index\.js|client\.js|package\.json|cordis\.patch\.yml|icon\.svg|(?:lib|assets|locale|docs)\/.+)$/.test(key)) continue;
        const dest = path.join(staged, key);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, bytes, { flag: 'wx' });
      }
      if (!await canUpdate() || (await local()).version !== info.currentVersion) throw new Error('安装目录已变化，请重新检查更新');
      await fs.rename(root, backup);
      moved = true;
      try { await fs.rename(staged, root); }
      catch (e) { await fs.rename(backup, root); moved = false; throw e; }
      moved = false;
      return { ...info, currentVersion: info.latestVersion, hasUpdate: false, restartRequired: true };
    } finally {
      // If restoration failed, keep the backup intact for recovery.
      if (!moved) await fs.rm(lock, { recursive: true, force: true });
    }
  }
  return { check, apply, localVersion: async () => (await local()).version };
}
