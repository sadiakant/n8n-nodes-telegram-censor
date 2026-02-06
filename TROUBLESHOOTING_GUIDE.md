# Telegram Censor - Troubleshooting Guide

## Overview

This comprehensive troubleshooting guide helps you diagnose and resolve common issues with the Telegram Censor n8n node. Whether you're facing authentication problems, AI model issues, or operation errors, this guide provides step-by-step solutions.

## 🚨 Common Issues & Solutions

### **Authentication Errors**

#### **"Invalid session string" Error**
**Problem**: Session string is not recognized or corrupted.

**Causes:**
- Incorrect session string format
- Extra spaces or characters
- Session string from different API credentials
- Session already in use elsewhere

**Solutions:**
1. **Verify Session String Format**
   ```bash
   # Correct format: "123456:abcdef1234567890abcdef1234567890abcdef12"
   # Check for extra spaces or line breaks
   ```

2. **Regenerate Session String**
   - Use our [Telegram GramPro](https://github.com/sadiakant/n8n-nodes-telegram-grampro) node for reliable session generation
   - Follow the [Authorization Guide](AUTHORIZATION_GUIDE.md) carefully
   - Copy session string directly without manual editing

3. **Check Session Conflicts**
   - Close other Telegram clients using the same session
   - Generate new session string if conflicts persist
   - Restart n8n after session change

---

#### **"Session already in use" Error**
**Problem**: Another client is using the same session.

**Causes:**
- Multiple n8n instances using same session
- Telegram app using the same session
- Previous session not properly closed

**Solutions:**
1. **Close Other Clients**
   - Close other Telegram apps on your device
   - Stop other n8n instances using the same session
   - Log out from web.telegram.org

2. **Generate New Session**
   - Create a completely new session string
   - Use different API credentials if possible
   - Restart n8n after session change

3. **Wait for Session Timeout**
   - Telegram sessions timeout after ~24 hours of inactivity
   - Wait and try again later

---

#### **"Connection failed" Error**
**Problem**: Cannot connect to Telegram servers.

**Causes:**
- Invalid API credentials
- Network connectivity issues
- Firewall blocking connections
- VPN/proxy interference

**Solutions:**
1. **Verify API Credentials**
   - Check API ID and API Hash from [my.telegram.org](https://my.telegram.org)
   - Ensure no extra spaces or characters
   - Test credentials with a simple operation

2. **Check Network Connectivity**
   ```bash
   # Test internet connection
   ping google.com
   
   # Test Telegram connectivity
   telnet web.telegram.org 443
   ```

3. **Firewall and VPN Issues**
   - Ensure port 443 (HTTPS) is open
   - Allow n8n and Node.js through firewall
   - Try disabling VPN temporarily
   - Check proxy settings in n8n

---

### **AI Model Issues**

#### **"Model not found" Error**
**Problem**: NudeNet AI model file is missing.

**Causes:**
- Build process not completed
- Model file not copied to dist directory
- File permissions issues

**Solutions:**
1. **Run Build Process**
   ```bash
   # Ensure build is complete
   npm run build
   
   # Check if model exists
   ls dist/models/NudeNet-v3.4-weights-320n.onnx
   ```

2. **Verify File Structure**
   ```
   dist/
   ├── models/
   │   └── NudeNet-v3.4-weights-320n.onnx
   ├── icons/
   │   └── telegram-censor.svg
   └── nodes/
       └── TelegramCensor.node.js
   ```

3. **Check File Permissions**
   ```bash
   # Ensure model file is readable
   chmod 644 dist/models/NudeNet-v3.4-weights-320n.onnx
   ```

---

#### **"Out of memory" Error**
**Problem**: System runs out of memory during AI processing.

**Causes:**
- Large image files
- Multiple concurrent operations
- Insufficient system memory
- Memory leaks

**Solutions:**
1. **Enable Memory Monitoring**
   ```bash
   # Set environment variable for debug logs
   export N8N_LOG_LEVEL=debug
   
   # Monitor memory usage
   npm run dev
   ```

2. **Optimize Image Processing**
   - Process images in smaller batches
   - Reduce image resolution before scanning
   - Use memory-efficient image formats

3. **System Optimization**
   - Close other memory-intensive applications
   - Increase system swap space if possible
   - Monitor for memory leaks in long-running workflows

---

#### **"Detection failed" Error**
**Problem**: AI model fails to detect content properly.

**Causes:**
- Model loading issues
- Image format problems
- Confidence threshold too high
- Model corruption

**Solutions:**
1. **Check Model Loading**
   - Verify model file integrity
   - Check for model loading errors in logs
   - Ensure ONNX runtime is properly installed

2. **Verify Image Format**
   - Ensure images are in supported formats (JPEG, PNG)
   - Check image dimensions and quality
   - Test with known good images

3. **Adjust Confidence Threshold**
   ```json
   {
     "minConfidence": 0.3  // Try lowering from 0.4 to 0.3
   }
   ```

---

### **Operation Errors**

#### **"Blur too weak" Error**
**Problem**: Blurred images are not sufficiently obscured.

**Causes:**
- Blur strength too low
- Image resolution too high
- Detection accuracy issues

**Solutions:**
1. **Increase Blur Strength**
   ```json
   {
     "blurStrength": 60  // Increase from 35 to 60
   }
   ```

2. **Adjust Detection Settings**
   - Lower confidence threshold for more detections
   - Ensure all relevant detection classes are enabled
   - Test with different blur strengths

3. **Image Quality Considerations**
   - Higher resolution images may need stronger blur
   - Consider image compression before processing
   - Test with different image formats

---

#### **"False positives" Error**
**Problem**: Safe images are incorrectly flagged as inappropriate.

**Causes:**
- Confidence threshold too low
- Model sensitivity too high
- Image quality issues

**Solutions:**
1. **Increase Confidence Threshold**
   ```json
   {
     "minConfidence": 0.7  // Increase from 0.4 to 0.7
   }
   ```

2. **Filter Detection Classes**
   ```json
   {
     "detectClasses": [
       "FEMALE_GENITALIA_EXPOSED",
       "MALE_GENITALIA_EXPOSED"
     ]
   }
   ```

3. **Image Quality Check**
   - Ensure images are clear and well-lit
   - Avoid images with shadows or poor contrast
   - Test with different image sources

---

#### **"Replace image failed" Error**
**Problem**: Cannot replace media in existing messages.

**Causes:**
- Insufficient permissions
- Invalid message ID
- File format issues
- Telegram API limits

**Solutions:**
1. **Check Permissions**
   - Ensure you have admin rights in the channel/group
   - Verify you can edit messages in the chat
   - Check if the message was sent by your account

2. **Verify Message Details**
   - Ensure message ID is correct
   - Confirm the message contains media
   - Check if the message is recent enough to edit

3. **File Format Requirements**
   - Ensure replacement image is in supported format
   - Check file size limits
   - Verify image dimensions

---

### **Performance Issues**

#### **"Slow processing" Error**
**Problem**: Operations take too long to complete.

**Causes:**
- Large image files
- High-resolution images
- Multiple concurrent operations
- System resource limitations

**Solutions:**
1. **Optimize Image Processing**
   - Reduce image resolution before scanning
   - Process images in smaller batches
   - Use faster storage (SSD vs HDD)

2. **System Optimization**
   - Close other resource-intensive applications
   - Increase system memory if possible
   - Monitor CPU and memory usage

3. **Workflow Optimization**
   - Add delays between operations
   - Use parallel processing carefully
   - Implement caching for repeated operations

---

#### **"High memory usage" Error**
**Problem**: System memory consumption is excessive.

**Causes:**
- Multiple large images processed simultaneously
- Memory leaks in long-running workflows
- Insufficient system memory
- Sharp cache not disabled

**Solutions:**
1. **Enable Memory Optimization**
   - Sharp cache is disabled by default in the code
   - Process images one at a time
   - Clear temporary files regularly

2. **Monitor Memory Usage**
   ```bash
   # Enable debug logging
   export N8N_LOG_LEVEL=debug
   
   # Monitor memory in real-time
   npm run dev
   ```

3. **System Management**
   - Restart n8n periodically
   - Monitor for memory leaks
   - Use memory-efficient image processing

---

### **Media Download Issues**

#### **"File not found" Error**
**Problem**: Media file cannot be downloaded.

**Causes:**
- Invalid message ID
- File deleted or expired
- Insufficient permissions
- Network issues

**Solutions:**
1. **Verify Message ID**
   - Ensure correct message ID is used
   - Check message exists in chat
   - Verify message contains media

2. **Check File Availability**
   - Ensure file hasn't been deleted
   - Check file expiration (some files expire)
   - Verify file size limits

3. **Permissions Check**
   - Ensure access to the chat
   - Verify file download permissions
   - Check for file restrictions

---

#### **"Download timeout" Error**
**Problem**: Media download takes too long or fails.

**Solutions:**
1. **Check File Size**
   - Large files take longer to download
   - Monitor download progress
   - Consider file size limits

2. **Network Issues**
   - Check internet speed
   - Monitor for network interruptions
   - Try downloading smaller files first

3. **Storage Space**
   - Ensure sufficient disk space
   - Check file system permissions
   - Monitor storage usage

---

## 🔧 Advanced Troubleshooting

### **Debug Mode Setup**

Enable detailed logging for troubleshooting:

1. **Set Environment Variable**
   ```bash
   export N8N_LOG_LEVEL=debug
   ```

2. **Restart n8n**
   ```bash
   # Stop n8n
   pkill -f n8n
   
   # Start with debug mode
   n8n start
   ```

3. **Monitor Logs**
   ```bash
   # View n8n logs
   tail -f ~/.n8n/logs/n8n.log
   
   # Filter for Telegram errors
   tail -f ~/.n8n/logs/n8n.log | grep -i "telegram\|censor"
   ```

### **Memory Monitoring**

Track memory usage during operations:

```bash
# Monitor n8n memory usage
ps aux | grep n8n

# Check for memory leaks
top -p $(pgrep n8n)

# View memory logs
grep -i "memory" ~/.n8n/logs/n8n.log
```

### **Model Validation**

Test AI model functionality:

1. **Check Model Loading**
   ```bash
   # Verify model file exists
   ls -la dist/models/
   
   # Check file size (should be ~100MB)
   du -h dist/models/NudeNet-v3.4-weights-320n.onnx
   ```

2. **Test Model Loading**
   - Create a simple workflow with just the Scanner operation
   - Use a known test image
   - Monitor for model loading errors

### **Network Diagnostics**

Test connectivity to Telegram:

```bash
# Test basic connectivity
ping api.telegram.org

# Test DNS resolution
nslookup api.telegram.org

# Test HTTPS connectivity
curl -I https://api.telegram.org

# Test WebSocket connectivity (if applicable)
wscat -c wss://web.telegram.org/
```

---

## 📋 Troubleshooting Checklist

### **Authentication Issues**
- [ ] Session string format correct
- [ ] No extra spaces or characters
- [ ] API credentials valid
- [ ] No session conflicts
- [ ] n8n restarted after session generation

### **AI Model Issues**
- [ ] Build process completed successfully
- [ ] Model file exists in dist/models/
- [ ] Model file is readable
- [ ] ONNX runtime properly installed
- [ ] Memory sufficient for model loading

### **Operation Issues**
- [ ] Correct chat/message IDs
- [ ] Sufficient permissions
- [ ] File formats supported
- [ ] File sizes within limits
- [ ] Network connectivity stable

### **Performance Issues**
- [ ] Images optimized for processing
- [ ] Memory usage monitored
- [ ] System resources adequate
- [ ] Workflow optimized for performance
- [ ] No memory leaks detected

### **Media Issues**
- [ ] Message contains media
- [ ] File not expired/deleted
- [ ] Sufficient storage space
- [ ] Network speed adequate
- [ ] File permissions correct

---

## 🆘 Getting Help

### **When to Seek Help**
- Issue persists after following troubleshooting steps
- Error messages are unclear or unexpected
- Multiple operations failing consistently
- Performance issues affecting workflows

### **Information to Provide**
When seeking help, include:
- **Error messages** (exact text)
- **n8n version** and **node version**
- **Workflow configuration** (redacted sensitive info)
- **Log files** (with sensitive data removed)
- **Steps to reproduce** the issue
- **System specifications** (memory, storage, OS)

### **Support Channels**
- **GitHub Issues**: [Report bugs or request features](https://github.com/sadiakant/n8n-nodes-telegram-censor/issues)
- **Email**: krushnakantsadiya@gmail.com
- **NPM Package**: [n8n-nodes-telegram-censor](https://www.npmjs.com/package/n8n-nodes-telegram-censor)

---

## 🎯 Prevention Tips

### **Best Practices**
1. **Regular Maintenance**
   - Restart n8n periodically
   - Monitor system resources
   - Clean up old logs and temporary files

2. **Session Management**
   - Generate new sessions regularly
   - Monitor session usage
   - Keep backup sessions ready

3. **Performance Monitoring**
   - Enable debug logging for monitoring
   - Track memory usage patterns
   - Optimize workflows based on usage

4. **Security**
   - Store credentials securely
   - Use encrypted session strings
   - Monitor for unauthorized access

5. **Testing**
   - Test with known good images
   - Verify all operations work correctly
   - Monitor for changes in behavior

This comprehensive troubleshooting guide should help you resolve most issues with Telegram Censor. If problems persist, consult the support channels or create a detailed issue report.