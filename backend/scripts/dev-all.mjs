// Поднимает API и бота одной командой: npm run dev:all
import { spawn } from 'node:child_process';

const processes = [
  { name: 'api', args: ['tsx', 'watch', 'src/index.ts'] },
  { name: 'bot', args: ['tsx', 'watch', 'src/bot/index.ts'] },
];

const pipe = (stream, target, name) => {
  stream.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim()) target.write(`[${name}] ${line}\n`);
    }
  });
};

const children = processes.map(({ name, args }) => {
  // shell: true — иначе на Windows spawn не находит npx (он там npx.cmd).
  const child = spawn('npx', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    shell: true,
  });

  child.on('error', (error) => {
    console.error(`[${name}] не удалось запустить: ${error.message}`);
    console.error(`[${name}] запусти вручную: npm run ${name === 'api' ? 'dev' : 'bot'}`);
  });
  pipe(child.stdout, process.stdout, name);
  pipe(child.stderr, process.stderr, name);
  child.on('exit', (code) => console.log(`[${name}] завершился с кодом ${code}`));
  return child;
});

const stop = () => children.forEach((child) => child.kill('SIGINT'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
