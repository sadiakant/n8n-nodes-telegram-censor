# 🔒 Telegram Censor - n8n Content Moderation Node

**Protect Your Telegram Channel or Group from Ban - AI-Powered Nudity Detection & Blur for n8n Workflows**

[![Build Status](https://github.com/sadiakant/n8n-nodes-telegram-censor/actions/workflows/build.yml/badge.svg)](https://github.com/sadiakant/n8n-nodes-telegram-censor/actions/workflows/build.yml)
[![Publish Status](https://github.com/sadiakant/n8n-nodes-telegram-censor/actions/workflows/publish.yml/badge.svg)](https://github.com/sadiakant/n8n-nodes-telegram-censor/actions/workflows/publish.yml)

[![Telegram](https://img.shields.io/badge/Telegram-Content%20Moderation-blue.svg)](https://core.telegram.org/api)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![n8n](https://img.shields.io/badge/n8n-Custom_Node-green.svg)](https://n8n.io/)
[![NPM](https://img.shields.io/npm/v/n8n-nodes-telegram-censor.svg)](https://www.npmjs.com/package/n8n-nodes-telegram-censor)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Privacy](https://img.shields.io/badge/100%25-Private%20%26%20Local-success.svg)]()

---

## 🚨 Is Your Telegram Channel or Group at Risk of Ban?

**Telegram has strict policies against adult and pornographic content.** One accidental upload can result in your channel being banned with this message:

> ⚠️ **"This channel can't be displayed because it was used to spread pornographic content."**

This is the dreaded **Telegram channel ban message** that thousands of channel and group owners face every day. Don't let this happen to you!

---

## 🛡️ Why You Need Telegram Censor

### Daily Scenarios That Put Your Channel at Risk:

| Scenario | Risk Level | How Telegram Censor Helps |
|----------|------------|---------------------------|
| 🤖 **Automated Posting Mistakes** | 🔴 HIGH | Scans all auto-posted images before they go live |
| 📅 **Scheduled Content Errors** | 🔴 HIGH | Validates scheduled posts for policy compliance |
| 🔄 **Bot Forwarded Media** | 🟠 MEDIUM | Filters incoming bot messages for adult content |
| 👥 **User-Generated Content** | 🔴 HIGH | Moderates member submissions automatically |
| 📤 **Bulk Upload Accidents** | 🔴 HIGH | Batch scans multiple images before posting |
| 🔄 **Reposted Old Content** | 🟠 MEDIUM | Re-scans previously shared media for compliance |

### What Happens When Telegram Bans Your Channel:

- ❌ **Channel becomes inaccessible** to all subscribers
- ❌ **All content is hidden** and cannot be recovered
- ❌ **Subscriber count drops to zero** instantly
- ❌ **Reputation damage** that takes months to rebuild
- ❌ **Business loss** if you monetize your channel
- ❌ **No appeal guarantee** - bans are often permanent

---

## 🎯 Telegram Censor - Your Content Safety Net

**Telegram Censor** is a powerful n8n custom node that uses local AI (NudeNet) to automatically detect and blur adult content before it triggers Telegram's enforcement systems. **100% private, 100% local, 100% free forever.**

### 🌟 Key Features

#### **🧠 AI-Powered Content Detection**
- **Local NudeNet AI** - Detects exposed body parts using ONNX model
- **18 Detection Classes** - Covers all sensitive areas
- **Adjustable Confidence** - Set your own sensitivity threshold
- **100% Offline** - No data ever leaves your server

#### **🎨 Smart Blur Technology**
- **Precision Blur** - Only blurs detected sensitive regions
- **Adjustable Strength** - Control blur intensity (0-100)
- **Original Quality** - Non-sensitive areas remain crisp
- **Automatic Replacement** - Seamlessly replaces original media

#### **📱 Telegram MTProto Integration**
- **User Session Support** - Authenticate with your Telegram account
- **Message Management** - Get, download, and replace media
- **Time-Based Filters** - Scan recent messages or date ranges
- **Media Type Filters** - Focus on photos, videos, or documents

#### **🔒 Privacy First**
- **Zero External APIs** - Everything runs locally
- **No Data Upload** - Images never leave your server
- **Self-Hosted AI** - Included NudeNet model (ONNX)
- **GDPR Compliant** - No third-party data sharing

---

## 📦 Installation

### Method 1: n8n Community Nodes (Recommended)
1. Open n8n UI
2. Go to **Settings** → **Community Nodes**
3. Search for: `n8n-nodes-telegram-censor`
4. Check the box to allow external nodes
5. Click **Install**
6. **Restart n8n** to load the custom node

### Method 2: npm Installation
```bash
npm install n8n-nodes-telegram-censor
```

### Method 3: Manual Installation
```bash
# Clone to n8n custom nodes directory
git clone https://github.com/sadiakant/n8n-nodes-telegram-censor.git

# Install dependencies
npm install

# Build the project
npm run build

# Restart n8n
```

---

## ⚙️ Quick Setup

### 1. Get Telegram API Credentials
- Visit [my.telegram.org](https://my.telegram.org)
- Create a new application
- Note your **API ID** and **API Hash**

### 2. Generate Session String
**💡 Pro Tip**: Use our [Telegram GramPro](https://github.com/sadiakant/n8n-nodes-telegram-grampro) node to easily generate session strings!

Follow our [Authorization Guide](AUTHORIZATION_GUIDE.md) for detailed instructions on generating your session string.

### 3. Configure Credentials
In n8n → Settings → Credentials:
- **API ID**: Your Telegram API ID
- **API Hash**: Your Telegram API hash
- **Session String**: Your generated session string

---

## 🚀 Available Operations

| Operation | Description | Use Case |
|-----------|-------------|----------|
| **📥 Get Messages** | Fetch messages with time/date/media filters | Scan recent posts for compliance |
| **💾 Download Media** | Download photos from messages | Extract images for analysis |
| **🔍 Scanner** | AI nudity detection with confidence scoring | Identify policy-violating content |
| **🎨 Blur** | Apply blur to detected regions | Make content safe for Telegram |
| **🔄 Replace Image** | Replace media in existing messages | Update posts with blurred versions |

---

## 📋 Content Moderation Workflow Examples

### **Basic Protection Workflow**
```
1. Schedule Trigger (Daily/Hourly)
   ↓
2. Telegram Censor (Get Messages - Last 24 Hours)
   ├── Filter: Only Media = true
   └── Media Type: Photo
   ↓
3. Telegram Censor (Download Media)
   ↓
4. Telegram Censor (Scanner)
   ├── Confidence: 0.4 (40%)
   └── Output: isNsfw, detections
   ↓
5. IF isNsfw = true
   ├── Telegram Censor (Blur)
   │   └── Blur Strength: 35
   └── Telegram Censor (Replace Image)
       └── Replace with blurred version
   ↓
6. Send Notification (Optional)
   └── "X images were auto-censored for policy compliance"
```

### **Real-Time Protection Workflow**
```
1. Telegram Trigger (New Message with Media)
   ↓
2. Telegram Censor (Download Media)
   ↓
3. Telegram Censor (Scanner)
   ↓
4. IF NSFW Detected
   ├── Blur Image
   ├── Replace in Message
   └── Notify Admin: "Adult content auto-blurred"
   ↓
5. IF Safe
   └── Continue normally
```

### **Batch Cleanup Workflow**
```
1. Manual Trigger (Channel Audit)
   ↓
2. Telegram Censor (Get Messages - Date Range)
   ├── From: 2024-01-01
   └── To: 2024-12-31
   ↓
3. Loop Through Messages
   ├── Download Media
   ├── Scan for Nudity
   ├── IF Violation Found
   │   ├── Blur Image
   │   ├── Replace Original
   │   └── Log Violation
   └── Continue Loop
   ↓
4. Generate Report
   └── "Audit complete: X images processed, Y blurred"
```

---

## 🔍 AI Detection Classes

### Unsafe Classes (Auto-Flagged):
| Class | Description | Risk Level |
|-------|-------------|------------|
| `FEMALE_GENITALIA_EXPOSED` | Exposed female genitalia | 🔴 Critical |
| `MALE_GENITALIA_EXPOSED` | Exposed male genitalia | 🔴 Critical |
| `FEMALE_BREAST_EXPOSED` | Exposed female breasts | 🔴 Critical |
| `MALE_BREAST_EXPOSED` | Exposed male breasts | 🟠 High |
| `BUTTOCKS_EXPOSED` | Exposed buttocks | 🔴 Critical |
| `ANUS_EXPOSED` | Exposed anus | 🔴 Critical |

### Additional Detection Classes:
- Covered genitalia, breasts, buttocks
- Face detection (male/female)
- Armpits, belly, feet

---

## ⚡ Performance & Memory Optimization

Telegram Censor is optimized for low-memory environments:

| Optimization | Benefit |
|--------------|---------|
| **Disabled Sharp Cache** | Prevents memory bloat |
| **Zero-Copy Normalization** | Saves 1.2MB per image |
| **CHW Buffer Pooling** | Reuses memory buffers |
| **Lazy Model Loading** | Loads AI only when needed |
| **Aggressive Cleanup** | Releases memory after use |

### Memory Usage:
- **At Rest**: ~50 MB
- **During Scan**: ~150-200 MB
- **Model Cached**: ~100 MB

---

## 📊 Configuration Options

### Scanner Settings:
```json
{
  "minConfidence": 0.4,    // 0.0 - 1.0 (lower = more sensitive)
  "detectClasses": [        // Optional: filter specific classes
    "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED",
    "FEMALE_BREAST_EXPOSED"
  ]
}
```

### Blur Settings:
```json
{
  "blurStrength": 35,      // 0 - 100 (higher = more blur)
  "brightness": 0.9        // Dim blurred regions slightly
}
```

---

## 🛡️ Security & Privacy

### 100% Local Processing:
- ✅ AI model runs on your server
- ✅ No image data sent to external APIs
- ✅ No cloud processing or storage
- ✅ No telemetry or analytics
- ✅ Fully auditable code

### Data Protection:
- Session strings are encrypted at rest
- No logging of image content
- Temporary file cleanup
- GDPR and privacy compliant

---

## 🚨 Troubleshooting

For common issues and solutions, see our [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md).

### Quick Fixes:

| Issue | Solution |
|-------|----------|
| "Model not found" | Run `npm run build` to copy assets |
| "Out of memory" | Enable debug logs to monitor usage |
| "Connection failed" | Check session string validity |
| "Blur too weak" | Increase blurStrength parameter |
| "False positives" | Increase minConfidence threshold |

---

## 📝 Logging

Enable debug logging to monitor memory usage:

```bash
# Set environment variable
export N8N_LOG_LEVEL=debug

# Or in n8n settings
# Settings → Log Level → Debug
```

Memory logs will show:
```
[Memory] Pre-Load: 45.23 MB
[Memory] Post-Load: 145.67 MB
[Memory] Unloaded: 52.11 MB
```

---

## 📖 Documentation

- **[Operations Guide](OPERATIONS_GUIDE.md)** - Detailed operation documentation
- **[Authorization Guide](AUTHORIZATION_GUIDE.md)** - Setup Telegram credentials
- **[Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md)** - Common issues and fixes
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup:
```bash
# Clone repository
git clone https://github.com/sadiakant/n8n-nodes-telegram-censor.git

# Install dependencies
npm install

# Build project
npm run build

# Test changes
npm run dev
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Resources

- [Telegram API Documentation](https://core.telegram.org/api)
- [GramJS Documentation](https://gram.js.org/)
- [n8n Custom Nodes Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [NudeNet GitHub](https://github.com/notAI-tech/NudeNet)
- [ONNX Runtime](https://onnxruntime.ai/)

---

## ⚠️ Disclaimer

**Telegram Censor is designed to help content creators comply with Telegram's policies. It does not guarantee 100% detection accuracy. Always review critical content manually.**

- This tool is for **content moderation** and **policy compliance**
- **False positives and negatives** are possible with any AI system
- Users are **responsible** for ensuring their content complies with Telegram's Terms of Service
- The developers are **not responsible** for channel bans or content violations

---

## 💬 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/sadiakant/n8n-nodes-telegram-censor/issues)
- **Email**: krushnakantsadiya@gmail.com
- **NPM Package**: [n8n-nodes-telegram-censor](https://www.npmjs.com/package/n8n-nodes-telegram-censor)

-----

## 👥 Contributors

| Agent | Expertise & Role |
| :---: | :--- |
| <a href="https://github.com/sadiakant"><img src="https://github.com/sadiakant.png" width="60" style="border-radius: 50%; border: 2px solid #0052CC;"/></a> | **Krushnakant Sadiya** <br> `Project Lead` • Architecture & Core Development |
| <a href="https://deepmind.google/technologies/gemini/"><img src="https://github.com/google-gemini.png" width="60" style="border-radius: 50%; border: 2px solid #FF4F00;"/></a> | **Gemini AI** <br> `Debug & Fix` • Error Resolution & Logic |
| <a href="https://github.com/cline/cline"><img src="https://github.com/cline.png" width="60" style="border-radius: 50%; border: 2px solid #2EA44F;"/></a> | **Cline AI** <br> `Implementation` • Core Modules & Bugs |
| <a href="https://kimi.moonshot.cn/"><img src="https://github.com/MoonshotAI.png" width="60" style="border-radius: 50%; border: 2px solid #FF0080;"/></a> | **Kimi K2 AI** <br> `Visual Design` • Logo & Brand Assets |
| <a href="https://grok.x.ai/"><img src="https://github.com/xai-org.png" width="60" style="border-radius: 50%; border: 2px solid #000000;"/></a> | **Grok AI** <br> `Optimization` • Performance Tuning |
| <a href="https://chat.openai.com/"><img src="https://github.com/openai.png" width="60" style="border-radius: 50%; border: 2px solid #10A37F;"/></a> | **ChatGPT AI** <br> `Base Engine` • Foundation & Boilerplate |

---

<p align="center">
  <sub>Built with precision. Optimized by agents. Managed by <b>Sadiakant</b>.</sub>
</p>

## 🏷️ Keywords

telegram censor, telegram nudity filter, telegram nsfw filter, telegram adult content filter, telegram channel protection, telegram group moderation, telegram content moderation, telegram policy compliance, telegram ban prevention, telegram porn filter, n8n telegram, n8n content moderation, local ai moderation, nudenet onnx, telegram image blur, telegram auto moderator, telegram channel ban, telegram group ban, telegram policy violation, telegram adult content ban, telegram censorship, telegram moderation bot, telegram privacy, telegram local processing, telegram ai detection, telegram content safety

