import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAllowedDownload,
  isValidJarName,
  jarNameOf,
  safeHref,
  temporaryUploadName,
} from '../frontend/src/lib/fileRules.ts';
import { parseStateFile, serializeStateFile, STATE_FILE_MAX_BYTES } from '../frontend/src/lib/stateFormat.ts';

describe('jar names', () => {
  it('accepts a single jar segment in any case', () => {
    assert.ok(isValidJarName('LuckPerms-Bukkit-5.4.jar'));
    assert.ok(isValidJarName('Essentials.JAR'));
  });

  it('rejects paths, dot files, control characters, sources jars and other types', () => {
    for (const name of [
      '',
      '../evil.jar',
      'sub/plugin.jar',
      'sub\\plugin.jar',
      '.hidden.jar',
      'bad\u0007name.jar',
      'plugin-sources.jar',
      'plugin.zip',
      'plugin.jar.disabled',
      `${'a'.repeat(252)}.jar`,
    ]) {
      assert.equal(isValidJarName(name), false, name);
    }
  });

  it('strips the disabled suffix case-insensitively', () => {
    assert.equal(jarNameOf('Foo.jar.disabled'), 'Foo.jar');
    assert.equal(jarNameOf('Foo.JAR.DISABLED'), 'Foo.JAR');
    assert.equal(jarNameOf('Foo.jar'), 'Foo.jar');
  });

  it('makes temporary upload names the backend accepts', () => {
    assert.match(temporaryUploadName(), /^\.mcpi-upload-[a-z0-9]{16}\.tmp$/);
  });
});

describe('download hosts', () => {
  it('allows only https on the exact CDN host of each source', () => {
    assert.ok(isAllowedDownload('modrinth', 'https://cdn.modrinth.com/data/abc/versions/1/a.jar'));
    assert.ok(isAllowedDownload('curseforge', 'https://edge.forgecdn.net/files/1/2/a.jar'));
    assert.ok(isAllowedDownload('curseforge', 'https://mediafilez.forgecdn.net/files/1/2/a.jar'));
    assert.ok(isAllowedDownload('hangar', 'https://hangarcdn.papermc.io/plugins/a/b/versions/1/PAPER/a.jar'));

    assert.equal(isAllowedDownload('modrinth', 'http://cdn.modrinth.com/a.jar'), false);
    assert.equal(isAllowedDownload('modrinth', 'https://cdn.modrinth.com.evil.example/a.jar'), false);
    assert.equal(isAllowedDownload('hangar', 'https://cdn.modrinth.com/a.jar'), false);
    assert.equal(isAllowedDownload('curseforge', 'not a url'), false);
  });

  it('keeps only http(s) links', () => {
    assert.equal(safeHref('https://example.com/x'), 'https://example.com/x');
    assert.equal(safeHref('javascript:alert(1)'), null);
    assert.equal(safeHref('data:text/html,hi'), null);
    assert.equal(safeHref(null), null);
  });
});

describe('state file', () => {
  const sha = 'a'.repeat(64);

  it('round-trips the override and install records', () => {
    const raw = serializeStateFile({
      override: { software: 'folia', minecraftVersion: '1.21.4', loaderVersion: null },
      setAt: '2026-11-24T10:00:00.000Z',
      installed: [{ file: 'ViaVersion.jar', sha256: sha, project: '31', version: '34581' }],
    });
    assert.ok(raw);
    const { state, problem } = parseStateFile(raw);
    assert.equal(problem, null);
    assert.deepEqual(state.override, { software: 'folia', minecraftVersion: '1.21.4', loaderVersion: null });
    assert.equal(state.setAt, '2026-11-24T10:00:00.000Z');
    assert.equal(state.installed.length, 1);
  });

  it('serializes to nothing when there is nothing to keep', () => {
    assert.equal(serializeStateFile({ override: null, setAt: null, installed: [] }), null);
  });

  it('reports invalid overrides and drops broken records', () => {
    const { state, problem } = parseStateFile(
      JSON.stringify({
        override: { software: 'craftbukkit-9000' },
        installed: [{ file: 'a.jar', sha256: 'short', project: '1', version: '2' }, { nonsense: true }],
      }),
    );
    assert.equal(problem, 'invalid');
    assert.equal(state.override, null);
    assert.deepEqual(state.installed, []);

    assert.equal(parseStateFile('not json').problem, 'invalid');
    assert.equal(parseStateFile('[]').problem, 'invalid');
    assert.equal(parseStateFile(' '.repeat(STATE_FILE_MAX_BYTES + 1)).problem, 'too_large');
  });
});
