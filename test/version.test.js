import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('version consistency across package.json, Cargo.toml, and tauri.conf.json', () => {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const pkgVersion = pkg.version;

  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version must be valid semver (x.y.z)');

  // Verify Cargo.toml version
  const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
  const cargoContent = fs.readFileSync(cargoPath, 'utf8');
  const cargoMatch = cargoContent.match(/\[package\][^]*?version\s*=\s*"([^"]+)"/);
  assert.ok(cargoMatch, 'Cargo.toml must have a version defined under [package]');
  const cargoVersion = cargoMatch[1];

  assert.equal(
    cargoVersion,
    pkgVersion,
    `Cargo.toml version (${cargoVersion}) does not match package.json (${pkgVersion})`
  );

  // Verify tauri.conf.json version
  const tauriPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
  if (typeof tauriConf.version === 'string' && !tauriConf.version.includes('package.json')) {
    assert.equal(
      tauriConf.version,
      pkgVersion,
      `tauri.conf.json version (${tauriConf.version}) does not match package.json (${pkgVersion})`
    );
  } else if (typeof tauriConf.version === 'string' && tauriConf.version.includes('package.json')) {
    // If referencing package.json via relative path, ensure that file exists and resolves
    const resolvedPath = path.resolve(rootDir, 'src-tauri', tauriConf.version);
    assert.equal(fs.existsSync(resolvedPath), true, 'tauri.conf.json relative version file must exist');
  }
});
