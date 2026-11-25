import fs from 'node:fs';
import path from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');
if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets not found — run vite build first.');
  process.exit(1);
}

const files = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith('.js') && f.startsWith('index-'));

if (files.length === 0) {
  console.error('No primary index-*.js bundle found in dist/assets.');
  process.exit(1);
}

for (const file of files) {
  const fullPath = path.join(assetsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.25,
    deadCodeInjection: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75,
    splitStrings: true,
    splitStringsChunkLength: 10,
    numbersToExpressions: false,
    disableConsoleOutput: true,
    domainLock: ['jee1vk.github.io', 'localhost', '127.0.0.1'],
  });
  fs.writeFileSync(fullPath, result.getObfuscatedCode(), 'utf8');
  console.log(`Obfuscated ${file} (${source.length} -> ${result.getObfuscatedCode().length} bytes)`);
}
