import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';
import { releaseModel } from '../../models/inference';
import { mediaRouter } from './resources/media.operations';
import { messageRouter } from './resources/message.operations';
import { moderationRouter } from './resources/moderation.operations';
import { createTelegramCensorRuntime } from './shared/runtime';
import type { TelegramCensorResource } from './shared/types';

const messageOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	displayOptions: { show: { resource: ['message'] } },
	options: [
		{
			name: 'Get Messages',
			value: 'getMessages',
			description: 'Get recent messages with optional time/date filter',
			action: 'Get messages',
		},
		{
			name: 'Replace Image',
			value: 'editMessage',
			description: 'Replace media in message (keep original text)',
			action: 'Replace image',
		},
		{
			name: 'Replace Text',
			value: 'editMessageText',
			description: 'Replace message text/caption without touching original media',
			action: 'Replace text',
		},
		{
			name: 'Send Message',
			value: 'sendMessage',
			description: 'Send a text message with optional media attachment',
			action: 'Send message',
		},
	],
	default: 'getMessages',
	noDataExpression: true,
};

const mediaOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	displayOptions: { show: { resource: ['media'] } },
	options: [
		{
			name: 'Download Media',
			value: 'downloadMedia',
			description: 'Download photo/document from message',
			action: 'Download media',
		},
	],
	default: 'downloadMedia',
	noDataExpression: true,
};

const moderationOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	displayOptions: { show: { resource: ['moderation'] } },
	options: [
		{
			name: 'Blur',
			value: 'nudeNetBlur',
			description: 'Blur only exposed private parts (NudeNet)',
			action: 'Blur',
		},
		{
			name: 'Scanner',
			value: 'nudeNetScanner',
			description: 'Detect exposed nudity using NudeNet (100% local)',
			action: 'Scanner',
		},
	],
	default: 'nudeNetScanner',
	noDataExpression: true,
};

const operationResourceMap: Record<string, TelegramCensorResource> = {
	getMessages: 'message',
	editMessage: 'message',
	editMessageText: 'message',
	sendMessage: 'message',
	downloadMedia: 'media',
	nudeNetScanner: 'moderation',
	nudeNetBlur: 'moderation',
};

const resolveOperationResource = (
	configuredResource: string,
	operation: string,
): TelegramCensorResource => {
	const inferredResource = operationResourceMap[operation];
	if (inferredResource) {
		return inferredResource;
	}

	if (
		configuredResource === 'message' ||
		configuredResource === 'media' ||
		configuredResource === 'moderation'
	) {
		return configuredResource;
	}

	return 'message';
};

const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Media', value: 'media' },
			{ name: 'Message', value: 'message' },
			{ name: 'Moderation', value: 'moderation' },
		],
		default: 'message',
	},
	messageOperations,
	mediaOperations,
	moderationOperations,
	{
		displayName: 'Chat ID',
		name: 'chatId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['getMessages'] } },
		placeholder: '-1001234567890 or @channelusername',
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		options: [
			{ name: 'Date Range', value: 'range' },
			{ name: 'Last X Hours', value: 'hours' },
			{ name: 'Recent Messages (Limit)', value: 'limit' },
		],
		default: 'limit',
		displayOptions: { show: { resource: ['message'], operation: ['getMessages'] } },
		noDataExpression: true,
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		description: 'Max number of results to return',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: {
			show: { resource: ['message'], operation: ['getMessages'], mode: ['limit'] },
		},
	},
	{
		displayName: 'Last Hours',
		name: 'hours',
		type: 'number',
		default: 24,
		typeOptions: { minValue: 1 },
		displayOptions: {
			show: { resource: ['message'], operation: ['getMessages'], mode: ['hours'] },
		},
	},
	{
		displayName: 'Max Messages',
		name: 'maxMessages',
		type: 'number',
		default: 500,
		typeOptions: { minValue: 1 },
		displayOptions: {
			show: { resource: ['message'], operation: ['getMessages'], mode: ['hours', 'range'] },
		},
		description: 'Safety cap for very active chats',
	},
	{
		displayName: 'From Date',
		name: 'fromDate',
		type: 'dateTime',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: ['getMessages'], mode: ['range'] },
		},
	},
	{
		displayName: 'To Date',
		name: 'toDate',
		type: 'dateTime',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: ['getMessages'], mode: ['range'] },
		},
	},
	{
		displayName: 'Has Media',
		name: 'onlyMedia',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['getMessages'] } },
		description: 'Whether to only return messages that contain media (photos, videos, documents)',
	},
	{
		displayName: 'Media Type',
		name: 'mediaType',
		type: 'multiOptions',
		options: [
			{ name: 'Photo', value: 'photo' },
			{ name: 'Video', value: 'video' },
			{ name: 'Document', value: 'document' },
		],
		default: [],
		displayOptions: {
			show: { resource: ['message'], operation: ['getMessages'], onlyMedia: [true] },
		},
		description: 'Filter by specific media types. Leave empty to allow all media.',
	},
	{
		displayName: 'Send to Saved Messages',
		name: 'sendToSelf',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['sendMessage'] } },
		description: 'Whether to send the message to your Saved Messages (me) and hide the chat field',
	},
	{
		displayName: 'Chat ID',
		name: 'sendChatId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['message'], operation: ['sendMessage'] },
			hide: { sendToSelf: [true] },
		},
		description: 'Username (@channel), invite link, or numeric ID',
	},
	{
		displayName: 'Message Text',
		name: 'sendText',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['message'], operation: ['sendMessage'] } },
	},
	{
		displayName: 'Parse Mode',
		name: 'sendParseMode',
		type: 'options',
		options: [
			{ name: 'HTML', value: 'html' },
			{ name: 'MarkdownV2', value: 'markdownv2' },
		],
		default: 'markdownv2',
		displayOptions: { show: { resource: ['message'], operation: ['sendMessage'] } },
		description: 'How Telegram should parse formatting in Message Text',
	},
	{
		displayName: 'Reply to Message (ID)',
		name: 'sendReplyTo',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 0 },
		displayOptions: { show: { resource: ['message'], operation: ['sendMessage'] } },
		description: 'The ID of the message to reply to',
	},
	{
		displayName: 'Show Web Preview',
		name: 'sendWebPreview',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['message'], operation: ['sendMessage'] } },
		description: 'Whether to enable link previews when the message contains URLs',
	},
	{
		displayName: 'Attach Media',
		name: 'sendAttachMedia',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['sendMessage'] } },
		description: 'Whether to upload a photo, video, or document with the message',
	},
	{
		displayName: 'Media Type',
		name: 'sendMediaType',
		type: 'options',
		options: [
			{ name: 'Auto Detect', value: 'auto', description: 'Infer from MIME type or URL extension' },
			{ name: 'Document', value: 'document' },
			{ name: 'Photo', value: 'photo' },
			{ name: 'Video', value: 'video' },
		],
		default: 'auto',
		displayOptions: {
			show: { resource: ['message'], operation: ['sendMessage'], sendAttachMedia: [true] },
		},
		description: 'Select the kind of media you are attaching',
	},
	{
		displayName: 'Binary Property',
		name: 'sendMediaBinaryProperty',
		type: 'string',
		default: 'data',
		displayOptions: {
			show: { resource: ['message'], operation: ['sendMessage'], sendAttachMedia: [true] },
		},
		description: 'Name of the binary property that contains the file to upload',
	},
	{
		displayName: 'Media URL',
		name: 'sendMediaUrl',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: ['sendMessage'], sendAttachMedia: [true] },
		},
		placeholder: 'https://example.com/file.jpg',
		description:
			'Optional direct URL. Used when binary data is not provided. Only public http/https URLs are allowed.',
	},
	{
		displayName: 'Chat ID',
		name: 'downloadChatId',
		type: 'string',
		default: '={{ $json.chatId }}',
		required: true,
		displayOptions: { show: { resource: ['media'], operation: ['downloadMedia'] } },
	},
	{
		displayName: 'Message ID',
		name: 'downloadMessageId',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 1 },
		required: true,
		displayOptions: { show: { resource: ['media'], operation: ['downloadMedia'] } },
	},
	{
		displayName: 'Chat ID',
		name: 'editChatId',
		type: 'string',
		default: '={{ $json.chatId }}',
		required: true,
		displayOptions: {
			show: { resource: ['message'], operation: ['editMessage', 'editMessageText'] },
		},
	},
	{
		displayName: 'Message ID',
		name: 'editMessageId',
		type: 'number',
		default: 0,
		typeOptions: { minValue: 1 },
		required: true,
		displayOptions: {
			show: { resource: ['message'], operation: ['editMessage', 'editMessageText'] },
		},
	},
	{
		displayName: 'Text / Caption',
		name: 'editText',
		type: 'string',
		default: '={{ $json.text }}',
		displayOptions: {
			show: { resource: ['message'], operation: ['editMessage', 'editMessageText'] },
		},
		description: 'Updates message text for text messages, or caption for media messages',
	},
	{
		displayName: 'Remove Media',
		name: 'editZeroMedia',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['message'], operation: ['editMessage'] } },
		description: 'Whether to remove media from the target message when Replace Media URL is empty',
	},
	{
		displayName: 'Replace Media URL',
		name: 'editMediaUrl',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: ['editMessage'] },
			hide: { editZeroMedia: [true] },
		},
		placeholder: 'https://example.com/file.jpg',
		description:
			'Direct URL of the new media file used to replace the current message media in Replace Image operation',
	},
	{
		displayName: 'Minimum Confidence',
		name: 'minConfidence',
		type: 'number',
		default: 0.4,
		displayOptions: { show: { resource: ['moderation'], operation: ['nudeNetScanner'] } },
		description: 'Only detect parts with confidence above this threshold (0.0 - 1.0)',
		typeOptions: { minValue: 0, maxValue: 1, numberStepSize: 0.05 },
	},
	{
		displayName: 'Blur Strength',
		name: 'blurStrength',
		type: 'number',
		default: 35,
		displayOptions: { show: { resource: ['moderation'], operation: ['nudeNetBlur'] } },
		description: 'Higher = more blur (recommended: 25-50)',
		typeOptions: { minValue: 1, maxValue: 100 },
	},
];

export class TelegramCensor implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram Censor',
		name: 'telegramCensor',
		icon: 'file:TelegramCensor.svg',
		group: ['organization'],
		version: 1,
		description:
			'Telegram Auto-Censor: Detects & blurs nudity using NudeNet (100% local, free forever)',
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		defaults: { name: 'Telegram Censor' },
		inputs: [NodeConnectionTypes.Main],
		outputs:
			'={{ $parameter["resource"] === "media" && $parameter["operation"] === "downloadMedia" ? ["main", "main"] : ["main"] }}',
		outputNames: ['Success', 'No Media'],
		credentials: [
			{
				name: 'telegramCensorCredentialsApi',
				required: true,
			},
		],
		properties,
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const successData: INodeExecutionData[] = [];
		const noMediaData: INodeExecutionData[] = [];
		let hasDownloadMediaOperation = false;
		const runtime = await createTelegramCensorRuntime(this);

		try {
			await runtime.connect();

			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (!item) continue;

				const operation = this.getNodeParameter('operation', i) as string;
				const configuredResource = this.getNodeParameter('resource', i, '') as string;
				const resource = resolveOperationResource(configuredResource, operation);

				try {
					if (resource === 'media' && operation === 'downloadMedia') {
						hasDownloadMediaOperation = true;
					}

					switch (resource) {
						case 'media': {
							const result = await mediaRouter(runtime, operation, i);
							if (result.success) successData.push(result.success);
							if (result.noMedia) noMediaData.push(result.noMedia);
							break;
						}
						case 'message': {
							successData.push(...(await messageRouter(runtime, operation, i)));
							break;
						}
						case 'moderation': {
							successData.push(...(await moderationRouter(runtime, operation, i)));
							break;
						}
						default:
							throw new NodeOperationError(
								this.getNode(),
								`Resource ${resource} is not supported.`,
								{
									itemIndex: i,
								},
							);
					}
				} catch (error) {
					if (this.continueOnFail()) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						successData.push(runtime.makeLightweightItem(item.json, { error: errorMessage }, i));
						continue;
					}
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
			}
		} finally {
			if (runtime.usedScannerOperation) {
				await releaseModel();
			}
			await runtime.dispose();
		}

		return hasDownloadMediaOperation ? [successData, noMediaData] : [successData];
	}
}
