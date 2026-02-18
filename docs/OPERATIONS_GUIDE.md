# Telegram Censor - Operations Guide

## Overview

This guide provides comprehensive documentation for all operations available in the Telegram Censor n8n node. Each operation is designed to help you moderate content and protect your Telegram channels from policy violations.

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
Download photos or documents from messages for analysis and moderation.

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

#### **🔄 Replace Image**
Replace media in existing messages with blurred/safe versions.

**Purpose**: Update existing messages with censored content to prevent channel bans.

**Parameters**:
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Message ID**: ID of message containing media to replace
- **Text (Caption)**: Optional text to update the message caption

**Example**:
```json
{
  "operation": "editMessage",
  "chatId": "@channel_name",
  "messageId": 12345,
  "text": "Here's the updated safe version"
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
  "minConfidence": 0.4,    // 0.0 - 1.0 (lower = more sensitive)
  "detectClasses": [        // Optional: filter specific classes
    "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED",
    "FEMALE_BREAST_EXPOSED"
  ]
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
  "blurStrength": 35,      // 0 - 100 (higher = more blur)
  "brightness": 0.9        // Dim blurred regions slightly
}
```

**Blur Strength Guide**:
- **10-20**: Light blur (subtle privacy protection)
- **30-50**: Medium blur (good for policy compliance)
- **60-80**: Heavy blur (maximum privacy)
- **90-100**: Extreme blur (complete obscuring)

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