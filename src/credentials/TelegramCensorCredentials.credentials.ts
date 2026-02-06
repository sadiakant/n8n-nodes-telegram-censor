import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class TelegramCensorCredentials implements ICredentialType {
  name = 'telegramCensorCredentials';
  displayName = 'Telegram MTProto (User Account)';
  documentationUrl = 'https://github.com/sadiakant/n8n-nodes-telegram-censor';
  properties: INodeProperties[] = [
    {
      displayName: 'API ID',
      name: 'apiId',
      type: 'number',
      default: 0,
    },
    {
      displayName: 'API Hash',
      name: 'apiHash',
      type: 'string',
      default: '',
    },
    {
      displayName: 'Session String',
      name: 'sessionString',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Login once with a small script → get this string → paste here → never login again',
    },
  ];
}