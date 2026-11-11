import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'picklist.js', 'app.js']) await copyFile(file, `dist/${file}`);
await cp('samples', 'dist/samples', { recursive: true });
