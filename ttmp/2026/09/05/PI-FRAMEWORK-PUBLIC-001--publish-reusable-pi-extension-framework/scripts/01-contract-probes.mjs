import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Run from repository root with Node 24 (native TypeScript stripping).
const root = process.cwd();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-framework-probe-'));
try {
  const source = path.join(root, 'extensions/_shared/registry.ts');
  await fs.copyFile(source, path.join(tmp, 'registry-a.ts'));
  await fs.copyFile(source, path.join(tmp, 'registry-b.ts'));
  const a = await import(pathToFileURL(path.join(tmp, 'registry-a.ts')).href);
  const b = await import(pathToFileURL(path.join(tmp, 'registry-b.ts')).href);
  a.clearPiExtensionRegistry();
  a.registerPiExtension({ id: 'probe', name: 'First', description: 'probe' });
  assert.equal(b.getPiExtension('probe').name, 'First');
  console.log('PASS: two physical module copies share the current global registry');
  b.registerPiExtension({ id: 'probe', name: 'Replacement', description: 'probe' });
  assert.equal(a.listPiExtensions().length, 1);
  assert.equal(a.getPiExtension('probe').name, 'Replacement');
  console.log('PASS: duplicate IDs silently replace the previous registration');
  assert.equal(a.dashboardWidgetKey('a.b', 'c'), a.dashboardWidgetKey('a', 'b.c'));
  console.log('PASS: unrestricted dot-separated widget IDs can collide');
  a.clearPiExtensionRegistry();
  const keys = await import(pathToFileURL(path.join(root, 'extensions/_shared/ui/palette-keys.ts')).href);
  const entries = Array.from({ length: 37 }, (_, i) => ({ id: String(i), title: 'A' }));
  assert.equal(keys.assignKeys(entries).length, 36);
  console.log('PASS: current key assignment omits the 37th unkeyable item');
  assert.throws(() => keys.assignKeys([{id:'a',title:'A',key:'x'}, {id:'b',title:'B',key:'X'}]), /Duplicate palette key/);
  console.log('PASS: duplicate explicit palette keys throw case-insensitively');
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
