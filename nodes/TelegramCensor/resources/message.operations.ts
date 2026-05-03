import { Api } from 'teleproto';
import { CustomFile } from 'teleproto/client/uploads';
import type { IDataObject, IBinaryData, INodeExecutionData } from 'n8n-workflow';
import { prepareTelegramTextInput } from '../shared/messageFormatting';
import type { BinaryEntry, TelegramCensorRuntime, TelegramMessage } from '../shared/types';

export async function messageRouter(
	runtime: TelegramCensorRuntime,
	operation: string,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	switch (operation) {
		case 'editMessage':
			return [await editMessage(runtime, itemIndex)];
		case 'editMessageText':
			return [await editMessageText(runtime, itemIndex)];
		case 'getMessages':
			return await getMessages(runtime, itemIndex);
		case 'sendMessage':
			return [await sendMessage(runtime, itemIndex)];
		default:
			runtime.fail(`Message operation not supported: ${operation}`, itemIndex);
	}
}

async function getMessageById(
	runtime: TelegramCensorRuntime,
	chatId: string,
	messageId: number,
): Promise<TelegramMessage | undefined> {
	const messages = (await runtime.client.getMessages(chatId, {
		ids: [messageId],
	})) as unknown as TelegramMessage[];
	return Array.isArray(messages) ? messages[0] : undefined;
}

async function getMessages(
	runtime: TelegramCensorRuntime,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const { context, client } = runtime;
	const chatId = context.getNodeParameter('chatId', itemIndex, '') as string;
	const mode = context.getNodeParameter('mode', itemIndex, 'limit') as string;
	const maxMessages = runtime.toInt(
		context.getNodeParameter('maxMessages', itemIndex, 500),
		'Max Messages',
		itemIndex,
	);
	const onlyMedia = context.getNodeParameter('onlyMedia', itemIndex, false) as boolean;
	const mediaTypes = context.getNodeParameter('mediaType', itemIndex, []) as string[];

	if (!chatId.trim()) {
		runtime.fail('Chat ID is required.', itemIndex);
	}

	const iterOptions: { limit: number } = { limit: maxMessages };
	let messages: TelegramMessage[] = [];

	if (mode === 'limit') {
		const limit = runtime.toInt(
			context.getNodeParameter('limit', itemIndex, 50),
			'Limit',
			itemIndex,
		);
		messages = (await client.getMessages(chatId, { limit })) as unknown as TelegramMessage[];
	} else if (mode === 'hours') {
		const hours = runtime.toInt(
			context.getNodeParameter('hours', itemIndex, 24),
			'Last Hours',
			itemIndex,
		);
		const cutoffTime = Math.floor(Date.now() / 1000) - hours * 3600;
		for await (const msg of client.iterMessages(
			chatId,
			iterOptions,
		) as AsyncIterable<TelegramMessage>) {
			const messageTimestamp = runtime.getUnixTimestamp(msg.date);
			if (messageTimestamp === undefined) continue;
			if (messageTimestamp < cutoffTime) break;
			messages.push(msg);
		}
	} else if (mode === 'range') {
		const fromDateStr = context.getNodeParameter('fromDate', itemIndex, '') as string;
		const toDateStr = context.getNodeParameter('toDate', itemIndex, '') as string;
		const fromTime = fromDateStr ? runtime.parseDateToUnix(fromDateStr, 'From Date', itemIndex) : 0;
		const toTime = toDateStr
			? runtime.parseDateToUnix(toDateStr, 'To Date', itemIndex)
			: Math.floor(Date.now() / 1000);
		if (fromTime > toTime) {
			runtime.fail('From Date must be earlier than or equal to To Date.', itemIndex);
		}

		for await (const msg of client.iterMessages(
			chatId,
			iterOptions,
		) as AsyncIterable<TelegramMessage>) {
			const messageTimestamp = runtime.getUnixTimestamp(msg.date);
			if (messageTimestamp === undefined) continue;
			if (messageTimestamp > toTime) continue;
			if (messageTimestamp < fromTime) break;
			messages.push(msg);
		}
	}

	const results: INodeExecutionData[] = [];
	for (const msg of messages) {
		if (!msg || msg._ === 'MessageEmpty') continue;

		const isPhoto = !!msg.media?.photo;
		const isDocument = !!msg.media?.document;
		const documentMimeType =
			msg.media?.document && 'mimeType' in msg.media.document
				? msg.media.document.mimeType
				: undefined;
		const isVideo = !!msg.media?.video || (isDocument && documentMimeType?.includes('video'));
		const hasMedia = isPhoto || isDocument || isVideo || !!msg.media;
		const messageTimestamp = runtime.getUnixTimestamp(msg.date);

		if (onlyMedia && !hasMedia) continue;
		if (messageTimestamp === undefined) continue;

		if (onlyMedia && mediaTypes.length > 0) {
			let match = false;
			if (mediaTypes.includes('photo') && isPhoto) match = true;
			if (mediaTypes.includes('video') && isVideo) match = true;
			if (mediaTypes.includes('document') && isDocument && !isVideo) match = true;
			if (!match) continue;
		}

		results.push({
			json: {
				messageId: msg.id,
				chatId,
				date: new Date(messageTimestamp * 1000).toISOString(),
				text: runtime.getRichMessageText(msg),
				rawText: runtime.getMessageText(msg),
				hasMedia,
				mediaType: isPhoto ? 'photo' : isVideo ? 'video' : isDocument ? 'document' : 'other',
			},
			pairedItem: { item: itemIndex },
		});
	}

	return results;
}

async function sendMessage(
	runtime: TelegramCensorRuntime,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const { context, client } = runtime;
	const items = context.getInputData();
	const item = items[itemIndex];
	if (!item) {
		runtime.fail('Input item is missing.', itemIndex);
	}

	const sendToSelf = context.getNodeParameter('sendToSelf', itemIndex, false) as boolean;
	const chatId = sendToSelf
		? 'me'
		: (context.getNodeParameter('sendChatId', itemIndex, '') as string);
	const text = context.getNodeParameter('sendText', itemIndex, '') as string;
	const parseMode = context.getNodeParameter('sendParseMode', itemIndex, 'markdownv2') as
		| 'html'
		| 'markdownv2';
	const replyTo = context.getNodeParameter('sendReplyTo', itemIndex, 0) as number;
	const webPreview = context.getNodeParameter('sendWebPreview', itemIndex, true) as boolean;
	const attachMedia = context.getNodeParameter('sendAttachMedia', itemIndex, false) as boolean;
	const formattedInput = prepareTelegramTextInput(text);

	if (!sendToSelf && !chatId.trim()) {
		runtime.fail('Chat ID is required when "Send to Saved Messages" is disabled.', itemIndex);
	}

	let fileToSend: CustomFile | undefined;
	let hasMedia = false;
	let mediaType = 'other';

	if (attachMedia) {
		const selectedType = context.getNodeParameter('sendMediaType', itemIndex, 'auto') as
			| 'auto'
			| 'document'
			| 'photo'
			| 'video';
		const binaryProperty = context.getNodeParameter(
			'sendMediaBinaryProperty',
			itemIndex,
			'data',
		) as string;
		const mediaUrl = context.getNodeParameter('sendMediaUrl', itemIndex, '') as string;
		const binaryData = item.binary?.[binaryProperty];
		const detectMediaType = selectedType === 'auto';

		if (binaryData) {
			const buffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryProperty);
			const fileName = binaryData.fileName || `upload_${Date.now()}`;
			fileToSend = new CustomFile(fileName, buffer.length, '', buffer);
			hasMedia = true;
			mediaType = detectMediaType
				? runtime.inferMediaTypeFromMime(binaryData.mimeType) || 'document'
				: selectedType;
		} else if (mediaUrl.trim() !== '') {
			const { buffer, mimeType, fileName } = await runtime.downloadUrlToBuffer(mediaUrl);
			const safeName = fileName || `upload_${Date.now()}`;
			fileToSend = new CustomFile(safeName, buffer.length, '', buffer);
			hasMedia = true;
			mediaType = detectMediaType
				? runtime.inferMediaTypeFromMime(mimeType) ||
					runtime.inferMediaTypeFromUrl(mediaUrl) ||
					'document'
				: selectedType;
		} else {
			runtime.fail(
				`Binary property "${binaryProperty}" is missing or empty and no Media URL provided.`,
				itemIndex,
			);
		}
	}

	const sendResult = await client.sendMessage(chatId, {
		message: formattedInput.text,
		parseMode: formattedInput.formattingEntities
			? undefined
			: (formattedInput.parseMode ?? parseMode),
		formattingEntities: formattedInput.formattingEntities,
		replyTo: replyTo > 0 ? replyTo : undefined,
		linkPreview: webPreview,
		file: fileToSend,
	});

	const sentMessage = (Array.isArray(sendResult) ? sendResult[0] : sendResult) as
		| TelegramMessage
		| undefined;
	const messageMediaInfo = runtime.extractMediaInfo(sentMessage?.media);
	const finalHasMedia = hasMedia || messageMediaInfo.hasMedia;
	const finalMediaType = hasMedia ? mediaType : messageMediaInfo.mediaType;
	const detailedMessage =
		sentMessage?.id !== undefined
			? await getMessageById(runtime, chatId, sentMessage.id)
			: sentMessage;

	const sentDateRaw = sentMessage?.date;
	const sentDateIso =
		typeof sentDateRaw === 'number'
			? new Date(sentDateRaw * 1000).toISOString()
			: sentDateRaw instanceof Date
				? sentDateRaw.toISOString()
				: new Date().toISOString();

	return runtime.makeLightweightItem(
		item.json,
		{
			messageId: sentMessage?.id ?? null,
			chatId,
			date: sentDateIso,
			text: runtime.getRichMessageText(
				detailedMessage,
				runtime.getRichMessageText(sentMessage, text),
			),
			rawText: runtime.getMessageText(detailedMessage, runtime.getMessageText(sentMessage, text)),
			hasMedia: finalHasMedia,
			mediaType: finalHasMedia ? finalMediaType : 'other',
			status: 'Success',
			action: 'Message sent',
			isReply: replyTo > 0 || !!sentMessage?.replyTo?.replyToMsgId,
			replyToId: sentMessage?.replyTo?.replyToMsgId ?? (replyTo > 0 ? replyTo : null),
		} as IDataObject,
		itemIndex,
	);
}

async function editMessage(
	runtime: TelegramCensorRuntime,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const { context, client } = runtime;
	const items = context.getInputData();
	const item = items[itemIndex];
	if (!item) {
		runtime.fail('Input item is missing.', itemIndex);
	}

	const chatId = context.getNodeParameter('editChatId', itemIndex, '') as string;
	const messageId = runtime.toInt(
		context.getNodeParameter('editMessageId', itemIndex, 0),
		'Message ID',
		itemIndex,
	);
	const text = context.getNodeParameter('editText', itemIndex, '') as string;
	const caption = typeof text === 'string' ? text : String(text ?? '');
	const formattedCaption = prepareTelegramTextInput(caption);
	const editZeroMedia = context.getNodeParameter('editZeroMedia', itemIndex, false) as boolean;
	const editMediaUrl = context.getNodeParameter('editMediaUrl', itemIndex, '') as string;
	const hasReplaceMediaUrl = editMediaUrl.trim() !== '';
	const binaryEntries: BinaryEntry[] = Object.entries(item.binary ?? {}).map(([name, data]) => ({
		name,
		data: data as IBinaryData,
	}));
	const preferredBinaryEntry =
		binaryEntries.find((entry) => entry.name === 'media') || binaryEntries[0];
	const inputBinaryProperty = preferredBinaryEntry?.name;
	const inputBinaryData = preferredBinaryEntry?.data;
	const hasInputBinary = !!inputBinaryProperty && !!inputBinaryData;

	if (!chatId.trim()) {
		runtime.fail('Chat ID is required.', itemIndex);
	}

	let action = 'Media replaced from input binary';
	if (hasReplaceMediaUrl) {
		const { buffer, fileName, mimeType } = await runtime.downloadUrlToBuffer(editMediaUrl.trim());
		const urlExtension = runtime.getExtensionForMime(mimeType);
		const resolvedFileName = fileName || `replace_${Date.now()}${urlExtension || ''}`;
		const fileToUpload = new CustomFile(resolvedFileName, buffer.length, '', buffer);
		const uploaded = await client.uploadFile({ file: fileToUpload, workers: 1 });

		await client.editMessage(chatId, {
			message: messageId,
			text: formattedCaption.text,
			parseMode: formattedCaption.formattingEntities ? undefined : formattedCaption.parseMode,
			formattingEntities: formattedCaption.formattingEntities,
			file: uploaded,
		});
		action = 'Media replaced from URL';
	} else if (editZeroMedia) {
		const peer = await client.getInputEntity(chatId);
		const zeroMediaRetryBackoffMs = [300, 700, 1200];
		const maxAttempts = zeroMediaRetryBackoffMs.length + 1;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				await client.invoke(
					new Api.messages.EditMessage({
						peer,
						id: messageId,
						message: caption,
						media: new Api.InputMediaEmpty(),
					}),
				);

				action = 'Media removed from message';
				lastError = undefined;
				break;
			} catch (error) {
				lastError = error;
				if (attempt < maxAttempts) {
					await runtime.sleepMs(zeroMediaRetryBackoffMs[attempt - 1]);
				}
			}
		}

		if (lastError) {
			if (runtime.isMediaInvalidError(lastError)) {
				try {
					await client.deleteMessages(chatId, [messageId], { revoke: true });

					if (caption.trim() !== '') {
						await client.sendMessage(chatId, {
							message: formattedCaption.text,
							parseMode: formattedCaption.formattingEntities
								? undefined
								: formattedCaption.parseMode,
							formattingEntities: formattedCaption.formattingEntities,
						});
						action = 'Original media message deleted and caption posted as new message';
					} else {
						action = 'Original media message deleted';
					}
				} catch (fallbackError) {
					const original = runtime.extractErrorMessage(lastError);
					const fallback = runtime.extractErrorMessage(fallbackError);
					runtime.fail(
						`Zero Media failed after ${maxAttempts} attempts (${original}). Fallback delete/send also failed: ${fallback}`,
						itemIndex,
					);
				}
			} else {
				const errorMessage = runtime.extractErrorMessage(lastError);
				runtime.fail(
					`Zero Media failed after ${maxAttempts} attempts. Telegram API response: ${errorMessage}`,
					itemIndex,
				);
			}
		}
	} else if (hasInputBinary) {
		const selectedBinaryProperty = inputBinaryProperty as string;
		const selectedBinaryData = inputBinaryData as {
			fileName?: string;
			mimeType?: string;
		};
		const buffer = await context.helpers.getBinaryDataBuffer(itemIndex, selectedBinaryProperty);
		const binaryExtension = runtime.getExtensionForMime(selectedBinaryData.mimeType);
		const resolvedFileName =
			selectedBinaryData.fileName || `replace_${Date.now()}${binaryExtension || ''}`;
		const fileToUpload = new CustomFile(resolvedFileName, buffer.length, '', buffer);
		const uploaded = await client.uploadFile({ file: fileToUpload, workers: 1 });

		await client.editMessage(chatId, {
			message: messageId,
			text: formattedCaption.text,
			parseMode: formattedCaption.formattingEntities ? undefined : formattedCaption.parseMode,
			formattingEntities: formattedCaption.formattingEntities,
			file: uploaded,
		});
		action = `Media replaced with input binary "${selectedBinaryProperty}"`;
	} else {
		await client.editMessage(chatId, {
			message: messageId,
			text: formattedCaption.text,
			parseMode: formattedCaption.formattingEntities ? undefined : formattedCaption.parseMode,
			formattingEntities: formattedCaption.formattingEntities,
		});
		action = 'Message text/caption updated';
	}

	const detailedMessage = await getMessageById(runtime, chatId, messageId);

	const wasBlurred = item.json.blurred === true || Number(item.json.detectionCount ?? 0) > 0;

	return runtime.makeLightweightItem(
		item.json,
		{
			status: 'Success',
			action,
			blurred: wasBlurred,
			text: runtime.getRichMessageText(detailedMessage, caption),
			rawText: runtime.getMessageText(detailedMessage, caption),
		} as IDataObject,
		itemIndex,
	);
}

async function editMessageText(
	runtime: TelegramCensorRuntime,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const { context, client } = runtime;
	const items = context.getInputData();
	const item = items[itemIndex];
	if (!item) {
		runtime.fail('Input item is missing.', itemIndex);
	}

	const chatId = context.getNodeParameter('editChatId', itemIndex, '') as string;
	const messageId = runtime.toInt(
		context.getNodeParameter('editMessageId', itemIndex, 0),
		'Message ID',
		itemIndex,
	);
	const text = context.getNodeParameter('editText', itemIndex, '') as string;
	const caption = typeof text === 'string' ? text : String(text ?? '');
	const formattedCaption = prepareTelegramTextInput(caption);

	if (!chatId.trim()) {
		runtime.fail('Chat ID is required.', itemIndex);
	}

	await client.editMessage(chatId, {
		message: messageId,
		text: formattedCaption.text,
		parseMode: formattedCaption.formattingEntities ? undefined : formattedCaption.parseMode,
		formattingEntities: formattedCaption.formattingEntities,
	});

	const detailedMessage = await getMessageById(runtime, chatId, messageId);

	const wasBlurred = item.json.blurred === true || Number(item.json.detectionCount ?? 0) > 0;

	return runtime.makeLightweightItem(
		item.json,
		{
			status: 'Success',
			action: 'Message text/caption replaced',
			blurred: wasBlurred,
			text: runtime.getRichMessageText(detailedMessage, caption),
			rawText: runtime.getMessageText(detailedMessage, caption),
		} as IDataObject,
		itemIndex,
	);
}
