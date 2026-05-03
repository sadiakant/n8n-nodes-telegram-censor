import type { IDataObject, INodeExecutionData } from 'n8n-workflow';
import { blurNudity, detectNudity } from '../../../models/inference';
import type { TelegramCensorRuntime } from '../shared/types';

export async function moderationRouter(
	runtime: TelegramCensorRuntime,
	operation: string,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	switch (operation) {
		case 'nudeNetBlur':
			return [await blurMedia(runtime, itemIndex)];
		case 'nudeNetScanner':
			return [await scanMedia(runtime, itemIndex)];
		default:
			runtime.fail(`Moderation operation not supported: ${operation}`, itemIndex);
	}
}

async function scanMedia(
	runtime: TelegramCensorRuntime,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const { context } = runtime;
	const items = context.getInputData();
	const item = items[itemIndex];
	if (!item) {
		runtime.fail('Input item is missing.', itemIndex);
	}

	runtime.usedScannerOperation = true;
	const minConfidence = context.getNodeParameter('minConfidence', itemIndex, 0.4) as number;

	if (!context.helpers.assertBinaryData(itemIndex, 'media')) {
		runtime.fail(
			'Missing binary data property "media". Connect a Download Media node first.',
			itemIndex,
		);
	}

	const inputMediaMime = item.binary?.media?.mimeType as string | undefined;
	if (inputMediaMime && !inputMediaMime.startsWith('image/')) {
		runtime.fail(
			`Scanner supports only image inputs. Received mime type: "${inputMediaMime}".`,
			itemIndex,
		);
	}

	const buffer = await context.helpers.getBinaryDataBuffer(itemIndex, 'media');
	const detections = await detectNudity(buffer, minConfidence);
	const isNsfw = detections.length > 0;

	if (!isNsfw) {
		return {
			json: {
				messageId: item.json.messageId,
				chatId: item.json.chatId,
				date: item.json.date,
				text: item.json.text,
				hasMedia: item.json.hasMedia,
				mediaType: item.json.mediaType,
				isNsfw: false,
				nsfwParts: [],
				detections: [],
				detectionCount: 0,
			},
			pairedItem: { item: itemIndex },
		};
	}

	const binaryProperty = await context.helpers.prepareBinaryData(buffer);
	const sourceExtension = runtime.getExtensionForMime(inputMediaMime) || '.jpg';
	binaryProperty.fileName = `original_${item.json.messageId}${sourceExtension}`;
	binaryProperty.mimeType = inputMediaMime || 'image/jpeg';

	return {
		json: {
			messageId: item.json.messageId,
			chatId: item.json.chatId,
			date: item.json.date,
			text: item.json.text,
			hasMedia: item.json.hasMedia,
			mediaType: item.json.mediaType,
			isNsfw: true,
			nsfwParts: detections.map((d): string => d.class),
			detections: detections.map(
				(d): IDataObject => ({
					class: d.class,
					score: d.score,
					box: d.box,
				}),
			),
			detectionCount: detections.length,
		},
		binary: { media: binaryProperty },
		pairedItem: { item: itemIndex },
	};
}

async function blurMedia(
	runtime: TelegramCensorRuntime,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const { context } = runtime;
	const items = context.getInputData();
	const item = items[itemIndex];
	if (!item) {
		runtime.fail('Input item is missing.', itemIndex);
	}

	if (!context.helpers.assertBinaryData(itemIndex, 'media')) {
		runtime.fail('Missing binary data property "media". Connect a Scanner node first.', itemIndex);
	}

	const buffer = await context.helpers.getBinaryDataBuffer(itemIndex, 'media');
	const detections = Array.isArray(item.json.detections)
		? item.json.detections.filter(runtime.isNudeDetection)
		: [];
	const blurStrength = context.getNodeParameter('blurStrength', itemIndex, 35) as number;
	const sourceMimeType = item.binary?.media?.mimeType as string | undefined;

	let resultBuffer = buffer;
	if (detections.length > 0) {
		resultBuffer = await blurNudity(buffer, detections, blurStrength);
	}

	const binaryData = await context.helpers.prepareBinaryData(resultBuffer);
	const outputExtension = runtime.getExtensionForMime(sourceMimeType) || '.jpg';
	binaryData.fileName = `safe_${item.json.messageId}${outputExtension}`;
	binaryData.mimeType = sourceMimeType || 'image/jpeg';

	return {
		json: {
			messageId: item.json.messageId,
			chatId: item.json.chatId,
			date: item.json.date,
			text: item.json.text,
			isNsfw: item.json.isNsfw,
			nsfwParts: item.json.nsfwParts,
			blurred: detections.length > 0,
			status: detections.length > 0 ? 'Blurred' : 'Safe (no action)',
			detectionCount: item.json.detectionCount,
		},
		binary: { media: binaryData },
		pairedItem: { item: itemIndex },
	};
}
