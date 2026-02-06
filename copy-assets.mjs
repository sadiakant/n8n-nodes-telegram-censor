import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Create dist directory if it doesn't exist
const distDir = 'dist';
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Create dist/icons directory if it doesn't exist
const iconsDir = join(distDir, 'icons');
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// Create dist/nodes/icons directory if it doesn't exist
const nodesIconsDir = join(distDir, 'icons');
if (!existsSync(nodesIconsDir)) {
  mkdirSync(nodesIconsDir, { recursive: true });
}

// Copy the SVG icon to the dist directory
const srcIcon = join('src/icons', 'telegram-censor.svg');
const destIcon = join(distDir, 'icons', 'telegram-censor.svg');

if (existsSync(srcIcon)) {
  copyFileSync(srcIcon, destIcon);
  console.log('SVG icon copied successfully!');
} else {
  console.warn('SVG icon not found in src directory');
}

console.log('Assets copied successfully!');
