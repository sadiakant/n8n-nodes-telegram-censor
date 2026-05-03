# Telegram Censor - Operations Guide

## Overview

This guide provides comprehensive documentation for all operations available in the Telegram Censor n8n node. Each operation is designed to help you moderate content and protect your Telegram channels from policy violations.

As of `3.0.0`, the node is organized into three resources:

- **Message** for fetching, editing, and sending Telegram messages
- **Media** for downloading message media into n8n binary data
- **Moderation** for local NudeNet scanning and blur operations

## 🎯 Operations Reference

### **Message Operations**

#### **📥 Get Messages**
Fetch messages from a chat with optional time and media filters for content moderation.

**Purpose**: Retrieve messages to scan for inappropriate content before it gets flagged by Telegram.

**Parameters**:
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Mode**: Recent Messages (Limit), Last X Hours, or Date Range
- **Limit**: Number of recent messages to fetch (Mode = Limit)
- **Last Hours**: How many hours back to scan (Mode = Last X Hours)
- **From Date**: Start date/time (Mode = Date Range)
- **To Date**: End date/time (Mode = Date Range)
- **Max Messages**: Safety cap for very active chats (Mode = Last X Hours / Date Range)
- **Has Media**: Only return messages that contain media
- **Media Type**: Filter by Photo, Video, or Document

**Example**:
```json
{
  "operation": "getMessages",
  "chatId": "@channel_name",
  "mode": "hours",
  "hours": 6,
  "maxMessages": 500,
  "onlyMedia": true,
  "mediaType": ["photo", "video"]
}
```

**Use Cases**:
- **Daily Channel Audit**: Scan last 24 hours for policy violations
- **Real-time Monitoring**: Check last few hours for new content
- **Batch Processing**: Review specific date ranges for compliance
- **Media-only Scanning**: Focus on images and videos that could trigger bans

**Output**:
```json
{
  "messageId": 12345,
  "chatId": "@channel_name",
  "date": "2024-01-15T10:30:00.000Z",
  "text": "Check out this photo!",
  "hasMedia": true,
  "mediaType": "photo"
}
```

---

#### **💾 Download Media**
Download photos, videos, or documents from messages for analysis and moderation.

**Purpose**: Extract media files so they can be scanned for inappropriate content.

**Parameters**:
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Message ID**: ID of message containing media to download

**Example**:
```json
{
  "operation": "downloadMedia",
  "chatId": "@channel_name",
  "messageId": 12345
}
```

**Use Cases**:
- **Content Analysis**: Download images for AI scanning
- **Evidence Collection**: Save potentially problematic media
- **Backup Creation**: Archive important media files
- **Quality Control**: Review media before posting

**Outputs**:
- **Success Output**: Returns the original item metadata with a `media` binary property
- **No Media Output**: Returns items that did not contain downloadable media so workflows can branch cleanly

**Output**:
```json
{
  "messageId": 12345,
  "chatId": "@channel_name",
  "media": {
    "fileName": "media_12345.jpg",
    "mimeType": "image/jpeg",
    "size": 1024000
  }
}
```

---

#### **🔍 Scanner**
Detect nudity using local AI (NudeNet) with confidence scoring for policy compliance.

**Purpose**: Analyze images for exposed body parts that could trigger Telegram's content policies.

**Parameters**:
- **Minimum Confidence**: Only detect parts with confidence above this threshold (0.0-1.0)
- **Input Requirement**: Scanner accepts image media only (`image/*` MIME types)

**Example**:
```json
{
  "operation": "nudeNetScanner",
  "minConfidence": 0.4
}
```

**Use Cases**:
- **Pre-moderation**: Scan images before posting to avoid bans
- **Post-moderation**: Review existing content for compliance
- **Automated Filtering**: Set up workflows to automatically flag inappropriate content
- **Quality Assurance**: Ensure all posted content meets policy requirements

**Output**:
```json
{
  "isNsfw": true,
  "nsfwParts": ["FEMALE_BREAST_EXPOSED", "BUTTOCKS_EXPOSED"],
  "detections": [
    {
      "class": "FEMALE_BREAST_EXPOSED",
      "score": 0.85,
      "box": [120, 80, 200, 160]
    }
  ],
  "detectionCount": 2
}
```

**Detection Classes**:
- **Unsafe Classes** (Auto-flagged): Female/Male genitalia exposed, breasts exposed, buttocks exposed, anus exposed
- **Additional Classes**: Covered body parts, face detection, armpits, belly, feet

---

#### **🎨 Blur**
Apply selective blur to detected sensitive regions while preserving image quality.

**Purpose**: Make inappropriate content safe for Telegram by blurring only the problematic areas.

**Parameters**:
- **Blur Strength**: Control blur intensity (0-100, higher = more blur)

**Example**:
```json
{
  "operation": "nudeNetBlur",
  "blurStrength": 35
}
```

**Use Cases**:
- **Content Sanitization**: Blur inappropriate areas while keeping the rest of the image
- **Privacy Protection**: Hide sensitive information in images
- **Compliance**: Make content safe for Telegram's policies
- **Quality Preservation**: Maintain image quality outside of blurred areas

**Output**:
```json
{
  "blurred": true,
  "status": "Blurred",
  "originalQuality": "Preserved",
  "media": {
    "fileName": "safe_12345.jpg",
    "mimeType": "image/jpeg",
    "size": 1024000
  }
}
```

---

#### **📝 Replace Text**
Replace message text or media captions without changing the attached file.

**Purpose**: Correct wording, captions, or policy notices while keeping the original media untouched.

**Parameters**:
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Message ID**: ID of the message to update
- **Text / Caption**: New text for a text message or new caption for a media message

**Example**:
```json
{
  "operation": "editMessageText",
  "chatId": "@channel_name",
  "messageId": 12345,
  "editText": "Caption updated after moderation review"
}
```

**Use Cases**:
- **Caption Correction**: Fix unsafe or inaccurate captions after review
- **Status Updates**: Add moderation notes without re-uploading media
- **Text-only Maintenance**: Keep media intact while refreshing copy

---

#### **🔄 Replace Image**
Replace media in existing messages with blurred/safe versions.

**Purpose**: Update existing messages with censored content to prevent channel bans.

**Parameters**:
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Message ID**: ID of message containing media to replace
- **Text / Caption**: Updates message text for text messages, or caption for media messages
- **Media URL**: Optional replacement media URL
- **Zero Media**: If enabled and Media URL is empty, remove media from the message
- **Input Binary (Automatic)**: If no Media URL and Zero Media is off, Replace uses incoming binary automatically (prefers `media`, otherwise first binary field)

**Priority Order**:
1. If `Media URL` is provided → replace media from URL
2. Else if `Zero Media = true` → remove media
3. Else if input binary exists → replace media from input binary
4. Else → update text/caption only

**Example A: Replace using blurred output**:
```json
{
  "operation": "editMessage",
  "chatId": "@channel_name",
  "messageId": 12345,
  "text": "Here's the updated safe version",
  "editZeroMedia": false
}
```

**Example B: Replace using direct URL**:
```json
{
  "operation": "editMessage",
  "chatId": "@channel_name",
  "messageId": 12345,
  "text": "Replaced from trusted URL",
  "editMediaUrl": "https://cdn.example.com/safe-image.jpg",
  "editZeroMedia": false
}
```

**Example C: Hard delete media (Zero Media)**:
```json
{
  "operation": "editMessage",
  "chatId": "@channel_name",
  "messageId": 12345,
  "text": "Media removed by moderation policy",
  "editZeroMedia": true
}
```

**Use Cases**:
- **Content Correction**: Replace inappropriate images with blurred versions
- **Policy Compliance**: Fix existing violations before they trigger bans
- **User Safety**: Protect channels from accidental policy violations
- **Content Management**: Maintain clean and compliant content libraries

**Output**:
```json
{
  "messageId": 12345,
  "chatId": "@channel_name",
  "status": "Success",
  "action": "Media replaced with safe version",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Note**:
- Zero-media edit can fail due to Telegram permissions or message constraints. The node retries and then returns an error if deletion is not allowed.

---

#### **✉️ Send Message**
Send a new Telegram message with optional formatting, reply targeting, and media attachment.

**Purpose**: Post alerts, moderation summaries, or replacement content directly from the same node.

**Parameters**:
- **Send to Saved Messages**: Sends to `me` and hides the chat field
- **Chat ID**: Username (@channel), invite link, or numeric ID when not sending to self
- **Message Text**: Body text of the outgoing message
- **Parse Mode**: `HTML` or `MarkdownV2`
- **Reply to Message (ID)**: Optional reply target
- **Show Web Preview**: Whether Telegram should generate URL previews
- **Attach Media**: Enables uploading a binary file or direct URL
- **Media Type**: Auto detect, Photo, Video, or Document
- **Binary Property**: Binary field name to upload when using n8n binary input
- **Media URL**: Optional public `http/https` URL when binary input is not available

**Example A: Send a text-only alert**:
```json
{
  "operation": "sendMessage",
  "sendChatId": "@channel_name",
  "sendText": "Moderation audit completed successfully.",
  "sendParseMode": "markdownv2"
}
```

**Example B: Send media from upstream binary data**:
```json
{
  "operation": "sendMessage",
  "sendChatId": "@channel_name",
  "sendText": "Safe version attached below.",
  "sendAttachMedia": true,
  "sendMediaType": "photo",
  "sendMediaBinaryProperty": "media"
}
```

**Use Cases**:
- **Admin Alerts**: Notify moderators when NSFW content is detected
- **Safe Reposting**: Publish blurred media as a new message
- **Saved Messages Workflow**: Send test output to your own Telegram account

---

## 🚀 Workflow Integration Examples

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

## 📊 Configuration Options

### **Scanner Settings**
```json
{
  "minConfidence": 0.4 // 0.0 - 1.0 (lower = more sensitive)
}
```

**Confidence Threshold Guide**:
- **0.2-0.3**: Very sensitive (catches almost everything, may have false positives)
- **0.4-0.5**: Balanced (good for most use cases)
- **0.6-0.8**: Conservative (fewer false positives, may miss some violations)
- **0.9+**: Very conservative (only obvious violations)

### **Blur Settings**
```json
{
  "blurStrength": 35 // 1 - 100 (higher = more blur)
}
```

**Blur Strength Guide**:
- **10-20**: Light blur (subtle privacy protection)
- **30-50**: Medium blur (good for policy compliance)
- **60-80**: Heavy blur (maximum privacy)
- **90-100**: Extreme blur (complete obscuring)

### **Send Message Settings**
```json
{
  "sendParseMode": "markdownv2",
  "sendAttachMedia": true,
  "sendMediaType": "auto",
  "sendMediaBinaryProperty": "media",
  "sendWebPreview": false
}
```

**Send Message Notes**:
- Use `sendToSelf = true` to test flows safely in Saved Messages
- `sendMediaType = auto` infers type from MIME type first, then from URL extension
- Only public `http/https` URLs are supported for direct media URL uploads

---

## 🎯 Best Practices

### **Content Moderation Strategy**
1. **Set Appropriate Confidence**: Start with 0.4 and adjust based on your needs
2. **Use Time-based Scanning**: Check recent content regularly
3. **Focus on Media**: Images and videos are most likely to trigger violations
4. **Keep Logs**: Track what gets flagged for future reference
5. **Test with Known Content**: Verify the system works with test images

### **Performance Optimization**
1. **Batch Processing**: Process multiple images at once when possible
2. **Memory Management**: Monitor memory usage during large scans
3. **Rate Limiting**: Don't overwhelm Telegram's API
4. **Selective Scanning**: Focus on high-risk content types
5. **Regular Maintenance**: Clean up old logs and temporary files

### **Security Considerations**
1. **Secure Credentials**: Use n8n's credential management
2. **Monitor Access**: Track who has access to the moderation system
3. **Backup Plans**: Have manual review processes as backup
4. **Audit Logs**: Keep records of all moderation actions
5. **Privacy Protection**: Handle sensitive content appropriately

---

## 🚨 Troubleshooting

### **Common Issues**

#### **"Model not found" Error**
**Solution**: Run `npm run build` to copy the AI model to the dist directory

#### **"Out of memory" Error**
**Solution**: Enable debug logs to monitor memory usage and reduce batch sizes

#### **"Connection failed" Error**
**Solution**: Check session string validity and ensure proper authentication

#### **"Blur too weak" Error**
**Solution**: Increase blurStrength parameter (try 50-70 for stronger blur)

#### **"False positives" Error**
**Solution**: Increase minConfidence threshold (try 0.6-0.8)

### **Performance Issues**

#### **Slow Processing**
- Reduce image resolution before scanning
- Process fewer images at once
- Increase system memory if possible
- Use faster storage (SSD vs HDD)

#### **High Memory Usage**
- Enable memory monitoring
- Process images in smaller batches
- Clear temporary files regularly
- Monitor for memory leaks

#### **API Rate Limits**
- Add delays between operations
- Use n8n's built-in rate limiting
- Monitor API usage patterns
- Implement exponential backoff

---

## 📈 Monitoring and Analytics

### **Key Metrics to Track**
- **Detection Rate**: Percentage of images flagged as inappropriate
- **False Positive Rate**: Percentage of safe images incorrectly flagged
- **Processing Time**: Average time to scan and process images
- **Memory Usage**: Peak memory consumption during operations
- **Success Rate**: Percentage of operations that complete successfully

### **Logging Best Practices**
- Log all moderation actions for audit trails
- Track confidence scores for analysis
- Monitor system performance metrics
- Record any errors or failures
- Keep logs for compliance and improvement

### **Alerting Setup**
- Set up notifications for high-risk content
- Alert on system failures or errors
- Monitor for unusual activity patterns
- Track policy violation trends
- Notify administrators of batch processing results

---

## 🔗 Integration with Other Tools

### **n8n Native Integrations**
- **Email**: Send notifications about detected violations
- **Slack**: Post moderation alerts to team channels
- **Google Drive**: Store processed images and logs
- **Database**: Track moderation history and statistics
- **Webhooks**: Integrate with external moderation services

### **External Services**
- **Cloud Storage**: Store large volumes of processed images
- **Analytics**: Track moderation effectiveness over time
- **Backup Systems**: Archive important moderation decisions
- **Security Tools**: Integrate with broader content security systems

This comprehensive operations guide provides everything needed to effectively use all Telegram Censor operations in your n8n workflows for content moderation and policy compliance.
