import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, NodeOperationError } from 'n8n-workflow';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { Readable } from 'stream';
import { TelegramClient } from 'telegram';
import { LogLevel, Logger } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import { detectNudity, blurNudity, releaseModel } from '../../inference';

export class TelegramCensor implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Telegram Censor',
    name: 'telegramCensor',
    icon: 'file:telegram-censor.svg',
    group: ['organization'],
    version: 1,
    description: 'Telegram Auto-Censor: Detects & blurs nudity using NudeNet (100% local, free forever)',
    defaults: { name: 'Telegram Censor' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'telegramCensorCredentials', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          { name: 'Get Messages',  value: 'getMessages',     description: 'Get recent messages with optional time/date filter' },
          { name: 'Send Message',  value: 'sendMessage',     description: 'Send a text message with optional media attachment' },
          { name: 'Download Media',value: 'downloadMedia',   description: 'Download photo/document from message' },
          { name: 'Scanner',       value: 'nudeNetScanner',  description: 'Detect exposed nudity using NudeNet (100% local)' },
          { name: 'Blur',          value: 'nudeNetBlur',     description: 'Blur only exposed private parts (NudeNet)' },
          { name: 'Replace Image', value: 'editMessage',     description: 'Replace media in message (keep original text)' },
        ],
        default: 'getMessages',
        description: 'The operation to perform',
        noDataExpression: true,
      },

      // ─── Get Messages ────────────────────────────────────────────────────────
      {
        displayName: 'Chat ID',
        name: 'chatId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['getMessages'] } },
        placeholder: '-1001234567890 or @channelusername',
      },
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        options: [
          { name: 'Recent Messages (Limit)', value: 'limit' },
          { name: 'Last X Hours',            value: 'hours' },
          { name: 'Date Range',              value: 'range' },
        ],
        default: 'limit',
        displayOptions: { show: { operation: ['getMessages'] } },
        noDataExpression: true,
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        typeOptions: { minValue: 1 },
        displayOptions: { show: { operation: ['getMessages'], mode: ['limit'] } },
      },
      {
        displayName: 'Last Hours',
        name: 'hours',
        type: 'number',
        default: 24,
        typeOptions: { minValue: 1 },
        displayOptions: { show: { operation: ['getMessages'], mode: ['hours'] } },
      },
      {
        displayName: 'Max Messages',
        name: 'maxMessages',
        type: 'number',
        default: 500,
        typeOptions: { minValue: 1 },
        displayOptions: { show: { operation: ['getMessages'], mode: ['hours', 'range'] } },
        description: 'Safety cap for very active chats',
      },
      {
        displayName: 'From Date',
        name: 'fromDate',
        type: 'dateTime',
        default: '',
        displayOptions: { show: { operation: ['getMessages'], mode: ['range'] } },
      },
      {
        displayName: 'To Date',
        name: 'toDate',
        type: 'dateTime',
        default: '',
        displayOptions: { show: { operation: ['getMessages'], mode: ['range'] } },
      },
      {
        displayName: 'Has Media',
        name: 'onlyMedia',
        type: 'boolean',
        default: false,
        displayOptions: { show: { operation: ['getMessages'] } },
        description: 'Whether to only return messages that contain media (photos, videos, documents)',
      },
      {
        displayName: 'Media Type',
        name: 'mediaType',
        type: 'multiOptions',
        options: [
          { name: 'Photo',    value: 'photo'    },
          { name: 'Video',    value: 'video'    },
          { name: 'Document', value: 'document' },
        ],
        default: [],
        displayOptions: { show: { operation: ['getMessages'], onlyMedia: [true] } },
        description: 'Filter by specific media types. Leave empty to allow all media.',
      },

      // ─── Send Message ───────────────────────────────────────────────────────
      {
        displayName: 'Send to Saved Messages',
        name: 'sendToSelf',
        type: 'boolean',
        default: false,
        displayOptions: { show: { operation: ['sendMessage'] } },
        description: 'If enabled, message is sent to your Saved Messages (me) and the chat field is hidden',
      },
      {
        displayName: 'Chat ID',
        name: 'sendChatId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: { operation: ['sendMessage'] },
          hide: { sendToSelf: [true] },
        },
        description: 'Username (@channel), invite link, or numeric ID',
      },
      {
        displayName: 'Message Text',
        name: 'sendText',
        type: 'string',
        default: '',
        displayOptions: { show: { operation: ['sendMessage'] } },
      },
      {
        displayName: 'Reply to Message (ID)',
        name: 'sendReplyTo',
        type: 'number',
        default: 0,
        typeOptions: { minValue: 0 },
        displayOptions: { show: { operation: ['sendMessage'] } },
        description: 'The ID of the message to reply to',
      },
      {
        displayName: 'Show Web Preview',
        name: 'sendWebPreview',
        type: 'boolean',
        default: true,
        displayOptions: { show: { operation: ['sendMessage'] } },
        description: 'Enable link previews when the message contains URLs',
      },
      {
        displayName: 'Attach Media',
        name: 'sendAttachMedia',
        type: 'boolean',
        default: false,
        displayOptions: { show: { operation: ['sendMessage'] } },
        description: 'Upload a photo, video, or document with the message',
      },
      {
        displayName: 'Media Type',
        name: 'sendMediaType',
        type: 'options',
        options: [
          { name: 'Auto Detect', value: 'auto', description: 'Infer from MIME type or URL extension' },
          { name: 'Photo',    value: 'photo'    },
          { name: 'Video',    value: 'video'    },
          { name: 'Document', value: 'document' },
        ],
        default: 'auto',
        displayOptions: { show: { operation: ['sendMessage'], sendAttachMedia: [true] } },
        description: 'Select the kind of media you are attaching',
      },
      {
        displayName: 'Binary Property',
        name: 'sendMediaBinaryProperty',
        type: 'string',
        default: 'data',
        displayOptions: { show: { operation: ['sendMessage'], sendAttachMedia: [true] } },
        description: 'Name of the binary property that contains the file to upload',
      },
      {
        displayName: 'Media URL',
        name: 'sendMediaUrl',
        type: 'string',
        default: '',
        displayOptions: { show: { operation: ['sendMessage'], sendAttachMedia: [true] } },
        placeholder: 'https://example.com/file.jpg',
        description: 'Optional direct URL. Used when binary data is not provided. Only public http/https URLs are allowed.',
      },

      // ─── Download Media ───────────────────────────────────────────────────────
      {
        displayName: 'Chat ID',
        name: 'downloadChatId',
        type: 'string',
        default: '={{ $json.chatId }}',
        required: true,
        displayOptions: { show: { operation: ['downloadMedia'] } },
      },
      {
        displayName: 'Message ID',
        name: 'downloadMessageId',
        type: 'number',
        default: 0,
        typeOptions: { minValue: 1 },
        required: true,
        displayOptions: { show: { operation: ['downloadMedia'] } },
      },

      // ─── Edit Message ─────────────────────────────────────────────────────────
      {
        displayName: 'Chat ID',
        name: 'editChatId',
        type: 'string',
        default: '={{ $json.chatId }}',
        required: true,
        displayOptions: { show: { operation: ['editMessage'] } },
      },
      {
        displayName: 'Message ID',
        name: 'editMessageId',
        type: 'number',
        default: 0,
        typeOptions: { minValue: 1 },
        required: true,
        displayOptions: { show: { operation: ['editMessage'] } },
      },
      {
        displayName: 'Text (Caption)',
        name: 'editText',
        type: 'string',
        default: '={{ $json.text }}',
        displayOptions: { show: { operation: ['editMessage'] } },
      },

      // ─── NudeNet Scanner ──────────────────────────────────────────────────────
      {
        displayName: 'Minimum Confidence',
        name: 'minConfidence',
        type: 'number',
        default: 0.4,
        displayOptions: { show: { operation: ['nudeNetScanner'] } },
        description: 'Only detect parts with confidence above this threshold (0.0 - 1.0)',
        typeOptions: { minValue: 0, maxValue: 1, numberStepSize: 0.05 },
      },

      // ─── NudeNet Blur ─────────────────────────────────────────────────────────
      {
        displayName: 'Blur Strength',
        name: 'blurStrength',
        type: 'number',
        default: 35,
        displayOptions: { show: { operation: ['nudeNetBlur'] } },
        description: 'Higher = more blur (recommended: 25-50)',
        typeOptions: { minValue: 1, maxValue: 100 },
      },
    ],
  };
	// eslint-disable-next-line no-unused-vars
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items        = this.getInputData();
    const successData: INodeExecutionData[] = [];
    const credentials  = await this.getCredentials('telegramCensorCredentials');

    const client = new TelegramClient(
      new StringSession(credentials.sessionString as string),
      Number(credentials.apiId),
      credentials.apiHash as string,
      {
        connectionRetries: 5,
        useWSS: false,
        // Suppress constructor-time GramJS INFO logs (e.g., "Running gramJS version ...").
        baseLogger: new Logger(LogLevel.NONE),
      },
    );

    const requestedGramJsLogLevel = (process.env.TELEGRAM_CENSOR_GRAMJS_LOG_LEVEL || '').toLowerCase();
    const resolvedGramJsLogLevel =
      requestedGramJsLogLevel === 'debug' ? LogLevel.DEBUG :
      requestedGramJsLogLevel === 'info' ? LogLevel.INFO :
      requestedGramJsLogLevel === 'warn' || requestedGramJsLogLevel === 'warning' ? LogLevel.WARN :
      requestedGramJsLogLevel === 'error' ? LogLevel.ERROR :
      requestedGramJsLogLevel === 'none' ? LogLevel.NONE :
      process.env.N8N_LOG_LEVEL === 'debug' ? LogLevel.WARN : LogLevel.NONE;

    client.setLogLevel(resolvedGramJsLogLevel);

    let usedScannerOperation = false;

    // ─── Helper: build a lightweight JSON-only output item ──────────────────────
    // KEY FIX: This helper strips ALL binary data and only keeps safe scalar fields.
    // This prevents binary image buffers from accumulating in loop iterations.
    const makeLightweightItem = (
      sourceJson: Record<string, any>,
      overrides: Record<string, any> = {},
      itemIndex: number,
    ): INodeExecutionData => ({
      json: {
        // Only carry these safe scalar fields - never objects/arrays with binary refs
        messageId  : sourceJson.messageId   ?? null,
        chatId     : sourceJson.chatId      ?? null,
        date       : sourceJson.date        ?? null,
        text       : sourceJson.text        ?? null,
        hasMedia   : sourceJson.hasMedia    ?? null,
        mediaType  : sourceJson.mediaType   ?? null,
        isNsfw     : sourceJson.isNsfw      ?? null,
        nsfwParts  : sourceJson.nsfwParts   ?? null,
        detectionCount: sourceJson.detectionCount ?? null,
        blurred    : sourceJson.blurred     ?? null,
        status     : sourceJson.status      ?? null,
        // Apply any operation-specific overrides on top
        ...overrides,
      },
      // binary is intentionally OMITTED here
      pairedItem: { item: itemIndex },
    });

    // ─── Helper: safe integer parse ──────────────────────────────────────────────
    const toInt = (raw: unknown, label: string): number => {
      const n = parseInt(String(raw), 10);
      if (isNaN(n) || n <= 0) {
        throw new Error(`Invalid ${label}: "${raw}". Must be a positive integer.`);
      }
      return n;
    };

    const toFinitePositiveInt = (raw: string | undefined, fallback: number): number => {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };

    const parseDateToUnix = (raw: string, label: string): number => {
      const millis = Date.parse(raw);
      if (Number.isNaN(millis)) {
        throw new Error(`Invalid ${label}: "${raw}"`);
      }
      return Math.floor(millis / 1000);
    };

    const sleepMs = async (ms: number): Promise<void> =>
      await new Promise((resolve) => setTimeout(resolve, ms));

    const isDownloadTimeoutError = (error: unknown): boolean => {
      if (!(error instanceof Error)) return false;

      const maybeRpcError = error as Error & { code?: number; errorMessage?: string };
      const code = typeof maybeRpcError.code === 'number' ? Math.abs(maybeRpcError.code) : undefined;
      const rawMessage = typeof maybeRpcError.errorMessage === 'string' ? maybeRpcError.errorMessage : error.message;
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

    const inferMediaTypeFromMime = (mime?: string): 'photo' | 'video' | 'document' | undefined => {
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

    const extractMediaInfo = (media: any): { hasMedia: boolean; mediaType: string } => {
      if (!media) return { hasMedia: false, mediaType: 'other' };
      if (media.photo || media.className === 'MessageMediaPhoto' || media._ === 'messageMediaPhoto') {
        return { hasMedia: true, mediaType: 'photo' };
      }

      const isDocumentMedia = media.document || media.className === 'MessageMediaDocument' || media._ === 'messageMediaDocument';
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

    const sanitizeFileName = (name: string): string =>
      name.replace(/[\\/:*?"<>|]/g, '_').trim();

    const getExtensionForMime = (mimeType?: string): string => {
      switch (mimeType) {
        case 'image/jpeg': return '.jpg';
        case 'image/png': return '.png';
        case 'image/webp': return '.webp';
        case 'image/gif': return '.gif';
        case 'video/mp4': return '.mp4';
        case 'video/quicktime': return '.mov';
        case 'video/x-matroska': return '.mkv';
        case 'video/webm': return '.webm';
        default: return '';
      }
    };

    const getMediaMetadataFromMessage = (
      message: any,
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
        ? doc.attributes.find((attr: any) => typeof attr?.fileName === 'string' && attr.fileName.trim() !== '')?.fileName as string | undefined
        : undefined;

      const baseName = sanitizeFileName(fileNameFromAttributes || `media_${messageId}`) || `media_${messageId}`;
      const hasExtension = baseName.includes('.');
      const fileName = hasExtension ? baseName : `${baseName}${getExtensionForMime(mimeType)}`;

      return {
        fileName,
        mimeType,
        mediaType: inferMediaTypeFromMime(mimeType) || 'document',
      };
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
      if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
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
        throw new Error(`Media URL host "${normalizedHost}" is not in TELEGRAM_CENSOR_MEDIA_URL_ALLOWLIST.`);
      }

      if (allowPrivateMediaUrls) return;

      if (normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost')) {
        throw new Error(`Blocked private Media URL host "${hostName}".`);
      }

      if (isIP(normalizedHost)) {
        if (isPrivateIpAddress(normalizedHost)) {
          throw new Error(`Blocked private Media URL IP "${hostName}".`);
        }
        return;
      }

      let addresses: Array<{ address: string }> = [];
      try {
        addresses = await lookup(normalizedHost, { all: true, verbatim: true });
      } catch (error) {
        throw new Error(`Failed to resolve Media URL host "${hostName}": ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!addresses.length) {
        throw new Error(`Failed to resolve Media URL host "${hostName}".`);
      }

      if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
        throw new Error(`Blocked Media URL host "${hostName}" because it resolves to a private or local IP.`);
      }
    };

    const validateMediaUrl = async (rawUrl: string): Promise<URL> => {
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        throw new Error(`Invalid Media URL: "${rawUrl}".`);
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported Media URL protocol "${parsed.protocol}". Only http/https are allowed.`);
      }

      await assertHostIsSafe(parsed.hostname);
      return parsed;
    };

    const downloadUrlToBuffer = async (url: string): Promise<{ buffer: Buffer; mimeType?: string; fileName?: string }> => {
      const parsedUrl = await validateMediaUrl(url);
      const timeoutMs = toFinitePositiveInt(process.env.TELEGRAM_CENSOR_MEDIA_URL_TIMEOUT_MS, defaultDownloadTimeoutMs);
      const maxBytes = toFinitePositiveInt(process.env.TELEGRAM_CENSOR_MEDIA_URL_MAX_BYTES, defaultDownloadMaxBytes);

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(parsedUrl.toString(), {
          signal: controller.signal,
          redirect: 'follow',
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Media URL download timed out after ${timeoutMs}ms.`);
        }
        throw new Error(`Failed to download media from URL: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        clearTimeout(timeoutHandle);
      }

      const finalUrl = await validateMediaUrl(response.url || parsedUrl.toString());

      if (!response.ok) {
        throw new Error(`Failed to download media from URL: ${response.status} ${response.statusText}`);
      }

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new Error(`Media URL file is too large (${contentLength} bytes). Max allowed is ${maxBytes} bytes.`);
      }

      if (!response.body) {
        throw new Error('Media URL response body is empty.');
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const stream = Readable.fromWeb(response.body as any);

      for await (const chunk of stream) {
        const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += asBuffer.length;

        if (totalBytes > maxBytes) {
          throw new Error(`Media URL file exceeded max allowed size of ${maxBytes} bytes.`);
        }

        chunks.push(asBuffer);
      }

      if (totalBytes === 0) {
        throw new Error('Media URL returned an empty file.');
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

    try {
      try {
        await client.connect();
      } catch (error) {
        throw new Error(`Failed to connect to Telegram: ${error instanceof Error ? error.message : error}`);
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;

        try {
          const operation = this.getNodeParameter('operation', i) as string;

          switch (operation) {

            // ── getMessages ────────────────────────────────────────────────────
            case 'getMessages': {
              const chatId      = this.getNodeParameter('chatId', i, '') as string;
              const mode        = this.getNodeParameter('mode', i, 'limit') as string;
              const maxMessages = toInt(this.getNodeParameter('maxMessages', i, 500), 'Max Messages');
              const onlyMedia   = this.getNodeParameter('onlyMedia', i, false) as boolean;
              const mediaTypes  = this.getNodeParameter('mediaType', i, []) as string[];

              if (!chatId.trim()) {
                throw new Error('Chat ID is required.');
              }

              const iterOptions: Record<string, any> = {};
              iterOptions.limit = maxMessages;

              let messages: any[] = [];

              if (mode === 'limit') {
                const limit = toInt(this.getNodeParameter('limit', i, 50), 'Limit');
                messages = await client.getMessages(chatId, { limit: limit as any });

              } else if (mode === 'hours') {
                const hours      = toInt(this.getNodeParameter('hours', i, 24), 'Last Hours');
                const cutoffTime = Math.floor(Date.now() / 1000) - hours * 3600;
                for await (const msg of client.iterMessages(chatId, iterOptions)) {
                  if (msg.date < cutoffTime) break;
                  messages.push(msg);
                }

              } else if (mode === 'range') {
                const fromDateStr = this.getNodeParameter('fromDate', i, '') as string;
                const toDateStr   = this.getNodeParameter('toDate', i, '') as string;
                const fromTime    = fromDateStr ? parseDateToUnix(fromDateStr, 'From Date') : 0;
                const toTime      = toDateStr   ? parseDateToUnix(toDateStr, 'To Date') : Math.floor(Date.now() / 1000);
                if (fromTime > toTime) {
                  throw new Error('From Date must be earlier than or equal to To Date.');
                }
                for await (const msg of client.iterMessages(chatId, iterOptions)) {
                  if (msg.date > toTime) continue;
                  if (msg.date < fromTime) break;
                  messages.push(msg);
                }
              }

              for (const msg of messages) {
                if (!msg || msg._ === 'MessageEmpty') continue;

                const isPhoto    = !!msg.media?.photo;
                const isDocument = !!msg.media?.document;
                const isVideo    = !!msg.media?.video || (isDocument && msg.media.document.mimeType?.includes('video'));
                const hasMedia   = isPhoto || isDocument || isVideo || !!msg.media;

                if (onlyMedia && !hasMedia) continue;

                if (onlyMedia && mediaTypes.length > 0) {
                  let match = false;
                  if (mediaTypes.includes('photo')    && isPhoto)                    match = true;
                  if (mediaTypes.includes('video')    && isVideo)                    match = true;
                  if (mediaTypes.includes('document') && isDocument && !isVideo)     match = true;
                  if (!match) continue;
                }

                // getMessages output is already JSON-only (no binary) - good as-is
                successData.push({
                  json: {
                    messageId : msg.id,
                    chatId    : chatId,
                    date      : new Date(msg.date * 1000).toISOString(),
                    text      : msg.message || '',
                    hasMedia  : hasMedia,
                    mediaType : isPhoto ? 'photo' : isVideo ? 'video' : isDocument ? 'document' : 'other',
                  },
                  pairedItem: { item: i },
                });
              }
              break;
            }

            // ── sendMessage ───────────────────────────────────────────────────
            case 'sendMessage': {
              const sendToSelf  = this.getNodeParameter('sendToSelf', i, false) as boolean;
              const chatId      = sendToSelf ? 'me' : (this.getNodeParameter('sendChatId', i, '') as string);
              const text        = this.getNodeParameter('sendText', i, '') as string;
              const replyTo     = this.getNodeParameter('sendReplyTo', i, 0) as number;
              const webPreview  = this.getNodeParameter('sendWebPreview', i, true) as boolean;
              const attachMedia = this.getNodeParameter('sendAttachMedia', i, false) as boolean;

              if (!sendToSelf && !chatId.trim()) {
                throw new Error('Chat ID is required when "Send to Saved Messages" is disabled.');
              }

              let fileToSend: CustomFile | undefined;
              let hasMedia = false;
              let mediaType = 'other';

              if (attachMedia) {
                const selectedType  = this.getNodeParameter('sendMediaType', i, 'auto') as 'auto' | 'photo' | 'video' | 'document';
                const binaryProperty= this.getNodeParameter('sendMediaBinaryProperty', i, 'data') as string;
                const mediaUrl      = this.getNodeParameter('sendMediaUrl', i, '') as string;
                const binaryData    = item.binary?.[binaryProperty];
                const detectMediaType = selectedType === 'auto';

                if (binaryData) {
                  const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);
                  const fileName = binaryData.fileName || `upload_${Date.now()}`;
                  fileToSend = new CustomFile(fileName, buffer.length, '', buffer);
                  hasMedia = true;
                  mediaType = detectMediaType
                    ? inferMediaTypeFromMime(binaryData.mimeType) || 'document'
                    : selectedType;

                } else if (mediaUrl.trim() !== '') {
                  const { buffer, mimeType, fileName } = await downloadUrlToBuffer(mediaUrl);
                  const safeName = fileName || `upload_${Date.now()}`;
                  fileToSend = new CustomFile(safeName, buffer.length, '', buffer);
                  hasMedia = true;
                  mediaType = detectMediaType
                    ? inferMediaTypeFromMime(mimeType) || inferMediaTypeFromUrl(mediaUrl) || 'document'
                    : selectedType;

                } else {
                  throw new Error(`Binary property "${binaryProperty}" is missing or empty and no Media URL provided.`);
                }
              }

              const sendResult = await client.sendMessage(chatId, {
                message   : text,
                replyTo   : replyTo > 0 ? replyTo : undefined,
                linkPreview: webPreview,
                file      : fileToSend,
              });

              const sentMessage = Array.isArray(sendResult) ? sendResult[0] : sendResult;
              const messageMediaInfo = extractMediaInfo((sentMessage as any)?.media);
              const finalHasMedia = hasMedia || messageMediaInfo.hasMedia;
              const finalMediaType = hasMedia ? mediaType : messageMediaInfo.mediaType;

              const sentDateRaw = (sentMessage as any)?.date;
              const sentDateIso =
                typeof sentDateRaw === 'number'
                  ? new Date(sentDateRaw * 1000).toISOString()
                  : sentDateRaw instanceof Date
                    ? sentDateRaw.toISOString()
                    : new Date().toISOString();

              successData.push(
                makeLightweightItem(
                  item.json,
                  {
                    messageId : (sentMessage as any)?.id ?? null,
                    chatId,
                    date      : sentDateIso,
                    text      : (sentMessage as any)?.message ?? text,
                    hasMedia  : finalHasMedia,
                    mediaType : finalHasMedia ? finalMediaType : 'other',
                    status    : 'Success',
                    action    : 'Message sent',
                    isReply   : replyTo > 0 || !!(sentMessage as any)?.replyTo?.replyToMsgId,
                    replyToId : (sentMessage as any)?.replyTo?.replyToMsgId ?? (replyTo > 0 ? replyTo : null),
                  },
                  i,
                ),
              );
              break;
            }

            // ── downloadMedia ──────────────────────────────────────────────────
            case 'downloadMedia': {
              const chatId    = this.getNodeParameter('downloadChatId', i, '') as string;
              const messageId = toInt(this.getNodeParameter('downloadMessageId', i, 0), 'Message ID');

              if (!chatId.trim()) {
                throw new Error('Chat ID is required.');
              }

              const maxAttempts = 4;
              let attempt = 0;
              let buffer: Buffer | undefined;
              let messageWithMedia: any;

              while (attempt < maxAttempts && !buffer) {
                attempt += 1;

                const messages = await client.getMessages(chatId, { ids: [messageId] });
                const msg      = messages[0];

                if (!msg?.media) {
                  throw new Error(`No media found in message ID ${messageId}`);
                }
                messageWithMedia = msg;

                try {
                  // Pass the full message object (not just media) so GramJS has complete context.
                  const downloaded = await client.downloadMedia(msg, {});

                  if (!downloaded) {
                    throw new Error(`Telegram returned empty media payload for message ID ${messageId}`);
                  }
                  if (typeof downloaded === 'string') {
                    throw new Error(`Unexpected download output type for message ID ${messageId}`);
                  }

                  buffer = downloaded;
                } catch (error) {
                  if (attempt >= maxAttempts || !isDownloadTimeoutError(error)) {
                    throw error;
                  }
                  await sleepMs(attempt * 1200);
                }
              }

              if (!buffer) {
                throw new Error(`Failed to download media for message ID ${messageId} after ${maxAttempts} attempts.`);
              }

              const mediaMeta = getMediaMetadataFromMessage(messageWithMedia, messageId);
              const binaryData = await this.helpers.prepareBinaryData(buffer as Buffer);
              binaryData.fileName = mediaMeta.fileName;
              binaryData.mimeType = mediaMeta.mimeType;

              // KEY FIX: downloadMedia MUST carry binary (needed by Scanner next).
              // But we strip all unnecessary fields from json to keep it lean.
              successData.push({
                json: {
                  // Only the fields downstream nodes actually need
                  messageId : item.json.messageId ?? messageId,
                  chatId    : item.json.chatId    ?? chatId,
                  date      : item.json.date      ?? null,
                  text      : item.json.text      ?? null,
                  hasMedia  : item.json.hasMedia  ?? true,
                  mediaType : item.json.mediaType ?? mediaMeta.mediaType,
                },
                binary: { media: binaryData },  // ← binary kept: Scanner needs it
                pairedItem: { item: i },
              });
              break;
            }

            // ── nudeNetScanner ─────────────────────────────────────────────────
            case 'nudeNetScanner': {
              usedScannerOperation = true;
              const minConfidence = this.getNodeParameter('minConfidence', i, 0.4) as number;

              if (!this.helpers.assertBinaryData(i, 'media')) {
                throw new Error('Missing binary data property "media". Connect a Download Media node first.');
              }

              const inputMediaMime = item.binary?.media?.mimeType as string | undefined;
              if (inputMediaMime && !inputMediaMime.startsWith('image/')) {
                throw new Error(`Scanner supports only image inputs. Received mime type: "${inputMediaMime}".`);
              }

              const buffer     = await this.helpers.getBinaryDataBuffer(i, 'media');
              const detections = await detectNudity(buffer, minConfidence);
              const isNsfw     = detections.length > 0;

              if (isNsfw) {
                // KEY FIX: NSFW images carry binary ONLY when blur is needed next.
                // Detections stored as lightweight data, not giant nested objects.
                const binaryProperty = await this.helpers.prepareBinaryData(buffer);
                const sourceExtension = getExtensionForMime(inputMediaMime) || '.jpg';
                binaryProperty.fileName = `original_${item.json.messageId}${sourceExtension}`;
                binaryProperty.mimeType = inputMediaMime || 'image/jpeg';

                successData.push({
                  json: {
                    messageId      : item.json.messageId,
                    chatId         : item.json.chatId,
                    date           : item.json.date,
                    text           : item.json.text,
                    hasMedia       : item.json.hasMedia,
                    mediaType      : item.json.mediaType,
                    isNsfw         : true,
                    nsfwParts      : detections.map(d => d.class),
                    // KEY FIX: Store only what Blur needs, not full detection objects
                    // Full detections needed by blur - keep but structured minimally
                    detections     : detections.map(d => ({
                      class : d.class,
                      score : d.score,
                      box   : d.box,   // [x, y, w, h] - needed for blur coordinates
                    })),
                    detectionCount : detections.length,
                  },
                  binary: { media: binaryProperty }, // ← binary kept: Blur needs it
                  pairedItem: { item: i },
                });
              } else {
                // KEY FIX: Safe images get NO binary output at all.
                // This is where most memory savings happen - safe images are majority.
                successData.push({
                  json: {
                    messageId      : item.json.messageId,
                    chatId         : item.json.chatId,
                    date           : item.json.date,
                    text           : item.json.text,
                    hasMedia       : item.json.hasMedia,
                    mediaType      : item.json.mediaType,
                    isNsfw         : false,
                    nsfwParts      : [],
                    detections     : [],
                    detectionCount : 0,
                  },
                  // binary intentionally OMITTED for safe images
                  pairedItem: { item: i },
                });
              }
              break;
            }

            // ── nudeNetBlur ────────────────────────────────────────────────────
            case 'nudeNetBlur': {
              if (!this.helpers.assertBinaryData(i, 'media')) {
                throw new Error('Missing binary data property "media". Connect a Scanner node first.');
              }

              const buffer      = await this.helpers.getBinaryDataBuffer(i, 'media');
              const detections  = (item.json.detections || []) as any[];
              const blurStrength= this.getNodeParameter('blurStrength', i, 35) as number;
              const sourceMimeType = item.binary?.media?.mimeType as string | undefined;

              let resultBuffer  = buffer;
              if (detections.length > 0) {
                resultBuffer = await blurNudity(buffer, detections, blurStrength);
              }

              const binaryData = await this.helpers.prepareBinaryData(resultBuffer);
              const outputExtension = getExtensionForMime(sourceMimeType) || '.jpg';
              binaryData.fileName = `safe_${item.json.messageId}${outputExtension}`;
              binaryData.mimeType = sourceMimeType || 'image/jpeg';

              // KEY FIX: Blur output carries binary ONLY because editMessage needs it.
              // But we strip detections array (no longer needed after blur).
              successData.push({
                json: {
                  messageId  : item.json.messageId,
                  chatId     : item.json.chatId,
                  date       : item.json.date,
                  text       : item.json.text,
                  isNsfw     : item.json.isNsfw,
                  nsfwParts  : item.json.nsfwParts,
                  blurred    : detections.length > 0,
                  status     : detections.length > 0 ? 'Blurred' : 'Safe (no action)',
                  // KEY FIX: detections array DROPPED here - not needed by editMessage
                  // detectionCount kept as scalar for reporting
                  detectionCount: item.json.detectionCount,
                },
                binary: { media: binaryData }, // ← binary kept: editMessage needs it
                pairedItem: { item: i },
              });
              break;
            }

            // ── editMessage ────────────────────────────────────────────────────
            case 'editMessage': {
              const chatId    = this.getNodeParameter('editChatId', i, '') as string;
              const messageId = toInt(this.getNodeParameter('editMessageId', i, 0), 'Message ID');
              const text      = this.getNodeParameter('editText', i, '') as string;

              if (!chatId.trim()) {
                throw new Error('Chat ID is required.');
              }

              if (!this.helpers.assertBinaryData(i, 'media')) {
                throw new Error('Missing binary data property "media". Connect a Blur node first.');
              }

              const buffer       = await this.helpers.getBinaryDataBuffer(i, 'media');
              const fileToUpload = new CustomFile('safe.jpg', buffer.length, '', buffer);
              const uploaded     = await client.uploadFile({ file: fileToUpload, workers: 1 });

              await client.editMessage(chatId, {
                message : messageId,
                text    : text || '',
                file    : uploaded,
              });

              // KEY FIX: editMessage is the FINAL step in the chain.
              // Output is 100% lightweight JSON - binary fully dropped here.
              // This item goes back into the loop and must NOT carry any image data.
              const wasBlurred =
                item.json.blurred === true ||
                Number(item.json.detectionCount ?? 0) > 0;

              successData.push(
                makeLightweightItem(
                  item.json,
                  {
                    status : 'Success',
                    action : 'Media replaced with safe version',
                    blurred: wasBlurred,
                  },
                  i,
                ),
              );
              break;
            }

            default:
              throw new Error(`Unknown operation: ${operation}`);
          }

        } catch (error) {
          if (this.continueOnFail()) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // KEY FIX: Error items are also lightweight - no binary on error paths
            successData.push(
              makeLightweightItem(
                item.json,
                { error: errorMessage },
                i,
              ),
            );
            continue;
          }
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
        }
      }

    } finally {
      if (usedScannerOperation) {
        await releaseModel();
      }
      try {
        await client.disconnect();
        await client.destroy();
      } catch {
        // Ignore disconnection errors
      }
    }

    return [successData];
  }
}
