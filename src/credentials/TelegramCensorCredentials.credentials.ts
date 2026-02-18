import {
  ICredentialType,
  INodeProperties,
  ICredentialTestRequest,
  IHttpRequestOptions,
  ICredentialDataDecryptedObject,
  ICredentialsDecrypted,
  INodeCredentialTestResult,
} from 'n8n-workflow';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

export class TelegramCensorCredentials implements ICredentialType {
  name = 'telegramCensorCredentials';
  displayName = 'Telegram MTProto (User Account)';
  documentationUrl = 'https://github.com/sadiakant/n8n-nodes-telegram-censor';

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
      default: '',
    },
    {
      displayName: 'Session String',
      name: 'sessionString',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Login once with a small script -> get this string -> paste here -> never login again',
    },
  ];

  authenticate = async (
    credentials: ICredentialDataDecryptedObject,
    requestOptions: IHttpRequestOptions,
  ): Promise<IHttpRequestOptions> => {
    const apiIdRaw = credentials.apiId;
    const apiId = typeof apiIdRaw === 'string' ? Number(apiIdRaw) : (apiIdRaw as number | undefined);
    const apiHash = credentials.apiHash as string | undefined;
    const sessionString = credentials.sessionString as string | undefined;

    if (!apiId || !apiHash || !sessionString?.trim()) {
      throw new Error('API ID, API Hash, and Session String are required');
    }

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 2,
      useWSS: false,
    });

    try {
      await client.connect();
      const me = await client.getMe();
      if (!me) {
        throw new Error('Could not verify account identity with getMe');
      }
    } catch (error) {
      throw new Error(`getMe verification failed: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Programmatic credential test using Telegram MTProto getMe.
 * Used by node credentialTest so n8n can validate on Save.
 */
export async function testTelegramCensorCredentials(
  this: unknown,
  credential: ICredentialsDecrypted<ICredentialDataDecryptedObject> | Record<string, unknown>,
): Promise<INodeCredentialTestResult> {
  const credentials = (
    'data' in credential ? credential.data : credential
  ) as Record<string, unknown> | undefined;

  const apiIdRaw = credentials?.apiId;
  const apiId = typeof apiIdRaw === 'string' ? Number(apiIdRaw) : (apiIdRaw as number | undefined);
  const apiHash = credentials?.apiHash as string | undefined;
  const sessionString = credentials?.sessionString as string | undefined;

  if (!apiId || !apiHash || !sessionString?.trim()) {
    return {
      status: 'Error',
      message: 'API ID, API Hash, and Session String are required',
    };
  }

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 2,
    useWSS: false,
  });

  try {
    await client.connect();
    const me = await client.getMe();

    if (!me) {
      return {
        status: 'Error',
        message: 'getMe verification failed: could not resolve account identity',
      };
    }

    const fullName = `${me.firstName ?? ''}${me.lastName ? ` ${me.lastName}` : ''}`.trim() || 'Unknown';
    const username = me.username ? `@${me.username}` : 'no-username';
    const userId = me.id ? me.id.toString() : 'unknown-id';

    return {
      status: 'OK',
      message: `Connection verified. Username: ${username}, UserID: ${userId}, Name: ${fullName}`,
    };
  } catch (error) {
    return {
      status: 'Error',
      message: `getMe verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    try {
      await client.disconnect();
      await client.destroy();
    } catch {
      // Ignore cleanup errors in credential test.
    }
  }
}
