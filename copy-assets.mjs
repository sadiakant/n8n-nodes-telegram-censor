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

// Create dist/models directory if it doesn't exist
const modelsDir = join(distDir, 'models');
if (!existsSync(modelsDir)) {
  mkdirSync(modelsDir, { recursive: true });
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

// Copy the ONNX model to the dist directory
const srcModel = join('src/models', 'NudeNet-v3.4-weights-320n.onnx');
const destModel = join(distDir, 'models', 'NudeNet-v3.4-weights-320n.onnx');

if (existsSync(srcModel)) {
  copyFileSync(srcModel, destModel);
  console.log('Model copied successfully!');
} else {
  console.warn('Model not found in src/models directory');
}

console.log('Assets copied successfully!');
