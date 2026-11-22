import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { compareVersions, createUpdater, unpackZip } from '../lib/updater.js';

function archive(files, method = 8) {
  const locals = [], entries = [];
  let offset = 0;
  for (const [key, content] of Object.entries(files)) {
    const name = Buffer.from('repo-main/' + key), bytes = Buffer.from(content);
    const packed = method === 8 ? deflateRawSync(bytes) : bytes;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    header.copy(central, 6, 4, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(header, name, packed);
    entries.push(central, name);
    offset += header.length + name.length + packed.length;
  }
  const directory = Buffer.concat(entries), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length / 2, 8);
  end.writeUInt16LE(entries.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const pkg = version => JSON.stringify({ name: 'tongcheng-tiku-weekly', version });
const files = { 'package.json': pkg('0.3.1'), 'index.js': 'export {}', 'client.js': 'void 0', 'lib/service.js': 'export {}' };

async function install(t, fetcher) {
  const home = await fs.mkdtemp(path.join(tmpdir(), 'weekly-install-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'profiles/desktop/node_modules/tongcheng-tiku-weekly');
  await fs.mkdir(root, {recursive: true});
  await fs.writeFile(path.join(root, 'package.json'), pkg('0.3.0'));
  return {root, home, updater: createUpdater({root, home, fetcher})};
}

test('semantic version precedence', () => {
  for (const [a,b] of [['0.3.10','0.3.2'], ['1.0.0','1.0.0-rc.1'], ['1.0.0-rc.10','1.0.0-rc.2']]) {
    assert.equal(compareVersions(a,b), 1);
    assert.equal(compareVersions(b,a), -1);
  }
  assert.equal(compareVersions('1.0.0+a','1.0.0+b'), 0);
  assert.throws(() => compareVersions('1.0.0-01','1.0.0'));
});

test('stored and deflated archives, invalid paths and corrupt entries', () => {
  for (const method of [0,8]) assert.equal(unpackZip(archive(files,method)).get('package.json').toString(), files['package.json']);
  for (const key of ['../outside', 'lib/../../outside', 'C:/windows', 'lib\\outside', 'NUL.js', 'lib/file:stream']) {
    assert.throws(() => unpackZip(archive({[key]: 'bad'})));
  }
  const damaged = archive(files,0);
  damaged[30 + 'repo-main/package.json'.length] ^= 1;
  assert.throws(() => unpackZip(damaged));
});

test('fallback install replaces runtime only, preserves storage, no repeat update', async t => {
  const calls = [];
  const {root,home,updater} = await install(t, async url => {
    calls.push(url);
    if (url.includes('gitee.com')) return new Response('offline', {status:503});
    return new Response(url.endsWith('package.json') ? files['package.json'] : archive(files));
  });
  const storage = path.join(home, 'storages/tiku-weekly');
  await fs.mkdir(storage, {recursive:true});
  await fs.writeFile(path.join(storage,'session'), 'untouched');
  assert.deepEqual(await updater.check(), { currentVersion:'0.3.0',latestVersion:'0.3.1',hasUpdate:true,
    canAutoUpdate:true,repoUrl:'https://gitee.com/35084032/tongcheng-tiku-weekly' });
  assert.equal((await updater.apply()).restartRequired, true);
  assert.equal(await fs.readFile(path.join(root,'lib/service.js'),'utf8'), files['lib/service.js']);
  assert.equal(await fs.readFile(path.join(storage,'session'),'utf8'), 'untouched');
  assert.equal((await updater.apply()).restartRequired, false);
  assert.ok(calls.includes('https://gitee.com/35084032/tongcheng-tiku-weekly/repository/archive/main.zip'));
});

test('reject developer directory, junction, and resolved external link target before fetching', async t => {
  const fetcher = () => assert.fail('unexpected fetch');
  const {root,home,updater} = await install(t, fetcher);
  await fs.writeFile(path.join(root,'.git'),'gitdir: elsewhere');
  await assert.rejects(updater.apply(), /不能自动覆盖/);
  const target = path.join(home,'source');
  await fs.rename(root,target);
  await fs.rm(path.join(target,'.git'));
  await fs.symlink(target,root,process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(updater.apply(), /不能自动覆盖/);
  await assert.rejects(createUpdater({root:target,home,fetcher}).apply(), /不能自动覆盖/);
});

test('invalid archive leaves previous installation usable', async t => {
  const {root,updater} = await install(t, async url => new Response(url.endsWith('package.json') ?
    files['package.json'] : archive({ ...files, 'lib/service.js': '' })));
  await assert.rejects(updater.apply(), /service.js/);
  assert.equal(await fs.readFile(path.join(root,'package.json'),'utf8'),pkg('0.3.0'));
});
