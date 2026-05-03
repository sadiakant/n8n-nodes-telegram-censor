import type { INodeExecutionData } from 'n8n-workflow';
import type { TelegramCensorRuntime, TelegramMessage } from '../shared/types';

export async function mediaRouter(
	runtime: TelegramCensorRuntime,
	operation: string,
	itemIndex: number,
): Promise<{ noMedia?: INodeExecutionData; success?: INodeExecutionData }> {
	switch (operation) {
		case 'downloadMedia':
			return await downloadMedia(runtime, itemIndex);
		default:
			runtime.fail(`Media operation not supported: ${operation}`, itemIndex);
	}
}

async function downloadMedia(
	runtime: TelegramCensorRuntime,
	itemIndex: number,
): Promise<{ noMedia?: INodeExecutionData; success?: INodeExecutionData }> {
	const { context, client } = runtime;
	const items = context.getInputData();
	const item = items[itemIndex];
	if (!item) {
		runtime.fail('Input item is missing.', itemIndex);
	}

	const chatId = context.getNodeParameter('downloadChatId', itemIndex, '') as string;
	const messageId = runtime.toInt(
		context.getNodeParameter('downloadMessageId', itemIndex, 0),
		'Message ID',
		itemIndex,
	);

	if (!chatId.trim()) {
		runtime.fail('Chat ID is required.', itemIndex);
	}

	const maxAttempts = 4;
	let attempt = 0;
	let buffer: Buffer | undefined;
	let messageWithMedia: TelegramMessage | undefined;

	while (attempt < maxAttempts && !buffer) {
		attempt += 1;

		const messages = await client.getMessages(chatId, { ids: [messageId] });
		const msg = messages[0];

		if (!msg?.media) {
			return {
				noMedia: runtime.makeLightweightItem(
					item.json,
					{
						messageId: item.json.messageId ?? messageId,
						chatId: item.json.chatId ?? chatId,
						date: item.json.date ?? null,
						text: item.json.text ?? null,
						hasMedia: false,
						mediaType: 'other',
						status: 'No Media',
						action: `No media found in message ID ${messageId}`,
						error: `No media found in message ID ${messageId}`,
					},
					itemIndex,
				),
			};
		}

		messageWithMedia = msg as unknown as TelegramMessage;

		try {
			const downloaded = await client.downloadMedia(msg, {});

			if (!downloaded) {
				runtime.fail(
					`Telegram returned empty media payload for message ID ${messageId}`,
					itemIndex,
				);
			}
			if (typeof downloaded === 'string') {
				runtime.fail(`Unexpected download output type for message ID ${messageId}`, itemIndex);
			}

			buffer = Buffer.isBuffer(downloaded)
				? downloaded
				: runtime.fail(`Unsupported media payload type for message ID ${messageId}`, itemIndex);
		} catch (error) {
			if (attempt >= maxAttempts || !runtime.isDownloadTimeoutError(error)) {
				throw error;
			}
			await runtime.sleepMs(attempt * 1200);
		}
	}

	if (!buffer) {
		runtime.fail(
			`Failed to download media for message ID ${messageId} after ${maxAttempts} attempts.`,
			itemIndex,
		);
	}

	const mediaMeta = runtime.getMediaMetadataFromMessage(messageWithMedia, messageId);
	const binaryData = await context.helpers.prepareBinaryData(buffer);
	binaryData.fileName = mediaMeta.fileName;
	binaryData.mimeType = mediaMeta.mimeType;

	return {
		success: {
			json: {
				messageId: item.json.messageId ?? messageId,
				chatId: item.json.chatId ?? chatId,
				date: item.json.date ?? null,
				text: item.json.text ?? null,
				hasMedia: item.json.hasMedia ?? true,
				mediaType: item.json.mediaType ?? mediaMeta.mediaType,
			},
			binary: { media: binaryData },
			pairedItem: { item: itemIndex },
		},
	};
}
