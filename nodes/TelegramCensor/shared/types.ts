import type { IDataObject, IBinaryData, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { TelegramClient } from 'teleproto';

export type TelegramCensorResource = 'media' | 'message' | 'moderation';
export type TelegramMediaType = 'document' | 'other' | 'photo' | 'video';

export interface TelegramDocumentAttribute {
	fileName?: string;
}

export interface TelegramDocument {
	mimeType?: string;
	attributes?: TelegramDocumentAttribute[];
}

export interface TelegramMessageMedia {
	photo?: unknown;
	document?: TelegramDocument;
	video?: unknown;
	className?: string;
	_?: string;
}

export interface TelegramReplyInfo {
	replyToMsgId?: number;
}

export interface TelegramMessage {
	id?: number;
	date?: Date | number;
	message?: string;
	text?: string;
	caption?: string;
	media?: TelegramMessageMedia;
	replyTo?: TelegramReplyInfo;
	replyToMsgId?: number;
	entities?: unknown[];
	_?: string;
}

export interface LightweightItemJson extends IDataObject {
	messageId?: number | null;
	chatId?: string | null;
	date?: string | null;
	text?: string | null;
	rawText?: string | null;
	hasMedia?: boolean | null;
	mediaType?: TelegramMediaType | null;
	isNsfw?: boolean | null;
	nsfwParts?: string[] | null;
	detectionCount?: number | null;
	blurred?: boolean | null;
	status?: string | null;
	detections?: IDataObject[];
}

export interface MediaDownloadResult {
	buffer: Buffer;
	mimeType?: string;
	fileName?: string;
}

export interface TelegramCensorRuntime {
	context: IExecuteFunctions;
	client: TelegramClient;
	usedScannerOperation: boolean;
	makeLightweightItem: (
		sourceJson: IDataObject,
		overrides: IDataObject | undefined,
		itemIndex: number,
	) => INodeExecutionData;
	toInt: (raw: unknown, label: string, itemIndex?: number) => number;
	parseDateToUnix: (raw: string, label: string, itemIndex?: number) => number;
	getUnixTimestamp: (rawDate: Date | number | undefined) => number | undefined;
	sleepMs: (ms: number) => Promise<void>;
	isDownloadTimeoutError: (error: unknown) => boolean;
	extractErrorMessage: (error: unknown) => string;
	isMediaInvalidError: (error: unknown) => boolean;
	inferMediaTypeFromMime: (mime?: string) => TelegramMediaType | undefined;
	inferMediaTypeFromUrl: (url: string) => Exclude<TelegramMediaType, 'other'>;
	extractMediaInfo: (media: TelegramMessageMedia | undefined) => {
		hasMedia: boolean;
		mediaType: TelegramMediaType;
	};
	getExtensionForMime: (mimeType?: string) => string;
	getMediaMetadataFromMessage: (
		message: TelegramMessage | undefined,
		messageId: number,
	) => { fileName: string; mimeType: string; mediaType: 'photo' | 'video' | 'document' };
	getMessageText: (message: TelegramMessage | null | undefined, fallback?: string) => string;
	getRichMessageText: (message: TelegramMessage | null | undefined, fallback?: string) => string;
	downloadUrlToBuffer: (url: string) => Promise<MediaDownloadResult>;
	fail: (message: string, itemIndex?: number) => never;
	isNudeDetection: (value: unknown) => value is { box: [number, number, number, number] };
	connect: () => Promise<void>;
	dispose: () => Promise<void>;
}

export interface BinaryEntry {
	name: string;
	data: IBinaryData;
}
