const { start, stop } = require('./helpers');
const { runAll, api } = require('./tests');

async function main() {
  const baseUrl = await start();
  console.log(`Test server running at ${baseUrl}\n`);

  console.log('Running tests...\n');
  const results = await runAll();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log('\n=========================================');
  console.log(`TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    for (const r of results.filter((x) => !x.ok)) {
      console.error(`  - ${r.name}`);
      console.error(`    ${r.error}`);
    }
  }

  await stop();
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Test run crashed:', err);
    process.exit(1);
  });
}