import { spawn } from 'node:child_process';

export default function dev(root, positional, flags) {
  console.log('Starting Dockit dev servers...');
  console.log('');

  const server = spawn('npx', ['tsx', 'watch', 'apps/server/src/index.ts'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });

  const client = spawn('npx', ['vite', 'apps/client'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });

  const cleanup = () => {
    server.kill();
    client.kill();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  server.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    cleanup();
  });

  client.on('close', (code) => {
    console.log(`Client exited with code ${code}`);
    cleanup();
  });
}
