import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import { detectNudity, blurNudity, releaseModel } from '../inference'; 

export class TelegramCensor implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Telegram Censor',
    name: 'telegramCensor',
    icon: 'file:../icons/telegram-censor.svg',
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
          { name: 'Get Messages', value: 'getMessages', description: 'Get recent messages with optional time/date filter' },
          { name: 'Download Media', value: 'downloadMedia', description: 'Download photo/document from message' },
          { name: 'NudeNet Scanner', value: 'nudeNetScanner', description: 'Detect exposed nudity using NudeNet (100% local)' },
          { name: 'NudeNet Blur', value: 'nudeNetBlur', description: 'Blur only exposed private parts (NudeNet)' },
          { name: 'Edit Message', value: 'editMessage', description: 'Replace media in message (keep original text)' },
        ],
        default: 'getMessages',
        description: 'The operation to perform',
      },
      // ----------------------------------
      // Get Messages: Main Parameters
      // ----------------------------------
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
          { name: 'Last X Hours', value: 'hours' },
          { name: 'Date Range', value: 'range' },
        ],
        default: 'limit',
        displayOptions: { show: { operation: ['getMessages'] } },
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

      // ----------------------------------
      // Get Messages: NEW FILTERS
      // ----------------------------------
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
            { name: 'Photo', value: 'photo' },
            { name: 'Video', value: 'video' },
            { name: 'Document', value: 'document' },
        ],
        default: [],
        displayOptions: { 
            show: { 
                operation: ['getMessages'], 
                onlyMedia: [true] 
            } 
        },
        description: 'Filter by specific media types. Leave empty to allow all media.',
      },


      // Download Media Parameters
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
        default: '={{ $json.messageId }}',
        required: true,
        displayOptions: { show: { operation: ['downloadMedia'] } },
      },

      // Edit Message Parameters
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
        default: '={{ $json.messageId }}',
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

      // NudeNet Scanner Parameters
      {
        displayName: 'Minimum Confidence',
        name: 'minConfidence',
        type: 'number',
        default: 0.4,
        displayOptions: { show: { operation: ['nudeNetScanner'] } },
        description: 'Only detect parts with confidence above this',
      },

      // NudeNet Blur Parameters
      {
        displayName: 'Blur Strength',
        name: 'blurStrength',
        type: 'number',
        default: 35,
        displayOptions: { show: { operation: ['nudeNetBlur'] } },
        description: 'Higher = more blur',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;

    const credentials = await this.getCredentials('telegramCensorCredentials');
    
    const client = new TelegramClient(
      new StringSession(credentials.sessionString as string),
      Number(credentials.apiId),
      credentials.apiHash as string,
      { connectionRetries: 5, useWSS: false },
    );
    client.setLogLevel(LogLevel.ERROR);

    try {
      await client.connect();
    } catch (error) {
      throw new Error(`Failed to connect to Telegram: ${error instanceof Error ? error.message : error}`);
    }

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        switch (operation) {
          case 'getMessages': {
            const chatId = this.getNodeParameter('chatId', i, '') as string;
            const mode = this.getNodeParameter('mode', i, 'limit') as string;
            
            // Get Filter Parameters
            const onlyMedia = this.getNodeParameter('onlyMedia', i, false) as boolean;
            const mediaTypes = this.getNodeParameter('mediaType', i, []) as string[];

            let messages: any[] = [];

            if (mode === 'limit') {
              const limit = this.getNodeParameter('limit', i, 50) as number;
              // Standard fetch for last N messages
              messages = await client.getMessages(chatId, { limit: limit as any });

            } else if (mode === 'hours') {
              const hours = this.getNodeParameter('hours', i, 24) as number;
              // Calculate cutoff timestamp (Current Time - Hours) in Seconds
              const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);
              
              // Iterate Newest -> Oldest. Stop when we hit a message older than cutoff.
              // Note: We use iterMessages without an offsetDate to start from "Now".
              for await (const msg of client.iterMessages(chatId, {})) {
                if (msg.date < cutoffTime) {
                    break; // Message is too old, stop fetching
                }
                messages.push(msg);
              }

            } else if (mode === 'range') {
              const fromDateStr = this.getNodeParameter('fromDate', i, '') as string;
              const toDateStr = this.getNodeParameter('toDate', i, '') as string;

              // Convert to Unix Timestamp (Seconds)
              const fromTime = fromDateStr ? Math.floor(new Date(fromDateStr).getTime() / 1000) : 0;
              const toTime = toDateStr ? Math.floor(new Date(toDateStr).getTime() / 1000) : Math.floor(Date.now() / 1000);

              // Iterate Newest -> Oldest
              for await (const msg of client.iterMessages(chatId, {})) {
                if (msg.date > toTime) {
                    continue; // Skip messages newer than 'To Date' (if any, though usually we start at Now)
                }
                if (msg.date < fromTime) {
                    break; // Message is older than 'From Date', stop fetching
                }
                messages.push(msg);
              }
            }

            for (const msg of messages) {
              if (!msg || msg._ === 'MessageEmpty') continue;

              // Determine media presence and type
              const isPhoto = !!msg.media?.photo;
              const isDocument = !!msg.media?.document;
              // Note: Telegram videos are often classified as 'document' with 'video' mime-type or explicit video property depending on API layer
              // We check generic media property existence
              const isVideo = !!msg.media?.video || (isDocument && msg.media.document.mimeType?.includes('video'));
              
              const hasMedia = isPhoto || isDocument || isVideo || !!msg.media;

              // Filter 1: Check Has Media
              if (onlyMedia && !hasMedia) {
                continue;
              }

              // Filter 2: Check Media Type (only if filtering is requested)
              if (onlyMedia && mediaTypes.length > 0) {
                 let match = false;
                 if (mediaTypes.includes('photo') && isPhoto) match = true;
                 if (mediaTypes.includes('video') && isVideo) match = true;
                 if (mediaTypes.includes('document') && isDocument && !isVideo) match = true; // Treat non-video docs as docs
                 
                 if (!match) continue;
              }

              returnData.push({
                json: {
                  messageId: msg.id,
                  chatId: chatId,
                  date: new Date(msg.date * 1000).toISOString(),
                  text: msg.message || '',
                  hasMedia: hasMedia,
                  mediaType: isPhoto ? 'photo' : isVideo ? 'video' : isDocument ? 'document' : 'other',
                },
              });
            }
            break;
          }

          case 'downloadMedia': {
            const chatId = this.getNodeParameter('downloadChatId', i, '') as string;
            const messageId = this.getNodeParameter('downloadMessageId', i, 0) as number;

            const messages = await client.getMessages(chatId, { ids: [messageId as any] });
            const msg = messages[0];

            if (!msg?.media) {
              returnData.push({ json: { ...item.json, error: 'No media found' } });
              break;
            }

            const buffer = await client.downloadMedia(msg.media, {});
            const binaryData = await this.helpers.prepareBinaryData(buffer as Buffer);
            binaryData.fileName = `media_${messageId}.jpg`;
            // Attempt to guess mime type or default to jpeg (Telegram downloadMedia often returns raw buffer)
            binaryData.mimeType = 'image/jpeg'; 

            returnData.push({ json: item.json, binary: { media: binaryData } });
            break;
          }

          case 'editMessage': {
            const chatId = this.getNodeParameter('editChatId', i, '') as string;
            const messageId = this.getNodeParameter('editMessageId', i, 0) as number;
            const text = this.getNodeParameter('editText', i, '') as string;

            if (!this.helpers.assertBinaryData(i, 'media')) {
              returnData.push({ json: { ...item.json, status: 'Failed', error: 'No media' } });
              break;
            }

            const buffer = await this.helpers.getBinaryDataBuffer(i, 'media');
            const fileToUpload = new CustomFile('safe.jpg', buffer.length, '', buffer);

            const uploaded = await client.uploadFile({ file: fileToUpload, workers: 1 });
            await client.editMessage(chatId, { message: messageId as any, text: text || '', file: uploaded });

            returnData.push({
              json: { ...item.json, status: 'Success', action: 'Media replaced with safe version' },
            });
            break;
          }

          case 'nudeNetScanner': {
            const minConfidence = this.getNodeParameter('minConfidence', 0, 0.4) as number;

            if (!this.helpers.assertBinaryData(i, 'media')) {
              returnData.push(item);
              break;
            }

            const buffer = await this.helpers.getBinaryDataBuffer(i, 'media');
            
            // This is where the optimization happens (inside inference.ts)
            const detections = await detectNudity(buffer);

            const filtered = detections.filter(d => d.score >= minConfidence);
            const isNsfw = filtered.length > 0;

            const binaryProperty = await this.helpers.prepareBinaryData(buffer);
            binaryProperty.fileName = `original_${item.json.messageId}.jpg`;

            returnData.push({
              json: {
                ...item.json,
                isNsfw,
                nsfwParts: filtered.map(d => d.class),
                detections: filtered,
                detectionCount: filtered.length,
              },
              binary: { media: binaryProperty },
            });
            break;
          }

          case 'nudeNetBlur': {
            if (!this.helpers.assertBinaryData(i, 'media')) {
              returnData.push(item);
              break;
            }

            const buffer = await this.helpers.getBinaryDataBuffer(i, 'media');
            const detections = (item.json.detections || []) as any[];

            let resultBuffer = buffer;
            if (detections.length > 0) {
              resultBuffer = await blurNudity(buffer, detections);
            }

            const binaryData = await this.helpers.prepareBinaryData(resultBuffer);
            binaryData.fileName = `safe_${item.json.messageId}.jpg`;
            binaryData.mimeType = 'image/jpeg';

            returnData.push({
              json: { ...item.json, blurred: detections.length > 0, status: detections.length > 0 ? 'Blurred' : 'Safe (no action)' },
              binary: { media: binaryData },
            });
            break;
          }

          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      }

      // --- OPTIMIZATION STRATEGY #3: Lazy Unloading ---
      } finally {
      // 1. Release the heavy ML model FIRST. This is the biggest RAM consumer.
      if (operation === 'nudeNetScanner') {
        await releaseModel();
      }

      // 2. Then cleanup network connections
      try {
        await client.disconnect();
        await client.destroy();
      } catch (e) { }
    }

    return [returnData];
  }
}