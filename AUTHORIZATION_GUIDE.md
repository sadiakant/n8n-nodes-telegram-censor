# Telegram Censor - Authorization Guide

## Overview

This guide will help you authenticate your Telegram account with n8n using the Telegram Censor node. The process involves generating a session string that allows the node to interact with your Telegram account securely.

## Prerequisites

Before starting, ensure you have:
- A Telegram account with access to your phone number
- API ID and API Hash from [https://my.telegram.org](https://my.telegram.org)
- Access to the phone number associated with your Telegram account
- Your mobile number with country code (e.g., +1234567890)
- Your 2FA password if your account has 2FA enabled

## Authentication Flow

### Step 1: Get Telegram API Credentials

**Purpose**: Obtain your unique API credentials for Telegram integration.

**Steps**:
1. Visit [https://my.telegram.org](https://my.telegram.org)
2. Log in with your phone number
3. Go to "API development tools"
4. Click "Create application"
5. Fill in the required fields:
   - **App title**: Choose a name (e.g., "n8n Telegram Censor")
   - **Short name**: Short identifier (e.g., "n8n-censor")
   - **Platform**: Select "Other"
6. Click "Create"
7. Note down your **API ID** and **API Hash** - you'll need these for setup

### Step 2: Generate Session String

**Purpose**: Create a secure session string that authenticates your n8n node with Telegram.

**Recommended Method: Use Telegram GramPro Node**

For the easiest and most reliable session string generation, we recommend using our companion project:

🔗 **[Telegram GramPro - Session Generator](https://github.com/sadiakant/n8n-nodes-telegram-grampro)**

**Why Use GramPro for Session Generation?**
- ✅ **Easy Setup**: Simple two-step process
- ✅ **Secure**: Military-grade AES-256-GCM encryption
- ✅ **Reliable**: Production-tested authentication system
- ✅ **Well-Documented**: Comprehensive guides and troubleshooting
- ✅ **Integrated**: Designed to work seamlessly with our ecosystem

**GramPro Session Generation Steps**:
1. Install the Telegram GramPro node in n8n
2. Use the "Request Code" operation with your API credentials
3. Enter the verification code sent to your phone
4. Use the "Sign In & Generate" operation to create your session string
5. Copy the generated session string for use in Telegram Censor

### Step 3: Configure Telegram Censor Credentials

**Purpose**: Set up your Telegram Censor node with the generated credentials.

**Configuration**:
In n8n → Settings → Credentials:
- **API ID**: Your Telegram API ID from my.telegram.org
- **API Hash**: Your Telegram API Hash from my.telegram.org  
- **Session String**: Your generated session string from GramPro

## Manual Session String Generation (Alternative)

If you prefer not to use GramPro, you can generate a session string manually:

### Method A: Using GramJS Directly

1. **Install GramJS**:
   ```bash
   npm install telegram
   ```

2. **Create a setup script**:
   ```javascript
   const { TelegramClient } = require('telegram');
   const { StringSession } = require('telegram/sessions');

   const apiId = YOUR_API_ID;
   const apiHash = 'YOUR_API_HASH';
   const stringSession = new StringSession('');

   async function setup() {
     const client = new TelegramClient(stringSession, apiId, apiHash, {
       connectionRetries: 5,
     });

     await client.start({
       phoneNumber: async () => await input.text('Please enter your number: '),
       password: async () => await input.text('Please enter your password: '),
       phoneCode: async () => await input.text('Please enter the auth code: '),
       onError: (err) => console.log(err),
     });

     console.log('Session string:', client.session.save());
   }

   setup();
   ```

3. **Run the script** and follow the prompts
4. **Copy the session string** output

### Method B: Using Python (if you have Python available)

1. **Install Telethon**:
   ```bash
   pip install telethon
   ```

2. **Create a setup script**:
   ```python
   from telethon.sync import TelegramClient

   api_id = YOUR_API_ID
   api_hash = 'YOUR_API_HASH'

   with TelegramClient('session_name', api_id, api_hash) as client:
       print(client.session.save())
   ```

3. **Run the script** and follow the prompts
4. **Copy the session string** output

## Session String Security

### Important Security Notes

🔒 **Session String Protection**:
- **Never share** your session string publicly
- **Store securely** in n8n's credential management
- **Treat like a password** - it provides full access to your Telegram account
- **Rotate regularly** for enhanced security

### Session String Format
Session strings are base64-encoded and typically look like:
```
123456:abcdef1234567890abcdef1234567890abcdef12
```

## Troubleshooting

### Common Issues

#### **"Invalid session string" Error**
**Solutions**:
- Ensure no extra spaces or characters
- Verify the string format is correct
- Regenerate the session string if corrupted

#### **"Session already in use" Error**
**Solutions**:
- Close other Telegram clients using the same session
- Generate a new session string
- Restart n8n after session change

#### **"Phone number banned" Error**
**Solutions**:
- Check if your phone number is banned by Telegram
- Use a different phone number if available
- Contact Telegram support if needed

#### **"Flood wait" Error**
**Solutions**:
- Wait for the specified time (usually 1-5 minutes)
- Avoid rapid authentication attempts
- Use rate limiting in your workflows

### Authentication Best Practices

1. **Use Strong 2FA**: Enable two-factor authentication on your Telegram account
2. **Monitor Activity**: Regularly check your Telegram account for suspicious activity
3. **Secure Storage**: Always use n8n's built-in credential management
4. **Regular Rotation**: Change session strings periodically
5. **Network Security**: Use secure networks during authentication

## Integration with Telegram Censor

Once you have your session string:

1. **Install Telegram Censor** in n8n
2. **Configure credentials** with your API ID, API Hash, and session string
3. **Test the connection** with a simple operation
4. **Start using** the content moderation features

## Support

If you encounter issues during authentication:

- **For GramPro-related issues**: [Telegram GramPro Issues](https://github.com/sadiakant/n8n-nodes-telegram-grampro/issues)
- **For Telegram Censor issues**: [Telegram Censor Issues](https://github.com/sadiakant/n8n-nodes-telegram-censor/issues)
- **General Telegram API**: [Telegram API Documentation](https://core.telegram.org/api)

## Next Steps

After successful authentication:
1. **Explore operations** in the Telegram Censor node
2. **Create workflows** for content moderation
3. **Set up monitoring** for your channels/groups
4. **Configure alerts** for detected violations

---

**⚠️ Security Reminder**: Your session string provides full access to your Telegram account. Handle it with the same care as you would your password.