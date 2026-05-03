import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { Readable } from 'stream';
import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	NodeOperationError,
} from 'n8n-workflow';
import { TelegramClient } from 'teleproto';
import { LogLevel, Logger } from 'teleproto/extensions/Logger';
import { StringSession } from 'teleproto/sessions';
import { renderTelegramEntities } from './messageFormatting';
import type {
	LightweightItemJson,
	MediaDownloadResult,
	TelegramCensorRuntime,
	TelegramDocumentAttribute,
	TelegramMediaType,
	TelegramMessage,
	TelegramMessageMedia,
} from './types';

type TelegramCredentialData = {
	apiId: string | number;
	apiHash: string;
	sessionString: string;
};

export async function createTelegramCensorRuntime(
	context: IExecuteFunctions,
): Promise<TelegramCensorRuntime> {
	const credentialNames = ['telegramCensorCredentialsApi', 'telegramCensorCredentials'] as const;
	let lastCredentialError: unknown;
	let credentials: TelegramCredentialData | undefined;

	for (const credentialName of credentialNames) {
		try {
			const resolved = await context.getCredentials(credentialName);
			const sessionString = (resolved.sessionString ?? resolved.session) as string | undefined;
			const apiHash = resolved.apiHash as string | undefined;
			const apiId = resolved.apiId as string | number | undefined;

			if (sessionString && apiHash && apiId !== undefined) {
				credentials = { apiId, apiHash, sessionString };
				break;
			}
		} catch (error) {
			lastCredentialError = error;
		}
	}

	if (!credentials) {
		throw new NodeOperationError(
			context.getNode(),
			lastCredentialError instanceof Error
				? lastCredentialError
				: 'Telegram Censor credentials are missing or could not be loaded.',
		);
	}

	const client = new TelegramClient(
		new StringSession(credentials.sessionString),
		Number(credentials.apiId),
		credentials.apiHash,
		{
			connectionRetries: 5,
			baseLogger: new Logger(LogLevel.NONE),
		},
	);

	const requestedTeleprotoLogLevel = (
		process.env.TELEGRAM_CENSOR_TELEPROTO_LOG_LEVEL ||
		process.env.TELEGRAM_CENSOR_GRAMJS_LOG_LEVEL ||
		''
	).toLowerCase();
	const resolvedTeleprotoLogLevel =
		requestedTeleprotoLogLevel === 'debug'
			? LogLevel.DEBUG
			: requestedTeleprotoLogLevel === 'info'
				? LogLevel.INFO
				: requestedTeleprotoLogLevel === 'warn' || requestedTeleprotoLogLevel === 'warning'
					? LogLevel.WARN
					: requestedTeleprotoLogLevel === 'error'
						? LogLevel.ERROR
						: requestedTeleprotoLogLevel === 'none'
							? LogLevel.NONE
							: process.env.N8N_LOG_LEVEL === 'debug'
								? LogLevel.WARN
								: LogLevel.NONE;

	client.setLogLevel(resolvedTeleprotoLogLevel);

	const fail = (message: string, itemIndex?: number): never => {
		throw new NodeOperationError(
			context.getNode(),
			message,
			itemIndex === undefined ? undefined : { itemIndex },
		);
	};

	const asLightweightJson = (json: IDataObject): LightweightItemJson => json as LightweightItemJson;

	const makeLightweightItem = (
		sourceJson: IDataObject,
		overrides: IDataObject = {},
		itemIndex: number,
	): INodeExecutionData => {
		const source = asLightweightJson(sourceJson);

		return {
			json: {
				messageId: source.messageId ?? null,
				chatId: source.chatId ?? null,
				date: source.date ?? null,
				text: source.text ?? null,
				rawText: source.rawText ?? null,
				hasMedia: source.hasMedia ?? null,
				mediaType: source.mediaType ?? null,
				isNsfw: source.isNsfw ?? null,
				nsfwParts: source.nsfwParts ?? null,
				detectionCount: source.detectionCount ?? null,
				blurred: source.blurred ?? null,
				status: source.status ?? null,
				...overrides,
			},
			pairedItem: { item: itemIndex },
		};
	};

	const toInt = (raw: unknown, label: string, itemIndex?: number): number => {
		const n = parseInt(String(raw), 10);
		if (isNaN(n) || n <= 0) {
			fail(`Invalid ${label}: "${raw}". Must be a positive integer.`, itemIndex);
		}
		return n;
	};

	const toFinitePositiveInt = (raw: string | undefined, fallback: number): number => {
		const n = Number(raw);
		return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
	};

	const parseDateToUnix = (raw: string, label: string, itemIndex?: number): number => {
		const millis = Date.parse(raw);
		if (Number.isNaN(millis)) {
			fail(`Invalid ${label}: "${raw}"`, itemIndex);
		}
		return Math.floor(millis / 1000);
	};

	const getUnixTimestamp = (rawDate: Date | number | undefined): number | undefined => {
		if (typeof rawDate === 'number') {
			return rawDate;
		}

		if (rawDate instanceof Date) {
			return Math.floor(rawDate.getTime() / 1000);
		}

		return undefined;
	};

	const sleepMs = async (ms: number): Promise<void> =>
		await new Promise((resolve) => setTimeout(resolve, ms));

	const isDownloadTimeoutError = (error: unknown): boolean => {
		if (!(error instanceof Error)) return false;

		const maybeRpcError = error as Error & { code?: number; errorMessage?: string };
		const code = typeof maybeRpcError.code === 'number' ? Math.abs(maybeRpcError.code) : undefined;
		const rawMessage =
			typeof maybeRpcError.errorMessage === 'string' ? maybeRpcError.errorMessage : error.message;
		const normalized = rawMessage.toLowerCase();

		return (
			code === 503 ||
			normalized.includes('timeout') ||
			normalized.includes('upload.getfile') ||
			normalized.includes('etimedout') ||
			normalized.includes('econnreset') ||
			normalized.includes('socket hang up') ||
			normalized.includes('eai_again') ||
			normalized.includes('invalid new nonce hash') ||
			normalized.includes('securityerror')
		);
	};

	const extractErrorMessage = (error: unknown): string => {
		if (error instanceof Error) {
			const maybeRpcError = error as Error & { errorMessage?: string };
			return maybeRpcError.errorMessage || error.message;
		}
		return String(error);
	};

	const isMediaInvalidError = (error: unknown): boolean =>
		extractErrorMessage(error).toUpperCase().includes('MEDIA_INVALID');

	const inferMediaTypeFromMime = (mime?: string): TelegramMediaType | undefined => {
		if (!mime) return undefined;
		if (mime.startsWith('image/')) return 'photo';
		if (mime.startsWith('video/')) return 'video';
		return 'document';
	};

	const inferMediaTypeFromUrl = (url: string): 'photo' | 'video' | 'document' => {
		const lower = url.toLowerCase();
		if (lower.match(/\.jpg|\.jpeg|\.png|\.gif|\.webp|\.heic|\.heif/)) return 'photo';
		if (lower.match(/\.mp4|\.mov|\.mkv|\.webm/)) return 'video';
		return 'document';
	};

	const extractMediaInfo = (
		media: TelegramMessageMedia | undefined,
	): { hasMedia: boolean; mediaType: TelegramMediaType } => {
		if (!media) return { hasMedia: false, mediaType: 'other' };
		if (media.photo || media.className === 'MessageMediaPhoto' || media._ === 'messageMediaPhoto') {
			return { hasMedia: true, mediaType: 'photo' };
		}

		const isDocumentMedia =
			media.document ||
			media.className === 'MessageMediaDocument' ||
			media._ === 'messageMediaDocument';
		if (isDocumentMedia) {
			const mimeType = media.document?.mimeType || '';
			if (mimeType.startsWith('video/')) return { hasMedia: true, mediaType: 'video' };
			return { hasMedia: true, mediaType: 'document' };
		}

		if (media.video || media.className === 'MessageMediaVideo' || media._ === 'messageMediaVideo') {
			return { hasMedia: true, mediaType: 'video' };
		}

		return { hasMedia: true, mediaType: 'other' };
	};

	const sanitizeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_').trim();

	const getExtensionForMime = (mimeType?: string): string => {
		switch (mimeType) {
			case 'image/jpeg':
				return '.jpg';
			case 'image/png':
				return '.png';
			case 'image/webp':
				return '.webp';
			case 'image/gif':
				return '.gif';
			case 'video/mp4':
				return '.mp4';
			case 'video/quicktime':
				return '.mov';
			case 'video/x-matroska':
				return '.mkv';
			case 'video/webm':
				return '.webm';
			default:
				return '';
		}
	};

	const getMediaMetadataFromMessage = (
		message: TelegramMessage | undefined,
		messageId: number,
	): { fileName: string; mimeType: string; mediaType: 'photo' | 'video' | 'document' } => {
		if (message?.media?.photo) {
			return {
				fileName: `media_${messageId}.jpg`,
				mimeType: 'image/jpeg',
				mediaType: 'photo',
			};
		}

		const doc = message?.media?.document;
		const mimeType =
			typeof doc?.mimeType === 'string' && doc.mimeType.trim() !== ''
				? doc.mimeType
				: 'application/octet-stream';

		const fileNameFromAttributes = Array.isArray(doc?.attributes)
			? (doc.attributes.find(
					(attr: TelegramDocumentAttribute) =>
						typeof attr?.fileName === 'string' && attr.fileName.trim() !== '',
				)?.fileName as string | undefined)
			: undefined;

		const baseName =
			sanitizeFileName(fileNameFromAttributes || `media_${messageId}`) || `media_${messageId}`;
		const hasExtension = baseName.includes('.');
		const fileName = hasExtension ? baseName : `${baseName}${getExtensionForMime(mimeType)}`;

		return {
			fileName,
			mimeType,
			mediaType:
				inferMediaTypeFromMime(mimeType) === 'video'
					? 'video'
					: inferMediaTypeFromMime(mimeType) === 'photo'
						? 'photo'
						: 'document',
		};
	};

	const getMessageText = (message: TelegramMessage | null | undefined, fallback = ''): string =>
		message?.message ?? message?.text ?? message?.caption ?? fallback;

	const getRichMessageText = (
		message: TelegramMessage | null | undefined,
		fallback = '',
	): string => {
		const text = getMessageText(message, fallback);
		return renderTelegramEntities(text, message?.entities);
	};

	const mediaUrlAllowList = (process.env.TELEGRAM_CENSOR_MEDIA_URL_ALLOWLIST || '')
		.split(',')
		.map((host) => host.trim().toLowerCase())
		.filter(Boolean);
	const allowPrivateMediaUrls = process.env.TELEGRAM_CENSOR_ALLOW_PRIVATE_MEDIA_URLS === 'true';
	const defaultDownloadTimeoutMs = 15_000;
	const defaultDownloadMaxBytes = 25 * 1024 * 1024;

	const isPrivateIpv4 = (ip: string): boolean => {
		const parts = ip.split('.').map((part) => Number(part));
		if (
			parts.length !== 4 ||
			parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
		) {
			return true;
		}

		const [a, b] = parts;
		return (
			a === 10 ||
			a === 127 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127) ||
			a === 0
		);
	};

	const isPrivateIpAddress = (address: string): boolean => {
		const normalized = address.toLowerCase();
		const family = isIP(normalized);
		if (!family) return true;

		if (family === 4) {
			return isPrivateIpv4(normalized);
		}

		const mappedIpv4Prefix = '::ffff:';
		if (normalized.startsWith(mappedIpv4Prefix)) {
			return isPrivateIpv4(normalized.slice(mappedIpv4Prefix.length));
		}

		return (
			normalized === '::1' ||
			normalized === '::' ||
			normalized.startsWith('fc') ||
			normalized.startsWith('fd') ||
			normalized.startsWith('fe80:')
		);
	};

	const isHostAllowed = (hostName: string): boolean => {
		if (mediaUrlAllowList.length === 0) return true;
		const normalized = hostName.toLowerCase();
		return mediaUrlAllowList.some(
			(allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`),
		);
	};

	const assertHostIsSafe = async (hostName: string): Promise<void> => {
		const normalizedHost = hostName.toLowerCase();

		if (!isHostAllowed(normalizedHost)) {
			fail(`Media URL host "${normalizedHost}" is not in TELEGRAM_CENSOR_MEDIA_URL_ALLOWLIST.`);
		}

		if (allowPrivateMediaUrls) return;

		if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')) {
			fail(`Blocked private Media URL host "${hostName}".`);
		}

		if (isIP(normalizedHost)) {
			if (isPrivateIpAddress(normalizedHost)) {
				fail(`Blocked private Media URL IP "${hostName}".`);
			}
			return;
		}

		let addresses: Array<{ address: string }> = [];
		try {
			addresses = await lookup(normalizedHost, { all: true, verbatim: true });
		} catch (error) {
			fail(
				`Failed to resolve Media URL host "${hostName}": ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		if (!addresses.length) {
			fail(`Failed to resolve Media URL host "${hostName}".`);
		}

		if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
			fail(`Blocked Media URL host "${hostName}" because it resolves to a private or local IP.`);
		}
	};

	const validateMediaUrl = async (rawUrl: string): Promise<URL> => {
		const parsed = (() => {
			try {
				return new URL(rawUrl);
			} catch {
				return fail(`Invalid Media URL: "${rawUrl}".`);
			}
		})();

		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			fail(`Unsupported Media URL protocol "${parsed.protocol}". Only http/https are allowed.`);
		}

		await assertHostIsSafe(parsed.hostname);
		return parsed;
	};

	const downloadUrlToBuffer = async (url: string): Promise<MediaDownloadResult> => {
		const parsedUrl = await validateMediaUrl(url);
		const timeoutMs = toFinitePositiveInt(
			process.env.TELEGRAM_CENSOR_MEDIA_URL_TIMEOUT_MS,
			defaultDownloadTimeoutMs,
		);
		const maxBytes = toFinitePositiveInt(
			process.env.TELEGRAM_CENSOR_MEDIA_URL_MAX_BYTES,
			defaultDownloadMaxBytes,
		);

		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

		const fetchMediaResponse = async (): Promise<Response> => {
			try {
				return await fetch(parsedUrl.toString(), {
					signal: controller.signal,
					redirect: 'follow',
				});
			} catch (error) {
				if (error instanceof Error && error.name === 'AbortError') {
					return fail(`Media URL download timed out after ${timeoutMs}ms.`);
				}
				return fail(
					`Failed to download media from URL: ${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				clearTimeout(timeoutHandle);
			}
		};

		const response = await fetchMediaResponse();
		const finalUrl = await validateMediaUrl(response.url || parsedUrl.toString());

		if (!response.ok) {
			fail(`Failed to download media from URL: ${response.status} ${response.statusText}`);
		}

		const contentLength = Number(response.headers.get('content-length'));
		if (Number.isFinite(contentLength) && contentLength > maxBytes) {
			fail(
				`Media URL file is too large (${contentLength} bytes). Max allowed is ${maxBytes} bytes.`,
			);
		}

		if (!response.body) {
			fail('Media URL response body is empty.');
		}

		const chunks: Buffer[] = [];
		let totalBytes = 0;
		const stream = Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>);

		for await (const chunk of stream) {
			const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			totalBytes += asBuffer.length;

			if (totalBytes > maxBytes) {
				fail(`Media URL file exceeded max allowed size of ${maxBytes} bytes.`);
			}

			chunks.push(asBuffer);
		}

		if (totalBytes === 0) {
			fail('Media URL returned an empty file.');
		}

		const buffer = Buffer.concat(chunks, totalBytes);
		const mimeType = response.headers.get('content-type') || undefined;
		const disposition = response.headers.get('content-disposition');

		let fileName: string | undefined;
		if (disposition) {
			const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
			if (encodedMatch?.[1]) {
				try {
					fileName = decodeURIComponent(encodedMatch[1]);
				} catch {
					fileName = encodedMatch[1];
				}
			} else {
				const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
				if (plainMatch?.[1]) {
					fileName = plainMatch[1];
				}
			}
		}

		if (!fileName) {
			fileName = finalUrl.pathname.split('/').filter(Boolean).pop();
		}

		if (fileName) {
			fileName = sanitizeFileName(fileName);
		}

		return { buffer, mimeType, fileName };
	};

	const connect = async (): Promise<void> => {
		try {
			await client.connect();
		} catch (error) {
			throw new NodeOperationError(
				context.getNode(),
				`Failed to connect to Telegram: ${error instanceof Error ? error.message : error}`,
			);
		}
	};

	const dispose = async (): Promise<void> => {
		try {
			await client.disconnect();
			await client.destroy();
		} catch {
			// Ignore cleanup errors
		}
	};

	return {
		context,
		client,
		usedScannerOperation: false,
		makeLightweightItem,
		toInt,
		parseDateToUnix,
		getUnixTimestamp,
		sleepMs,
		isDownloadTimeoutError,
		extractErrorMessage,
		isMediaInvalidError,
		inferMediaTypeFromMime,
		inferMediaTypeFromUrl,
		extractMediaInfo,
		getExtensionForMime,
		getMediaMetadataFromMessage,
		getMessageText,
		getRichMessageText,
		downloadUrlToBuffer,
		fail,
		isNudeDetection: (value: unknown): value is { box: [number, number, number, number] } => {
			if (typeof value !== 'object' || value === null) {
				return false;
			}

			const box = (value as { box?: unknown }).box;
			return Array.isArray(box) && box.length === 4;
		},
		connect,
		dispose,
	};
}
