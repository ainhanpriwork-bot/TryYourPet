// Build the static site for Netlify: wrap tryyourpet.html in a full HTML document as dist/index.html
// and copy assets/. No dependencies, runs on any Node 18+.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let page = readFileSync(join(root, 'tryyourpet.html'), 'utf8');

// The page source is written as body content (the Claude artifact adds the document skeleton);
// lift its <title> into <head> and drop the artifact-only meta tag.
const title = (page.match(/<title>[\s\S]*?<\/title>/) || ['<title>TryYourPet</title>'])[0];
page = page.replace(title, '').replace(/<meta name="claude:[^>]*>\s*/g, '');

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${title}
<meta name="description" content="TryYourPet kết nối các trạm cứu hộ với cộng đồng để tìm mái nhà cho các bé chó, mèo ở TP.HCM, qua nhận nuôi hoặc hỗ trợ hiện kim, hiện vật.">
<link rel="icon" type="image/png" href="assets/dog-sit.png">
<style>
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
img{max-width:100%}
[hidden]{display:none!important}
</style>
</head>
<body>
${page.trim()}
</body>
</html>
`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), html);
cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
console.log('Built dist/index.html and dist/assets');
