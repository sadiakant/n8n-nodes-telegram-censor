import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, NodeOperationError } from 'n8n-workflow';
import { TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
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
        displayOptions: { show: { operation: ['getMessages'], mode: ['limit'] } },
      },
      {
        displayName: 'Last Hours',
        name: 'hours',
        type: 'number',
        default: 24,
        displayOptions: { show: { operation: ['getMessages'], mode: ['hours'] } },
      },
      {
        displayName: 'Max Messages',
        name: 'maxMessages',
        type: 'number',
        default: 500,
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
      { connectionRetries: 5, useWSS: false },
    );
    client.setLogLevel(LogLevel.ERROR);

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
        normalized.includes('eai_again')
      );
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
              const maxMessages = this.getNodeParameter('maxMessages', i, 500) as number;
              const onlyMedia   = this.getNodeParameter('onlyMedia', i, false) as boolean;
              const mediaTypes  = this.getNodeParameter('mediaType', i, []) as string[];

              const iterOptions: Record<string, any> = {};
              if (maxMessages > 0) iterOptions.limit = maxMessages;

              let messages: any[] = [];

              if (mode === 'limit') {
                const limit = this.getNodeParameter('limit', i, 50) as number;
                messages = await client.getMessages(chatId, { limit: limit as any });

              } else if (mode === 'hours') {
                const hours      = this.getNodeParameter('hours', i, 24) as number;
                const cutoffTime = Math.floor(Date.now() / 1000) - hours * 3600;
                for await (const msg of client.iterMessages(chatId, iterOptions)) {
                  if (msg.date < cutoffTime) break;
                  messages.push(msg);
                }

              } else if (mode === 'range') {
                const fromDateStr = this.getNodeParameter('fromDate', i, '') as string;
                const toDateStr   = this.getNodeParameter('toDate', i, '') as string;
                const fromTime    = fromDateStr ? Math.floor(new Date(fromDateStr).getTime() / 1000) : 0;
                const toTime      = toDateStr   ? Math.floor(new Date(toDateStr).getTime()   / 1000) : Math.floor(Date.now() / 1000);
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

            // ── downloadMedia ──────────────────────────────────────────────────
            case 'downloadMedia': {
              const chatId    = this.getNodeParameter('downloadChatId', i, '') as string;
              const messageId = toInt(this.getNodeParameter('downloadMessageId', i, 0), 'Message ID');

              const maxAttempts = 4;
              let attempt = 0;
              let buffer: Buffer | undefined;

              while (attempt < maxAttempts && !buffer) {
                attempt += 1;

                const messages = await client.getMessages(chatId, { ids: [messageId] });
                const msg      = messages[0];

                if (!msg?.media) {
                  throw new Error(`No media found in message ID ${messageId}`);
                }

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

              const binaryData = await this.helpers.prepareBinaryData(buffer as Buffer);
              binaryData.fileName = `media_${messageId}.jpg`;
              binaryData.mimeType = 'image/jpeg';

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
                  mediaType : item.json.mediaType ?? null,
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

              const buffer     = await this.helpers.getBinaryDataBuffer(i, 'media');
              const detections = await detectNudity(buffer, minConfidence);
              const isNsfw     = detections.length > 0;

              if (isNsfw) {
                // KEY FIX: NSFW images carry binary ONLY when blur is needed next.
                // Detections stored as lightweight data, not giant nested objects.
                const binaryProperty = await this.helpers.prepareBinaryData(buffer);
                binaryProperty.fileName = `original_${item.json.messageId}.jpg`;
                binaryProperty.mimeType = 'image/jpeg';

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

              let resultBuffer  = buffer;
              if (detections.length > 0) {
                resultBuffer = await blurNudity(buffer, detections, blurStrength);
              }

              const binaryData = await this.helpers.prepareBinaryData(resultBuffer);
              binaryData.fileName = `safe_${item.json.messageId}.jpg`;
              binaryData.mimeType = 'image/jpeg';

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
              successData.push(
                makeLightweightItem(
                  item.json,
                  {
                    status : 'Success',
                    action : 'Media replaced with safe version',
                    blurred: true,
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
