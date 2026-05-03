import * as ort from 'onnxruntime-web';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

type OrtLogLevel = Exclude<ort.Env['logLevel'], undefined>;
const ORT_LOG_LEVELS: OrtLogLevel[] = ['verbose', 'info', 'warning', 'error', 'fatal'];

const isDebugMode = process.env.N8N_LOG_LEVEL === 'debug';

// Keep ORT quiet in normal mode to avoid benign startup warnings in n8n logs.
if (!process.env.ORT_LOG_SEVERITY_LEVEL) {
	process.env.ORT_LOG_SEVERITY_LEVEL = isDebugMode ? '2' : '3';
}

const requestedOrtLogLevel = process.env.TELEGRAM_CENSOR_ORT_LOG_LEVEL;
if (requestedOrtLogLevel && ORT_LOG_LEVELS.includes(requestedOrtLogLevel as OrtLogLevel)) {
	ort.env.logLevel = requestedOrtLogLevel as OrtLogLevel;
} else {
	ort.env.logLevel = isDebugMode ? 'warning' : 'error';
}

// --- OPTIMIZATION #1: Disable Sharp Cache ---
// Sharp keeps decompressed images in memory by default.
// We must disable this for low-RAM environments.
sharp.cache(false);
sharp.simd(true); // Keep SIMD for speed, it doesn't cost much RAM

// --- Configuration ---
const MODEL_PATH = path.join(__dirname, 'NudeNet-v3.4-weights-320n.onnx');
const EXPECTED_MODEL_SIZE = 12_150_158; // Known-good NudeNet v3.4-320n file size in bytes
const MODEL_SIZE_TOLERANCE = 0.05; // 5% tolerance for minor version differences

// ─── Validate at startup (fail fast with clear message) ──────────────────────
if (!fs.existsSync(MODEL_PATH)) {
	// Show both what was expected and what actually exists to help debug
	const modelsDir = __dirname;
	const dirExists = fs.existsSync(modelsDir);
	const dirContents = dirExists
		? fs.readdirSync(modelsDir).join(', ') || '(empty)'
		: '(directory missing)';

	throw new Error(
		`[TelegramCensor] Model file not found.\n` +
			`Expected path : ${MODEL_PATH}\n` +
			`Models folder : ${dirExists ? 'EXISTS' : 'MISSING'} → contents: ${dirContents}\n` +
			`__dirname     : ${__dirname}\n\n` +
			`Fix: Run "npm run build" which copies models to dist/models/`,
	);
}

const INPUT_SIZE = 320;

const LABELS = [
	'FEMALE_GENITALIA_COVERED',
	'FACE_FEMALE',
	'BUTTOCKS_EXPOSED',
	'FEMALE_BREAST_EXPOSED',
	'FEMALE_GENITALIA_EXPOSED',
	'MALE_BREAST_EXPOSED',
	'ANUS_EXPOSED',
	'FEET_EXPOSED',
	'BELLY_COVERED',
	'FEET_COVERED',
	'ARMPITS_COVERED',
	'ARMPITS_EXPOSED',
	'FACE_MALE',
	'BELLY_EXPOSED',
	'MALE_GENITALIA_EXPOSED',
	'ANUS_COVERED',
	'FEMALE_BREAST_COVERED',
	'BUTTOCKS_COVERED',
];

const UNSAFE_CLASSES = new Set([
	'FEMALE_GENITALIA_EXPOSED',
	'MALE_GENITALIA_EXPOSED',
	'BUTTOCKS_EXPOSED',
	'FEMALE_BREAST_EXPOSED',
	'MALE_BREAST_EXPOSED',
	'ANUS_EXPOSED',
]);

const DEFAULT_MIN_CONFIDENCE = 0.4;
const CHW_SIZE = INPUT_SIZE * INPUT_SIZE * 3;
const chwPool: Float32Array[] = [];

function acquireChwBuffer() {
	return chwPool.pop() ?? new Float32Array(CHW_SIZE);
}

function releaseChwBuffer(buf: Float32Array) {
	chwPool.push(buf);
}

export interface NudeDetection {
	class: string;
	score: number;
	box: [number, number, number, number]; // [x1, y1, x2, y2]
}

interface BoundingBox {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	score: number;
	class: string;
}

// Global session variable
let session: ort.InferenceSession | null = null;

function logMemory(stage: string) {
	if (process.env.N8N_LOG_LEVEL === 'debug') {
		const used = process.memoryUsage().rss / 1024 / 1024;
		process.stderr.write(`[TelegramCensor] Memory ${stage}: ${Math.round(used * 100) / 100} MB\n`);
	}
}

function validateModelFile(): void {
	if (!fs.existsSync(MODEL_PATH)) {
		throw new Error(
			`[TelegramCensor] Model file not found at ${MODEL_PATH}. ` +
				`Make sure the "models" folder exists in the package root.`,
		);
	}

	const stat = fs.statSync(MODEL_PATH);
	const actualSize = stat.size;
	const maxAllowed = EXPECTED_MODEL_SIZE * (1 + MODEL_SIZE_TOLERANCE);

	// If the file is significantly larger than expected, it's likely corrupted
	// (e.g. the build process appended instead of replacing)
	if (actualSize > maxAllowed) {
		throw new Error(
			`[TelegramCensor] Model file appears corrupted.\n` +
				`Expected size : ~${EXPECTED_MODEL_SIZE} bytes\n` +
				`Actual size   : ${actualSize} bytes\n` +
				`File path     : ${MODEL_PATH}\n\n` +
				`The model file is ${Math.round((actualSize / EXPECTED_MODEL_SIZE) * 100)}% of expected size. ` +
				`This usually happens when the build process appends data instead of replacing.\n` +
				`Fix: Delete the dist/models/ folder and run "npm run build" again.`,
		);
	}

	// If it's suspiciously small (e.g. a Git LFS pointer), also warn
	if (actualSize < 1024) {
		throw new Error(
			`[TelegramCensor] Model file is too small (${actualSize} bytes).\n` +
				`This may be a Git LFS pointer instead of the actual model.\n` +
				`File path: ${MODEL_PATH}\n\n` +
				`Fix: Run "git lfs pull" to download the actual model file.`,
		);
	}
}

async function loadModel() {
	if (session) return session;

	validateModelFile();
	logMemory('Pre-Load');

	const options: ort.InferenceSession.SessionOptions = {
		enableCpuMemArena: false,
		enableMemPattern: false,
		graphOptimizationLevel: 'basic',
		intraOpNumThreads: 1,
		interOpNumThreads: 1,
		// Use 'wasm' for compatibility with Alpine Linux/n8n Docker
		executionProviders: ['wasm'],
	};

	try {
		session = await ort.InferenceSession.create(MODEL_PATH, options);
	} catch (loadError) {
		const errorMessage = loadError instanceof Error ? loadError.message : String(loadError);

		// Protobuf parsing failures are almost always caused by a corrupted model file
		if (errorMessage.includes('protobuf') || errorMessage.includes('ERROR_CODE: 7')) {
			const stat = fs.statSync(MODEL_PATH);
			throw new Error(
				`[TelegramCensor] Failed to load ONNX model — protobuf parsing failed.\n` +
					`Model path    : ${MODEL_PATH}\n` +
					`File size     : ${stat.size} bytes (expected ~${EXPECTED_MODEL_SIZE})\n\n` +
					`This is usually caused by a corrupted model file.\n` +
					`Fix: Delete the dist/models/ folder and run "npm run build" again.\n` +
					`Original error: ${errorMessage}`,
			);
		}

		throw loadError;
	}

	logMemory('Post-Load');
	return session;
}

/**
 * Aggressive cleanup
 */
export async function releaseModel() {
	if (session) {
		const maybeReleasableSession = session as ort.InferenceSession & {
			release?: () => Promise<void> | void;
		};
		if (typeof maybeReleasableSession.release === 'function') {
			await maybeReleasableSession.release();
		}
		session = null;

		// Hint V8 to cleanup if flags enabled (usually not in prod, but harmless)
		if (global.gc) global.gc();

		logMemory('Unloaded');
	}
}

export async function detectNudity(
	buffer: Buffer,
	minConfidence = DEFAULT_MIN_CONFIDENCE,
): Promise<NudeDetection[]> {
	// Scope the session usage tightly
	const inferenceSession = await loadModel();

	// 1. Preprocessing with Sharp
	const img = sharp(buffer);
	const metadata = await img.metadata();

	const origW = metadata.width!;
	const origH = metadata.height!;

	// Resize to raw buffer (Interleaved RGB: R G B R G B...)
	const resizedBuffer = await img
		.resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
		.removeAlpha()
		.raw()
		.toBuffer();

	// --- OPTIMIZATION #2: Zero-Copy Normalization ---
	// Previous code allocated an intermediate Float32Array for normalization (0-1).
	// We now write directly from uint8 buffer to the CHW tensor buffer.
	// This saves 1x memory allocation of size (320*320*3*4 bytes).

	const chwData = acquireChwBuffer();
	const pixelCount = INPUT_SIZE * INPUT_SIZE;

	for (let i = 0; i < pixelCount; i++) {
		// Source index (Interleaved RGB)
		const srcIdx = i * 3;

		// Normalize (0-255 -> 0.0-1.0) and reorder to CHW (RRR...GGG...BBB...) on the fly
		chwData[i] = resizedBuffer[srcIdx] / 255.0; // R
		chwData[i + pixelCount] = resizedBuffer[srcIdx + 1] / 255.0; // G
		chwData[i + pixelCount * 2] = resizedBuffer[srcIdx + 2] / 255.0; // B
	}

	let output: ort.Tensor | undefined;
	try {
		// 4. Inference
		const tensor = new ort.Tensor('float32', chwData, [1, 3, INPUT_SIZE, INPUT_SIZE]);

		// Run inference
		const feeds: Record<string, ort.Tensor> = {};
		feeds[inferenceSession.inputNames[0]] = tensor;

		const results = await inferenceSession.run(feeds);
		output = results[inferenceSession.outputNames[0]];
	} finally {
		releaseChwBuffer(chwData);
	}

	if (!output) {
		throw new Error('Model output tensor missing.');
	}

	// 5. Cleanup Tensor immediately
	// (Let JS GC handle 'tensor' and 'chwData' as they go out of scope)

	// 6. Post-Processing
	const data = output.data as Float32Array;
	const dims = output.dims; // [1, 22, 2100]

	const rows = dims[1]; // 22 classes
	const cols = dims[2]; // 2100 anchors

	let boxes: BoundingBox[] = [];

	// Optimized loop
	for (let c = 0; c < cols; c++) {
		let maxScore = 0;
		let maxClassIdx = -1;

		// Find class with max score
		for (let r = 4; r < rows; r++) {
			const score = data[r * cols + c];
			if (score > maxScore) {
				maxScore = score;
				maxClassIdx = r - 4;
			}
		}

		if (maxScore < minConfidence) continue;

		const cx = data[0 * cols + c];
		const cy = data[1 * cols + c];
		const w = data[2 * cols + c];
		const h = data[3 * cols + c];

		const label = LABELS[maxClassIdx];

		if (UNSAFE_CLASSES.has(label)) {
			boxes.push({
				x1: cx - w / 2,
				y1: cy - h / 2,
				x2: cx + w / 2,
				y2: cy + h / 2,
				score: maxScore,
				class: label,
			});
		}
	}

	boxes = nms(boxes, 0.45);

	// Scale Boxes
	const scaleX = origW / INPUT_SIZE;
	const scaleY = origH / INPUT_SIZE;

	return boxes.map((b) => ({
		class: b.class,
		score: b.score,
		box: [
			Math.max(0, b.x1 * scaleX),
			Math.max(0, b.y1 * scaleY),
			Math.min(origW, b.x2 * scaleX),
			Math.min(origH, b.y2 * scaleY),
		],
	}));
}

function nms(boxes: BoundingBox[], iouThreshold: number): BoundingBox[] {
	if (boxes.length === 0) return [];
	boxes.sort((a, b) => b.score - a.score);
	const picked: BoundingBox[] = [];
	while (boxes.length > 0) {
		const current = boxes.shift();
		if (!current) {
			break;
		}
		picked.push(current);
		boxes = boxes.filter((b) => calculateIoU(current, b) < iouThreshold);
	}
	return picked;
}

function calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
	const xA = Math.max(boxA.x1, boxB.x1);
	const yA = Math.max(boxA.y1, boxB.y1);
	const xB = Math.min(boxA.x2, boxB.x2);
	const yB = Math.min(boxA.y2, boxB.y2);
	const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
	const boxAArea = (boxA.x2 - boxA.x1) * (boxA.y2 - boxA.y1);
	const boxBArea = (boxB.x2 - boxB.x1) * (boxB.y2 - boxB.y1);
	return interArea / (boxAArea + boxBArea - interArea);
}

export async function blurNudity(
	buffer: Buffer,
	detections: NudeDetection[],
	blurStrength = 35,
): Promise<Buffer> {
	if (!detections || detections.length === 0) return buffer;
	const image = sharp(buffer); // Cache is disabled globally, so this is safe
	const metadata = await image.metadata();
	const composites: sharp.OverlayOptions[] = [];
	const sigma = Math.max(0.3, Math.min(100, blurStrength));

	for (const det of detections) {
		const [x1, y1, rawX2, rawY2] = det.box.map(Math.round);
		const width = metadata.width ?? 0;
		const height = metadata.height ?? 0;
		const x2 = Math.min(width, rawX2);
		const y2 = Math.min(height, rawY2);

		if (x2 - x1 < 2 || y2 - y1 < 2) continue;

		const region = await image
			.clone()
			.extract({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 })
			.blur(sigma)
			.modulate({ brightness: 0.9 })
			.toBuffer();
		composites.push({ input: region, left: x1, top: y1 });
	}
	return composites.length > 0 ? await image.composite(composites).toBuffer() : buffer;
}
