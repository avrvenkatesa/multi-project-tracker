const fs = require('fs').promises;
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

async function extractTextFromFile(filePath, mimeType) {
  try {
    console.log(`Extracting text from: ${filePath} (${mimeType})`);
    
    // Get file extension as fallback for MIME type detection
    const ext = path.extname(filePath).toLowerCase();
    
    if (mimeType === 'application/pdf') {
      return await extractFromPDF(filePath);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await extractFromDOCX(filePath);
    } else if (mimeType === 'application/msword') {
      return await extractFromDOC(filePath);
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/x-markdown' || ext === '.txt' || ext === '.md') {
      // Handle text/markdown files (including those with incorrect MIME types)
      return await extractFromTXT(filePath);
    } else if (mimeType && mimeType.startsWith('image/')) {
      return '[Image file - text extraction not yet supported. OCR coming soon.]';
    } else {
      return `[Unsupported file type: ${mimeType}]`;
    }
  } catch (error) {
    console.error('Text extraction error:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

async function extractFromPDF(filePath) {
  let parser = null;
  try {
    const dataBuffer = await fs.readFile(filePath);
    parser = new PDFParse({ data: dataBuffer });
    
    const data = await parser.getText();
    
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('PDF appears to be empty or contains only images');
    }
    
    return data.text;
  } catch (error) {
    if (error.message.includes('empty')) {
      throw error;
    }
    throw new Error(`PDF extraction failed: ${error.message}`);
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}

async function extractFromDOCX(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('DOCX appears to be empty');
    }
    
    if (result.messages && result.messages.length > 0) {
      console.log('Mammoth extraction messages:', result.messages);
    }
    
    return result.value;
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error.message}`);
  }
}

async function extractFromDOC(filePath) {
  try {
    return await extractFromDOCX(filePath);
  } catch (error) {
    throw new Error('Old .doc format not fully supported. Please save as .docx');
  }
}

async function extractFromTXT(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf-8');
    
    if (!text || text.trim().length === 0) {
      throw new Error('Text file is empty');
    }
    
    return text;
  } catch (error) {
    throw new Error(`Text file reading failed: ${error.message}`);
  }
}

function truncateToTokenLimit(text, maxTokens = 4000) {
  const maxChars = maxTokens * 4;
  
  if (text.length <= maxChars) {
    return text;
  }
  
  const truncated = text.substring(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = Math.max(lastPeriod, lastNewline);
  
  const finalText = cutPoint > maxChars * 0.9 
    ? truncated.substring(0, cutPoint + 1)
    : truncated;
  
  return finalText + '\n\n[... document truncated due to length ...]';
}

function validateFileSize(fileSize, maxSizeMB = 10) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return fileSize <= maxSizeBytes;
}

function getSupportedMimeTypes() {
  return [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'text/x-markdown'
  ];
}

function isFileTypeSupported(mimeType) {
  return getSupportedMimeTypes().includes(mimeType);
}

module.exports = {
  extractTextFromFile,
  truncateToTokenLimit,
  validateFileSize,
  getSupportedMimeTypes,
  isFileTypeSupported
};
