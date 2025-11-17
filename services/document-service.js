/**
 * Document Service
 * Phase 3b Feature 6: Document Upload + AI Checklist Generation
 * Handles document upload and text extraction from memory buffers
 */

const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extract text from uploaded document buffer
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} mimeType - File MIME type
 * @param {string} filename - Original filename
 * @returns {object} { text, pageCount, metadata }
 */
async function extractTextFromDocument(fileBuffer, mimeType, filename) {
  console.log(`📄 Extracting text from: ${filename} (${mimeType})`);
  
  try {
    if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
      // pdf-parse v2.x API: use PDFParse class
      const parser = new PDFParse({ data: fileBuffer });
      
      try {
        // Get text content
        const textResult = await parser.getText();
        
        // Get info/metadata
        const infoResult = await parser.getInfo({ parsePageInfo: true });
        
        return {
          text: textResult.text,
          pageCount: infoResult.total || null,
          metadata: {
            info: infoResult.info || {},
            filename: filename
          },
          success: true
        };
      } finally {
        // Always destroy parser to free resources
        await parser.destroy();
      }
    }
    
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        filename.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      
      return {
        text: result.value,
        pageCount: null,
        metadata: {
          filename: filename,
          warnings: result.messages
        },
        success: true
      };
    }
    
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || 
        filename.endsWith('.txt') || filename.endsWith('.md')) {
      return {
        text: fileBuffer.toString('utf-8'),
        pageCount: null,
        metadata: {
          filename: filename,
          isMarkdown: filename.endsWith('.md')
        },
        success: true
      };
    }
    
    throw new Error(`Unsupported file type: ${mimeType}. Please upload PDF, DOCX, TXT, or Markdown files.`);
    
  } catch (error) {
    console.error('Error extracting text:', error);
    throw error;
  }
}

/**
 * Validate uploaded file
 * @param {object} file - Multer file object
 */
function validateDocumentFile(file) {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ];
  
  const maxSize = 10 * 1024 * 1024;
  
  if (!allowedTypes.includes(file.mimetype) && 
      !file.originalname.match(/\.(pdf|docx|txt|md)$/i)) {
    throw new Error('Invalid file type. Please upload PDF, DOCX, TXT, or Markdown files only.');
  }
  
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 10MB.');
  }
  
  return true;
}

module.exports = {
  extractTextFromDocument,
  validateDocumentFile
};
