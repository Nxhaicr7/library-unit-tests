const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const jestArgs = process.argv.slice(2);

if (jestArgs.length === 0) {
  console.error('Usage: node scripts/run-jest-proof.js <jest args...>');
  process.exit(1);
}

const outputFile = path.join(
  os.tmpdir(),
  `jest-proof-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
);

const child = spawn(
  './node_modules/.bin/jest',
  [...jestArgs, '--json', '--outputFile', outputFile],
  {
    stdio: ['inherit', 'ignore', 'ignore'],
    shell: false,
  }
);

function formatDuration(duration) {
  return typeof duration === 'number' && duration >= 1 ? ` (${duration} ms)` : '';
}

function firstFailureLine(failureMessages = []) {
  if (!Array.isArray(failureMessages) || failureMessages.length === 0) {
    return '';
  }

  const cleaned = failureMessages
    .join('\n')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const preferred =
    cleaned.find(line => line.startsWith('Expected:')) ||
    cleaned.find(line => line.startsWith('Received:')) ||
    cleaned.find(line => line.startsWith('Resolved to value:')) ||
    cleaned.find(line => line.startsWith('expect(')) ||
    cleaned.find(line => !line.startsWith('at '));

  return preferred || '';
}

child.on('close', code => {
  try {
    const raw = fs.readFileSync(outputFile, 'utf8');
    const result = JSON.parse(raw);

    for (const testResult of result.testResults) {
      const fileStatus = testResult.status === 'failed' ? 'FAIL' : 'PASS';
      const relativePath = path.relative(process.cwd(), testResult.name);
      console.log(`${fileStatus}  ${relativePath}`);

      const suites = new Map();
      for (const assertion of testResult.assertionResults) {
        const suiteName = assertion.ancestorTitles.at(-1) || 'Test Suite';
        if (!suites.has(suiteName)) {
          suites.set(suiteName, []);
        }
        suites.get(suiteName).push(assertion);
      }

      for (const [suiteName, assertions] of suites.entries()) {
        console.log(`  ${suiteName}`);
        for (const assertion of assertions) {
          const marker = assertion.status === 'failed' ? '✕' : '✓';
          console.log(`    ${marker} ${assertion.title}${formatDuration(assertion.duration)}`);
          if (assertion.status === 'failed') {
            const reason = firstFailureLine(assertion.failureMessages);
            if (reason) {
              console.log(`      -> ${reason}`);
            }
          }
        }
      }

      console.log('');
    }

    console.log(
      `Test Suites: ${result.numFailedTestSuites} failed, ${result.numPassedTestSuites} passed, ${result.numTotalTestSuites} total`
    );
    console.log(
      `Tests:       ${result.numFailedTests} failed, ${result.numPassedTests} passed, ${result.numTotalTests} total`
    );
    console.log(`Snapshots:   ${result.numTotalSnapshots ?? 0} total`);
  } catch (error) {
    console.error('Failed to render filtered Jest output');
    process.exit(code ?? 1);
  } finally {
    try {
      fs.unlinkSync(outputFile);
    } catch {}
  }

  process.exit(code ?? 1);
});
