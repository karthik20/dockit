import { spawn } from 'node:child_process';

export default function mcp(root, positional, flags) {
  const httpPort = flags.port || process.env.DOCKIT_MCP_HTTP_PORT;
  const useHttp = flags.http || !!httpPort;

  if (useHttp) {
    const port = httpPort || 3456;
    console.log(`Starting Dockit MCP server (HTTP) on port ${port}...`);
    const env = { ...process.env, DOCKIT_MCP_HTTP_PORT: String(port) };

    const proc = spawn('npx', ['tsx', 'apps/server/src/mcp.ts'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env,
    });

    process.on('SIGINT', () => proc.kill());
    process.on('SIGTERM', () => proc.kill());
  } else {
    console.log('Starting Dockit MCP server (stdio)...');
    const proc = spawn('npx', ['tsx', 'apps/server/src/mcp.ts'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });

    process.on('SIGINT', () => proc.kill());
    process.on('SIGTERM', () => proc.kill());
  }
}
