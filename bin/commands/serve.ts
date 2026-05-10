import { spawn } from 'node:child_process';

export default function serve(root, positional, flags) {
  const port = flags.port || process.env.PORT || 3001;
  console.log(`Starting Dockit production server on port ${port}...`);
  console.log('');

  const env = { ...process.env, PORT: String(port) };

  const server = spawn('npm', ['run', 'start', '-w', 'apps/server'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env,
  });

  process.on('SIGINT', () => server.kill());
  process.on('SIGTERM', () => server.kill());

  server.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
  });
}
