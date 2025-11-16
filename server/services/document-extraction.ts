import mammoth from 'mammoth';
import { ObjectStorageService } from '../objectStorage';

export class DocumentExtractionService {
  private objectStorageService: ObjectStorageService;

  constructor() {
    this.objectStorageService = new ObjectStorageService();
  }

  /**
   * Extract text content from a document stored in object storage
   */
  async extractTextFromDocument(fileUrl: string, fileType: string): Promise<string> {
    try {
      // Get file from object storage
      const objectFile = await this.objectStorageService.getObjectEntityFile(fileUrl);
      
      // Download file content as buffer
      const fileBuffer = await this.downloadFileAsBuffer(objectFile);

      // Extract text based on file type
      switch (fileType.toLowerCase()) {
        case 'txt':
        case 'md':
          return fileBuffer.toString('utf-8');

        case 'pdf':
          return await this.extractPdfText(fileBuffer);

        case 'docx':
          return await this.extractDocxText(fileBuffer);

        case 'doc':
          // Old .doc format is not supported by mammoth
          // Return a note about this
          return '[Note: .doc format text extraction not available. Please convert to .docx or PDF]';

        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      console.error(`Error extracting text from ${fileUrl}:`, error);
      throw error;
    }
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // Dynamic import for CommonJS pdf-parse module
      const pdfParseModule = await import('pdf-parse');
      // Try default export first, then the module itself
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await (pdfParse as any)(buffer);
      return data.text;
    } catch (error) {
      console.error('PDF parsing error:', error);
      return '[Error: Could not extract text from PDF]';
    }
  }

  /**
   * Extract text from DOCX using mammoth
   */
  private async extractDocxText(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('DOCX parsing error:', error);
      return '[Error: Could not extract text from DOCX]';
    }
  }

  /**
   * Download file from object storage as a buffer
   */
  private async downloadFileAsBuffer(objectFile: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = objectFile.createReadStream();
      
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
