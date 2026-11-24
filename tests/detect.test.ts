import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  type DetectionInputs,
  detect,
  type FileEntry,
  neoforgeToMinecraft,
  parseLoaderArgs,
  referencedArgsFile,
} from '../frontend/src/lib/detect-core.ts';

// Times in minutes; the detector only compares them.
const MIN = 60_000;
const file = (name: string, minute = 0): FileEntry => ({ name, directory: false, modified: minute * MIN });
const dir = (name: string, minute = 0): FileEntry => ({ name, directory: true, modified: minute * MIN });

function inputs(overrides: Partial<DetectionInputs> = {}): DetectionInputs {
  return {
    contentReadable: true,
    root: [],
    config: null,
    logs: null,
    versions: null,
    cache: null,
    libraries: {},
    log: null,
    versionHistory: null,
    unixArgs: null,
    runScript: null,
    argsFile: null,
    versionChangerMarker: null,
    modpackMarker: null,
    state: null,
    variables: null,
    eggName: '',
    nestName: null,
    startup: 'java -Xms128M -jar {{SERVER_JARFILE}}',
    image: 'ghcr.io/pterodactyl/yolks:java_21',
    ...overrides,
  };
}

const log = (content: string) => ({ path: 'logs/latest.log', content });
const history = (currentVersion: string) => JSON.stringify({ currentVersion });
const variables = (pairs: Record<string, string>, secret: string[] = []) =>
  Object.entries(pairs).map(([envVariable, value]) => ({ envVariable, value, isSecret: secret.includes(envVariable) }));

describe('Paper family', () => {
  test('new version_history.json format gives the build and version, configs the software', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('version_history.json', 10), file('spigot.yml', 10), file('bukkit.yml', 10)],
        config: [file('paper-global.yml', 10)],
        versions: [dir('1.21.4', 5)],
        cache: [file('mojang_1.21.4.jar', 5)],
        versionHistory: history('1.21.4-232-main@abc1234 (MC: 1.21.4)'),
      }),
    );
    assert.equal(result.software?.value, 'paper');
    assert.equal(result.family, 'plugins');
    assert.equal(result.loader, 'paper');
    assert.deepEqual(result.minecraftVersion, { value: '1.21.4', source: 'version_history', confidence: 'high' });
    assert.deepEqual(result.loaderVersion, { value: '232', source: 'version_history', confidence: 'high' });
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.logStale, false);
    assert.equal(result.minecraft, true);
  });

  test('old branded version_history.json format', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('version_history.json', 10)],
        versionHistory: history('git-Paper-196 (MC: 1.20.1)'),
      }),
    );
    assert.deepEqual(result.software, { value: 'paper', source: 'version_history', confidence: 'high' });
    assert.equal(result.minecraftVersion?.value, '1.20.1');
    assert.equal(result.loaderVersion?.value, '196');
  });

  test('Purpur from its config and its branded history', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('purpur.yml', 10), file('version_history.json', 10)],
        config: [file('paper-global.yml', 10)],
        versionHistory: history('git-Purpur-2062 (MC: 1.20.1)'),
      }),
    );
    assert.equal(result.software?.value, 'purpur');
    assert.equal(result.loader, 'purpur');
    assert.equal(result.loaderVersion?.value, '2062');
  });

  test('Purpur from purpur.yml refines an unbranded version history', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('purpur.yml', 10), file('version_history.json', 10)],
        config: [file('paper-global.yml', 10)],
        versionHistory: history('1.21.4-2416-HEAD@abc (MC: 1.21.4)'),
      }),
    );
    assert.equal(result.software?.value, 'purpur');
    assert.equal(result.software?.source, 'files');
    assert.equal(result.loaderVersion?.value, '2416');
    assert.deepEqual(result.conflicts, []);
  });

  test('a purpur.yml older than the server jar does not make a Paper server Purpur', () => {
    const result = detect(
      inputs({
        root: [file('purpur.yml', 1), file('server.jar', 5), file('spigot.yml', 10), file('bukkit.yml', 10)],
        config: [file('paper-global.yml', 10)],
      }),
    );
    assert.equal(result.software?.value, 'paper');
    assert.equal(result.software?.confidence, 'low');
    assert.ok(!result.evidence.some((entry) => entry.detail === 'purpur.yml'));
  });

  test('Folia from the jar name beats paper-global.yml', () => {
    const result = detect(
      inputs({
        root: [file('folia-1.21.4-6.jar', 0)],
        config: [file('paper-global.yml', 10)],
      }),
    );
    assert.equal(result.software?.value, 'folia');
    assert.equal(result.loader, 'folia');
    assert.equal(result.minecraftVersion?.value, '1.21.4');
    assert.equal(result.loaderVersion?.value, '6');
  });

  test('Folia from the egg refines paper-global.yml', () => {
    const result = detect(
      inputs({ root: [file('server.jar', 0)], config: [file('paper-global.yml', 10)], eggName: 'Folia' }),
    );
    assert.deepEqual(result.software, { value: 'folia', source: 'egg', confidence: 'low' });
    assert.deepEqual(result.conflicts, []);
  });

  test('Folia from the log line', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0)],
        config: [file('paper-global.yml', 10)],
        logs: [file('latest.log', 20)],
        log: log(
          '[12:00:00 INFO]: [bootstrap] Loading Folia 1.21.4-6-main@abc (2025-01-01T00:00:00Z) for Minecraft 1.21.4\n',
        ),
      }),
    );
    assert.deepEqual(result.software, { value: 'folia', source: 'log', confidence: 'high' });
    assert.equal(result.loaderVersion?.value, '6');
  });

  test('Paper configs alone: Paper at low confidence', () => {
    const result = detect(inputs({ root: [file('server.jar', 0)], config: [file('paper-global.yml', 10)] }));
    assert.deepEqual(result.software, { value: 'paper', source: 'files', confidence: 'low' });
  });

  test('Paper log line before the EULA prompt (26.3)', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0)],
        logs: [file('latest.log', 10)],
        log: log('[12:00:00 INFO]: [bootstrap] Loading Paper 26.3-32-dev/26.3@abc (2026-10-01) for Minecraft 26.3\n'),
      }),
    );
    assert.equal(result.software?.value, 'paper');
    assert.equal(result.minecraftVersion?.value, '26.3');
    assert.equal(result.loaderVersion?.value, '32');
  });

  test('Spigot only and CraftBukkit only', () => {
    const spigot = detect(inputs({ root: [file('server.jar', 0), file('spigot.yml', 5), file('bukkit.yml', 5)] }));
    assert.equal(spigot.software?.value, 'spigot');
    const bukkit = detect(inputs({ root: [file('server.jar', 0), file('bukkit.yml', 5)] }));
    assert.equal(bukkit.software?.value, 'bukkit');
    assert.equal(bukkit.loader, 'bukkit');
  });

  test('Spigot from the CraftBukkit log line', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0)],
        logs: [file('latest.log', 10)],
        log: log(
          '[12:00:00 INFO]: Starting minecraft server version 1.20.4\n' +
            '[12:00:01 INFO]: This server is running CraftBukkit version 4226-Spigot-146439e-2889b3a (MC: 1.20.4) (Implementing API version 1.20.4-R0.1-SNAPSHOT)\n',
        ),
      }),
    );
    assert.equal(result.software?.value, 'spigot');
    assert.equal(result.minecraftVersion?.value, '1.20.4');
  });
});

describe('Proxies', () => {
  test('Velocity with its version from the log', () => {
    const result = detect(
      inputs({
        root: [file('velocity.jar', 0), file('velocity.toml', 1)],
        logs: [file('latest.log', 10)],
        log: log('[12:00:00 INFO]: Booting up Velocity 3.4.0-SNAPSHOT (git-6d9f5b1a-b498)...\n'),
      }),
    );
    assert.deepEqual(result.software, { value: 'velocity', source: 'log', confidence: 'high' });
    assert.equal(result.family, 'proxy');
    assert.equal(result.versionApplicable, false);
    assert.equal(result.minecraftVersion, null);
    assert.equal(result.loaderVersion?.value, '3.4.0-SNAPSHOT-498');
  });

  test('BungeeCord from modules.yml and its proxy log', () => {
    const result = detect(
      inputs({
        root: [file('BungeeCord.jar', 0), file('config.yml', 1), file('modules.yml', 1), file('proxy.log.0', 10)],
        log: {
          path: 'proxy.log.0',
          content:
            '12:00:00 [INFO] Enabled BungeeCord version git:BungeeCord-Bootstrap:1.21-R0.1-SNAPSHOT:6a5f8e2:1881\n',
        },
      }),
    );
    assert.equal(result.software?.value, 'bungeecord');
    assert.equal(result.loader, 'bungeecord');
    assert.equal(result.loaderVersion?.value, '1.21-1881');
  });

  test('Waterfall beats the modules.yml it shares with BungeeCord', () => {
    const files = detect(inputs({ root: [file('server.jar', 0), file('waterfall.yml', 1), file('modules.yml', 1)] }));
    assert.equal(files.software?.value, 'waterfall');
    assert.deepEqual(files.conflicts, []);

    const logged = detect(
      inputs({
        root: [file('server.jar', 0), file('waterfall.yml', 1), file('modules.yml', 1)],
        logs: [file('latest.log', 10)],
        log: log('[12:00:00 INFO]: Enabled Waterfall version git:Waterfall-Bootstrap:1.21-R0.1-SNAPSHOT:0d8d6a3:586\n'),
      }),
    );
    assert.equal(logged.loaderVersion?.value, '1.21-586');
  });
});

describe('Hybrids', () => {
  test('Mohist beats its Forge libraries and bukkit.yml', () => {
    const result = detect(
      inputs({
        root: [
          file('mohist-1.20.1-xyz-server.jar', 0),
          dir('mohist-config', 5),
          file('bukkit.yml', 5),
          file('spigot.yml', 5),
        ],
        libraries: { forge: [dir('1.20.1-47.3.25', 1)] },
      }),
    );
    assert.equal(result.software?.value, 'mohist');
    assert.equal(result.family, 'hybrid');
    assert.equal(result.loader, 'spigot');
    assert.equal(result.minecraftVersion?.value, '1.20.1');
    assert.deepEqual(result.conflicts, []);
  });

  test('Arclight from arclight.conf, Youer from youer-config/', () => {
    const arclight = detect(
      inputs({
        root: [file('arclight.jar', 0), file('arclight.conf', 5), file('bukkit.yml', 5)],
        libraries: { neoforge: [dir('21.1.77', 1)] },
      }),
    );
    assert.equal(arclight.software?.value, 'arclight');
    const youer = detect(
      inputs({ root: [file('server.jar', 0), dir('youer-config', 5)], libraries: { neoforge: [dir('21.1.77', 1)] } }),
    );
    assert.equal(youer.software?.value, 'youer');
    assert.equal(youer.minecraftVersion?.value, '1.21.1');
  });

  test('a Mohist egg refines Forge libraries', () => {
    const result = detect(inputs({ libraries: { forge: [dir('1.20.1-47.3.25', 1)] }, eggName: 'Mohist' }));
    assert.equal(result.software?.value, 'mohist');
    assert.equal(result.minecraftVersion?.value, '1.20.1');
  });
});

describe('Mod loaders are recognised as mods', () => {
  test('Fabric from libraries, launcher markers and log', () => {
    const result = detect(
      inputs({
        root: [file('fabric-server-launch.jar', 0), dir('.fabric', 0), file('fabric-server-launcher.properties', 0)],
        libraries: { fabricLoader: [dir('0.16.5', 1)], intermediary: [dir('1.21.1', 1)] },
        logs: [file('latest.log', 10)],
        log: log('[12:00:00] [main/INFO]: Loading Minecraft 1.21.1 with Fabric Loader 0.16.5\n'),
      }),
    );
    assert.equal(result.software?.value, 'fabric');
    assert.equal(result.family, 'mods');
    assert.equal(result.loader, null);
    assert.equal(result.minecraftVersion?.value, '1.21.1');
    assert.equal(result.loaderVersion?.value, '0.16.5');
  });

  test('Fabric launcher jar name carries both versions', () => {
    const result = detect(inputs({ root: [file('fabric-server-mc.1.21.1-loader.0.16.5-launcher.1.0.1.jar', 0)] }));
    assert.equal(result.software?.value, 'fabric');
    assert.equal(result.minecraftVersion?.value, '1.21.1');
    assert.equal(result.loaderVersion?.value, '0.16.5');
  });

  test('a stale quilt-loader folder loses to newer Fabric libraries', () => {
    const result = detect(
      inputs({
        libraries: {
          quiltLoader: [dir('0.26.0', 1)],
          fabricLoader: [dir('0.16.5', 10)],
          intermediary: [dir('1.21.1', 10)],
        },
      }),
    );
    assert.equal(result.software?.value, 'fabric');
    assert.ok(result.conflicts.some((entry) => entry.detail.includes('quilt-loader')));
  });

  test('Quilt from its loader folder', () => {
    const result = detect(
      inputs({
        root: [file('quilt-server-launch.jar', 0)],
        libraries: { quiltLoader: [dir('0.26.0', 1)], intermediary: [dir('1.20.1', 1)] },
      }),
    );
    assert.equal(result.software?.value, 'quilt');
    assert.equal(result.loaderVersion?.value, '0.26.0');
    assert.equal(result.minecraftVersion?.value, '1.20.1');
  });

  test('Forge 1.20.1 from run.sh and the argfile it passes', () => {
    const run = 'java @user_jvm_args.txt @libraries/net/minecraftforge/forge/1.20.1-47.3.25/unix_args.txt "$@"\n';
    const path = referencedArgsFile(run);
    assert.equal(path, 'libraries/net/minecraftforge/forge/1.20.1-47.3.25/unix_args.txt');
    const result = detect(
      inputs({
        root: [file('run.sh', 1), file('user_jvm_args.txt', 1)],
        libraries: { forge: [dir('1.20.1-47.3.25', 1)] },
        runScript: run,
        argsFile: {
          path: path as string,
          content:
            '--launchTarget forgeserver\n--fml.forgeVersion 47.3.25\n--fml.mcVersion 1.20.1\n--fml.forgeGroup net.minecraftforge\n',
        },
      }),
    );
    assert.deepEqual(result.software, { value: 'forge', source: 'args', confidence: 'high' });
    assert.equal(result.minecraftVersion?.value, '1.20.1');
    assert.equal(result.loaderVersion?.value, '47.3.25');
    assert.equal(result.family, 'mods');
  });

  test('Forge shim and legacy Forge jar', () => {
    const shim = detect(inputs({ root: [file('forge-1.21.10-60.1.0-shim.jar', 0)] }));
    assert.equal(shim.software?.value, 'forge');
    assert.equal(shim.minecraftVersion?.value, '1.21.10');
    assert.equal(shim.loaderVersion?.value, '60.1.0');

    const legacy = detect(
      inputs({ root: [file('forge-1.12.2-14.23.5.2860.jar', 0), file('minecraft_server.1.12.2.jar', 0)] }),
    );
    assert.equal(legacy.software?.value, 'forge');
    assert.equal(legacy.minecraftVersion?.value, '1.12.2');
    assert.equal(legacy.loaderVersion?.value, '14.23.5.2860');
  });

  test('NeoForge from args, from libraries, and 1.20.1 under net.neoforged/forge', () => {
    const args = detect(
      inputs({
        root: [file('unix_args.txt', 1)],
        unixArgs: '--launchTarget forgeserver\n--fml.neoForgeVersion 21.1.257\n--fml.mcVersion 1.21.1\n',
      }),
    );
    assert.equal(args.software?.value, 'neoforge');
    assert.equal(args.loaderVersion?.value, '21.1.257');

    const libraries = detect(inputs({ libraries: { neoforge: [dir('21.1.200', 1), dir('21.1.257', 2)] } }));
    assert.equal(libraries.minecraftVersion?.value, '1.21.1');
    assert.equal(libraries.loaderVersion?.value, '21.1.257');

    const legacy = detect(inputs({ libraries: { neoforgedForge: [dir('1.20.1-47.1.106', 1)] } }));
    assert.equal(legacy.software?.value, 'neoforge');
    assert.equal(legacy.minecraftVersion?.value, '1.20.1');
    assert.equal(legacy.loaderVersion?.value, '47.1.106');

    const log120 = detect(
      inputs({
        logs: [file('latest.log', 10)],
        log: log(
          '[main/INFO] [cpw.mods.modlauncher.Launcher/MODLAUNCHER]: ModLauncher running: args [--launchTarget, forgeserver, --fml.forgeVersion, 47.1.106, --fml.mcVersion, 1.20.1, --fml.forgeGroup, net.neoforged, --fml.mcpVersion, 20230612.114412]\n',
        ),
      }),
    );
    assert.equal(log120.software?.value, 'neoforge');
    assert.equal(log120.software?.source, 'log');
  });

  test('year-numbered NeoForge versions', () => {
    assert.equal(neoforgeToMinecraft('26.1.0.5'), '26.1');
    assert.equal(neoforgeToMinecraft('26.1.2.7'), '26.1.2');
    assert.equal(neoforgeToMinecraft('26.1.2.7-beta'), '26.1.2');
    assert.equal(neoforgeToMinecraft('20.4.237'), '1.20.4');
    assert.equal(neoforgeToMinecraft('21.0.3'), '1.21');
    assert.equal(neoforgeToMinecraft('x.1'), null);
    const result = detect(inputs({ libraries: { neoforge: [dir('26.1.0.5-beta', 1)] } }));
    assert.equal(result.minecraftVersion?.value, '26.1');
  });

  test('NeoForge → Forge switch: newest libraries win, the leftover is a conflict', () => {
    const result = detect(inputs({ libraries: { neoforge: [dir('21.1.77', 1)], forge: [dir('1.21.1-52.0.40', 10)] } }));
    assert.equal(result.software?.value, 'forge');
    assert.equal(result.loaderVersion?.value, '52.0.40');
    assert.ok(result.conflicts.some((entry) => entry.detail.includes('neoforge/21.1.77')));
  });
});

describe('Launch argument parsing', () => {
  test('comments and quotes are skipped, bad values rejected', () => {
    assert.deepEqual(
      parseLoaderArgs(
        '# java -jar forge-1.20.4-49.0.1-shim.jar\njava -Dmotd="Server #1" -jar forge-1.21.10-60.1.0-shim.jar nogui # was forge-1.21.9-59.0.1-shim.jar\n',
      ),
      { software: 'forge', minecraftVersion: '1.21.10', loaderVersion: '60.1.0' },
    );
    assert.equal(parseLoaderArgs('java -Xmx2G -jar server.jar nogui'), null);
    assert.equal(parseLoaderArgs('--fml.forgeVersion ../x --fml.mcVersion 1.20.1'), null);
    assert.equal(referencedArgsFile('java @libraries/../../etc/unix_args.txt'), null);
    assert.equal(referencedArgsFile('java -jar server.jar'), null);
  });
});

describe('Freshness', () => {
  test('a log older than new NeoForge libraries is stale and loses', () => {
    const result = detect(
      inputs({
        libraries: { neoforge: [dir('21.1.77', 20)] },
        logs: [file('latest.log', 10)],
        log: log('[12:00:00] [main/INFO]: Loading Minecraft 1.20.1 with Fabric Loader 0.15.0\n'),
      }),
    );
    assert.equal(result.logStale, true);
    assert.deepEqual(result.staleSources, ['log']);
    assert.ok(result.conflicts.some((entry) => entry.source === 'log' && entry.stale));
    assert.equal(result.software?.value, 'neoforge');
    assert.equal(result.minecraftVersion?.value, '1.21.1');
    assert.ok(result.evidence.some((entry) => entry.source === 'log'));
  });

  test('a log older than the marker install time is stale', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('.mcvc-type.json', 30)],
        logs: [file('latest.log', 10)],
        log: log('[12:00:00 INFO]: This server is running Paper version 1.20.4-496-release (MC: 1.20.4)\n'),
        versionChangerMarker: JSON.stringify({
          type: 'PURPUR',
          version: '1.21.4',
          buildName: '#2416',
          installedAt: new Date(30 * MIN).toISOString(),
        }),
      }),
    );
    assert.equal(result.logStale, true);
    assert.deepEqual(result.staleSources, ['log']);
    assert.deepEqual(
      result.conflicts.find((entry) => entry.source === 'log'),
      {
        source: 'log',
        detail: '[12:00:00 INFO]: This server is running Paper version 1.20.4-496-release (MC: 1.20.4)',
        value: 'Paper · 1.20.4 · 496',
        stale: true,
      },
    );
    assert.deepEqual(result.software, { value: 'purpur', source: 'marker', confidence: 'medium' });
    assert.equal(result.minecraftVersion?.value, '1.21.4');
    assert.equal(result.loaderVersion?.value, '2416');
  });

  test('only a stale log: low confidence', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 20)],
        logs: [file('latest.log', 10)],
        log: log('[12:00:00 INFO]: This server is running Paper version git-Paper-196 (MC: 1.20.1)\n'),
      }),
    );
    assert.deepEqual(result.software, { value: 'paper', source: 'log', confidence: 'low' });
    assert.equal(result.logStale, true);
  });

  test('a fresh Folia log and a stale branded version_history.json: only the history is stale, and it conflicts', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 20), file('version_history.json', 10)],
        config: [file('paper-global.yml', 30)],
        logs: [file('latest.log', 30)],
        log: log(
          '[12:00:00 INFO]: [bootstrap] Loading Folia 1.21.4-6-main@abc (2025-01-01T00:00:00Z) for Minecraft 1.21.4\n',
        ),
        versionHistory: history('git-Paper-196 (MC: 1.20.1)'),
      }),
    );
    assert.deepEqual(result.software, { value: 'folia', source: 'log', confidence: 'high' });
    assert.equal(result.minecraftVersion?.value, '1.21.4');
    assert.equal(result.loaderVersion?.value, '6');
    assert.deepEqual(result.staleSources, ['version_history']);
    assert.equal(result.logStale, true);
    assert.deepEqual(result.conflicts, [
      { source: 'version_history', detail: 'version_history.json', value: 'Paper · 1.20.1 · 196', stale: true },
    ]);
    // paper-global.yml is something Folia writes as well: not a conflict.
    assert.ok(!result.conflicts.some((entry) => entry.source === 'files'));
  });

  test('an unbranded stale version_history.json conflicts only on the version and is not labelled Paper', () => {
    const base = {
      root: [file('server.jar', 20), file('version_history.json', 10)],
      logs: [file('latest.log', 30)],
      log: log(
        '[12:00:00 INFO]: [bootstrap] Loading Folia 1.21.4-6-main@abc (2025-01-01T00:00:00Z) for Minecraft 1.21.4\n',
      ),
    };
    const same = detect(inputs({ ...base, versionHistory: history('1.21.4-5-main@def (MC: 1.21.4)') }));
    assert.deepEqual(same.conflicts, []);
    assert.equal(same.evidence.find((entry) => entry.source === 'version_history')?.value, '1.21.4 · 5');

    const older = detect(inputs({ ...base, versionHistory: history('1.21.3-2-main@def (MC: 1.21.3)') }));
    assert.deepEqual(older.conflicts, [
      { source: 'version_history', detail: 'version_history.json', value: '1.21.3 · 2', stale: true },
    ]);
  });

  test('a fresh log and fresh history: nothing is stale', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('version_history.json', 10)],
        logs: [file('latest.log', 10)],
        versionHistory: history('git-Paper-196 (MC: 1.20.1)'),
      }),
    );
    assert.deepEqual(result.staleSources, []);
    assert.equal(result.logStale, false);
  });

  test('downgrade: the newest versions/ folder wins over the highest name', () => {
    const result = detect(
      inputs({ root: [file('server.jar', 0)], versions: [dir('1.21.4', 1), dir('1.20.6', 10)], eggName: 'Paper' }),
    );
    assert.equal(result.minecraftVersion?.value, '1.20.6');
    assert.equal(result.minecraftVersion?.source, 'files');
  });
});

describe('Markers', () => {
  test('Modpack marker', () => {
    const result = detect(
      inputs({
        root: [file('.modpack-installer.json', 1)],
        modpackMarker: JSON.stringify({
          loader: 'fabric',
          loader_version: '0.16.5',
          minecraft_version: '1.21.1',
          installed_at: new Date(MIN).toISOString(),
        }),
      }),
    );
    assert.deepEqual(result.software, { value: 'fabric', source: 'marker', confidence: 'medium' });
    assert.equal(result.loaderVersion?.value, '0.16.5');
    assert.equal(result.family, 'mods');
  });

  test('a marker older than newer conflicting libraries loses', () => {
    const result = detect(
      inputs({
        libraries: { neoforge: [dir('21.1.77', 50)] },
        versionChangerMarker: JSON.stringify({
          type: 'FABRIC',
          version: '1.21.1',
          installedAt: new Date(10 * MIN).toISOString(),
        }),
      }),
    );
    assert.equal(result.software?.value, 'neoforge');
    assert.ok(result.conflicts.some((entry) => entry.source === 'marker'));
  });

  test('Version Chooser marker format and a proxy marker', () => {
    const chooser = detect(
      inputs({
        versionChangerMarker: JSON.stringify({
          type: 'FABRIC',
          version: '1.21.1',
          installedAt: '2026-08-01T00:00:00.000Z',
        }),
      }),
    );
    assert.equal(chooser.software?.value, 'fabric');
    assert.equal(chooser.minecraftVersion?.value, '1.21.1');

    const proxy = detect(
      inputs({
        versionChangerMarker: JSON.stringify({ type: 'VELOCITY', version: '3.4.0-SNAPSHOT', buildName: '#450' }),
      }),
    );
    assert.equal(proxy.software?.value, 'velocity');
    assert.equal(proxy.minecraftVersion, null);
    assert.equal(proxy.loaderVersion?.value, '3.4.0-SNAPSHOT-450');
  });
});

describe('Override', () => {
  test('the override wins and disagreeing fresh files are reported', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('purpur.yml', 10)],
        config: [file('paper-global.yml', 10)],
        state: {
          override: { software: 'paper', minecraftVersion: '1.21.4', loaderVersion: null },
          setAt: '2026-11-01T00:00:00Z',
          problem: null,
        },
      }),
    );
    assert.deepEqual(result.software, { value: 'paper', source: 'override', confidence: 'high' });
    assert.equal(result.minecraftVersion?.value, '1.21.4');
    assert.equal(result.overrideDisagrees, true);
    assert.equal(result.overrideSetAt, '2026-11-01T00:00:00Z');
    assert.ok(result.conflicts.some((entry) => entry.detail === 'purpur.yml'));
  });

  test('an override matching the files does not warn', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0)],
        config: [file('paper-global.yml', 10)],
        state: {
          override: { software: 'folia', minecraftVersion: null, loaderVersion: null },
          setAt: null,
          problem: null,
        },
      }),
    );
    assert.equal(result.software?.value, 'folia');
    assert.equal(result.loader, 'folia');
    assert.equal(result.overrideDisagrees, false);
  });

  test('an invalid override is ignored and noted', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0), file('spigot.yml', 5)],
        state: { override: null, setAt: null, problem: 'invalid' },
      }),
    );
    assert.equal(result.software?.value, 'spigot');
    assert.equal(result.override, null);
    assert.equal(result.overrideProblem, 'invalid');
    assert.deepEqual(result.evidence[0], {
      source: 'override',
      detail: '.mc-plugins-installer.json',
      value: 'invalid',
      stale: false,
    });
  });
});

describe('Variables and egg', () => {
  test('MINECRAFT_VERSION=latest falls through to VERSION; secret variables are skipped', () => {
    const result = detect(
      inputs({
        variables: variables(
          { MINECRAFT_VERSION: 'latest', VERSION: '1.20.6', SERVER_TYPE: 'fabric', MC_VERSION: '1.19' },
          ['MC_VERSION'],
        ),
      }),
    );
    assert.deepEqual(result.minecraftVersion, { value: '1.20.6', source: 'variables', confidence: 'medium' });
    assert.deepEqual(result.software, { value: 'fabric', source: 'variables', confidence: 'low' });
  });

  test('the egg name beats the nest name', () => {
    const result = detect(inputs({ eggName: 'Paper', nestName: 'Forge & Paper' }));
    assert.deepEqual(result.software, { value: 'paper', source: 'egg', confidence: 'low' });
    const nest = detect(inputs({ eggName: 'Minecraft Java', nestName: 'Forge' }));
    assert.equal(nest.software?.value, 'forge');
  });

  test('keywords match at word starts only', () => {
    const result = detect(inputs({ eggName: 'Newspaper Bot', image: 'ghcr.io/example/minecraft:java_21' }));
    assert.equal(result.software, null);
    assert.equal(result.minecraft, true);
  });

  test('the SERVER_JARFILE name identifies the server jar', () => {
    const result = detect(
      inputs({
        root: [file('paper.jar', 1), file('purpur-1.21.4-2416.jar', 2)],
        variables: variables({ SERVER_JARFILE: 'paper.jar' }),
      }),
    );
    assert.equal(result.software?.value, 'paper');
  });
});

describe('Read access and non-Minecraft servers', () => {
  test('without read-content only listings, variables and egg count', () => {
    const result = detect(
      inputs({
        contentReadable: false,
        root: [file('server.jar', 0), file('version_history.json', 10)],
        config: [file('paper-global.yml', 10)],
        logs: [file('latest.log', 10)],
        log: log('[12:00:00 INFO]: This server is running Purpur version git-Purpur-2062 (MC: 1.20.1)\n'),
        versionHistory: history('git-Purpur-2062 (MC: 1.20.1)'),
        state: {
          override: { software: 'velocity', minecraftVersion: null, loaderVersion: null },
          setAt: null,
          problem: null,
        },
        variables: variables({ MINECRAFT_VERSION: '1.20.1' }),
      }),
    );
    assert.equal(result.software?.value, 'paper');
    assert.equal(result.minecraftVersion?.source, 'variables');
    assert.equal(result.override, null);
    assert.equal(result.contentReadable, false);
    assert.ok(result.evidence.every((entry) => !['log', 'version_history', 'override'].includes(entry.source)));
  });

  test('a 7 Days to Die server is not Minecraft', () => {
    const result = detect(
      inputs({
        root: [file('7DaysToDieServer.x86_64', 0), dir('Data', 0), file('serverconfig.xml', 0)],
        eggName: '7 Days to Die',
        nestName: 'Survival',
        startup: './7DaysToDieServer.x86_64 -configfile=serverconfig.xml',
        image: 'ghcr.io/parkervcp/games:source',
      }),
    );
    assert.equal(result.minecraft, false);
    assert.equal(result.software, null);
    assert.equal(result.family, null);
  });
});

describe('Vanilla and snapshots', () => {
  test('vanilla log, release and snapshot versions', () => {
    for (const version of ['1.21.4', '26.1', '24w14a', '26.3-pre-2']) {
      const result = detect(
        inputs({
          root: [file('server.jar', 0), file('server.properties', 1), file('eula.txt', 1)],
          versions: [dir(version, 1)],
          logs: [file('latest.log', 10)],
          log: log(`[12:00:00] [Server thread/INFO]: Starting minecraft server version ${version}\n`),
        }),
      );
      assert.equal(result.software?.value, 'vanilla', version);
      assert.equal(result.family, 'vanilla');
      assert.equal(result.minecraftVersion?.value, version);
      assert.equal(result.loader, null);
    }
  });

  test('a version line in a Paper log does not make it vanilla', () => {
    const result = detect(
      inputs({
        root: [file('server.jar', 0)],
        config: [file('paper-global.yml', 10)],
        logs: [file('latest.log', 10)],
        log: log(
          '[12:00:00 INFO]: Starting minecraft server version 1.21.4\n[12:00:00 INFO]: Loading properties\n[12:00:01 INFO]: Paper: Using libdeflate\n',
        ),
      }),
    );
    assert.equal(result.software?.value, 'paper');
    assert.equal(result.minecraftVersion?.value, '1.21.4');
    assert.equal(result.minecraftVersion?.source, 'log');
  });

  test('long log lines are cut to 200 characters', () => {
    const result = detect(
      inputs({
        logs: [file('latest.log', 10)],
        log: log(`[12:00:00 INFO]: Starting minecraft server version 1.21.4 ${'x'.repeat(400)}\n`),
      }),
    );
    assert.ok(result.evidence.every((entry) => entry.detail.length <= 200));
  });
});
