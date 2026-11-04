// `npm run mock -w server` – a fake Moodle on http://localhost:4100 for trying the app locally.
import { applyScenario, startMockMoodle } from './mock-moodle';

const mock = await startMockMoodle({ port: Number(process.env.MOCK_PORT ?? 4100) });
console.log(`Mock Moodle running at ${mock.url}`);
console.log(`  login: ${mock.state.username} / ${mock.state.password}`);
console.log('  POST /__mock/scenario  -> move a deadline, add a recording and an announcement');

process.on('SIGUSR2', () => {
  applyScenario(mock.state);
  console.log('scenario applied');
});
