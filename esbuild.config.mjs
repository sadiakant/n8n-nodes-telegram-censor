import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

// Helper to find all Node and Credential files in src
function findEntryPoints(dir) {
    const entries = [];
    const files = fs.readdirSync(dir, { recursive: true });
    
    for (const file of files) {
        // We only want specific entry files, not helpers
        if (file.endsWith('.node.ts') || file.endsWith('.credentials.ts')) {
            entries.push(path.join(dir, file));
        }
    }
    return entries;
}

const entryPoints = findEntryPoints('src');

console.log('Building files:', entryPoints);

esbuild.build({
    entryPoints: entryPoints,
    bundle: true,
    outdir: 'dist',
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    minify: false,
    // THE FIX IS HERE: We treat these as external dependencies
    external: [
        'n8n-workflow',
        'n8n-core',
        'sharp',
        'onnxruntime-node',
        'telegram'
    ],
}).catch(() => process.exit(1));