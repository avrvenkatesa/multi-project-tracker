/**
 * Document Service
 * Phase 3b Feature 6: Document Upload + AI Checklist Generation
 * Handles document upload and text extraction from memory buffers
 */

const pdfParse = require('pdf-parse');
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
      const data = await pdfParse(fileBuffer);
      
      return {
        text: data.text,
        pageCount: data.numpages,
        metadata: {
          info: data.info,
          filename: filename
        },
        success: true
      };
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
    
    if (mimeType === 'text/plain' || filename.endsWith('.txt')) {
      return {
        text: fileBuffer.toString('utf-8'),
        pageCount: null,
        metadata: {
          filename: filename
        },
        success: true
      };
    }
    
    throw new Error(`Unsupported file type: ${mimeType}. Please upload PDF, DOCX, or TXT files.`);
    
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
    'text/plain'
  ];
  
  const maxSize = 10 * 1024 * 1024;
  
  if (!allowedTypes.includes(file.mimetype) && 
      !file.originalname.match(/\.(pdf|docx|txt)$/i)) {
    throw new Error('Invalid file type. Please upload PDF, DOCX, or TXT files only.');
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
