import {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
	IHttpRequestOptions,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { LogLevel, Logger } from 'teleproto/extensions/Logger';

export class TelegramCensorCredentialsApi implements ICredentialType {
	name = 'telegramCensorCredentialsApi';
	displayName = 'Telegram Censor API';
	icon = 'file:TelegramCensorCredentials.svg' as const;
	documentationUrl =
		'https://github.com/sadiakant/n8n-nodes-telegram-grampro/blob/main/docs/AUTHORIZATION_GUIDE.md';

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: 'https://telegram.org',
			ignoreHttpStatusErrors: true,
		},
	};

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
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Session String',
			name: 'sessionString',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Login once with a small script -> get this string -> paste here -> never login again',
		},
	];

	authenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const apiIdRaw = credentials.apiId;
		const apiId =
			typeof apiIdRaw === 'string' ? Number(apiIdRaw) : (apiIdRaw as number | undefined);
		const apiHash = credentials.apiHash as string | undefined;
		const sessionString = credentials.sessionString as string | undefined;

		if (!apiId || !apiHash || !sessionString?.trim()) {
			throw new Error('API ID, API Hash, and Session String are required');
		}

		const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
			connectionRetries: 2,
			baseLogger: new Logger(LogLevel.NONE),
		});

		try {
			await client.connect();
			const me = await client.getMe();
			if (!me) {
				throw new Error('Could not verify account identity with getMe');
			}
		} catch (error) {
			throw new Error(
				`getMe verification failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			try {
				await client.disconnect();
				await client.destroy();
			} catch {
				// Ignore cleanup errors in credential authentication.
			}
		}

		return requestOptions;
	};
}
