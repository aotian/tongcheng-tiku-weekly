// Exercise the shipped 0.3.10 updater against the public main update feeds.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const expected = JSON.parse(await readFile('package.json', 'utf8')).version;
const home = await mkdtemp(path.join(tmpdir(), 'dsh-update-'));
try {
  const root = path.join(home, 'profiles', 'desktop', 'node_modules', 'tongcheng-tiku-weekly');
  await mkdir(path.join(root, 'lib'), { recursive: true });
  for (const file of ['package.json', 'lib/updater.js']) {
    await writeFile(path.join(root, file), execFileSync('git', ['show', 'v0.3.10:' + file]));
  }
  const { createUpdater } = await import(pathToFileURL(path.join(root, 'lib/updater.js')).href);
  const updater = createUpdater({ home, root });
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await updater.check();
      console.log(JSON.stringify(result));
      assert.equal(result.latestVersion, expected);
      assert.equal(result.hasUpdate, true);
      assert.equal(result.canAutoUpdate, true);
      break;
    } catch (error) {
      if (attempt === 6) throw error;
      await delay(30000);
    }
  }
} finally {
  await rm(home, { recursive: true, force: true });
}
