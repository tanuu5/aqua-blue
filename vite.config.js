import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// 開発時だけ使う：ブラウザで撮ったスクリーンショットを shots/ に保存する（公開ビルドには含まれない）
function devShotWriter() {
  return {
    name: 'dev-shot-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w.-]/g, '_');
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          fs.mkdirSync('shots', { recursive: true });
          fs.writeFileSync(path.join('shots', name + (body.startsWith('data:image/jpeg') ? '.jpg' : '.png')), Buffer.from(b64, 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

// base: './' so the built site works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [devShotWriter()],
  server: { host: '127.0.0.1', port: 5175 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
