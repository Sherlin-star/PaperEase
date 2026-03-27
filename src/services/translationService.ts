import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  AlignmentType,
  SectionType
} from 'docx';
import { requestAI, AIModel, SUPPORTED_MODELS } from '../config/aiConfig';

export interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  page: number;
  isReference?: boolean;
  fontName?: string;
  isBold?: boolean;
  isItalic?: boolean;
  color?: string;
  transform?: number[];
}

export interface ParagraphBlock {
  text: string;
  blocks: TextBlock[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  page: number;
  translatedText?: string;
  error?: boolean;
}

export interface TranslatedPage {
  pageNumber: number;
  paragraphs: ParagraphBlock[];
  canvas?: HTMLCanvasElement | null;
  status: 'pending' | 'translating' | 'completed' | 'error';
  error?: string;
}

export type TranslationMode = 'overlay' | 'bilingual';

export interface TranslationProgress {
  currentPage: number;
  totalPages: number;
  completedPages: number;
  status: 'extracting' | 'translating' | 'rendering' | 'exporting' | 'completed';
  message: string;
  elapsedTime: number;
  estimatedRemaining: number;
}

export class TranslationService {
  private pdfDocument: any;
  private model: AIModel;
  private apiKey: string;
  private progressCallback?: (progress: TranslationProgress) => void;
  private startTime: number = 0;
  private maxConcurrency: number = 5;

  constructor(pdfDocument: any, model: AIModel, apiKey: string) {
    this.pdfDocument = pdfDocument;
    this.model = model;
    this.apiKey = apiKey;
  }

  setProgressCallback(callback: (progress: TranslationProgress) => void) {
    this.progressCallback = callback;
  }

  private updateProgress(progress: Partial<TranslationProgress>) {
    const elapsed = this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
    const completedPages = progress.completedPages || 0;
    const totalPages = progress.totalPages || 1;
    const estimatedRemaining = completedPages > 0 
      ? (elapsed / completedPages) * (totalPages - completedPages) 
      : 0;

    this.progressCallback?.({
      currentPage: progress.currentPage || 0,
      totalPages: totalPages,
      completedPages: completedPages,
      status: progress.status || 'extracting',
      message: progress.message || '',
      elapsedTime: elapsed,
      estimatedRemaining: estimatedRemaining
    });
  }

  private isReferenceSection(text: string): boolean {
    const referenceKeywords = [
      'References', 'REFERENCES', 'Bibliography', 'BIBLIOGRAPHY',
      '参考文献', '引用文献', 'Literature Cited'
    ];
    return referenceKeywords.some(keyword => text.includes(keyword));
  }

  private isReferencePage(text: string, pageNum: number, totalPages: number): boolean {
    const referenceKeywords = [
      'References', 'REFERENCES', 'Bibliography', 'BIBLIOGRAPHY',
      '参考文献', '引用文献', 'Literature Cited'
    ];
    
    const hasReferenceKeyword = referenceKeywords.some(keyword => text.includes(keyword));
    
    const isLastPages = pageNum > totalPages * 0.7;
    
    const referencePatterns = [
      /\[\d+\]\s*[A-Z]/,
      /\(\d{4}\)\s*[A-Z]/,
      /\d+\.\s*[A-Z][a-z]+\s+[A-Z]/,
      /doi:\s*10\./i,
      /arXiv:/i
    ];
    
    const hasReferencePatterns = referencePatterns.some(pattern => pattern.test(text));
    
    return hasReferenceKeyword || (isLastPages && hasReferencePatterns);
  }

  private mergeTextBlocksIntoParagraphs(items: any[], pageNum: number, viewportHeight: number): ParagraphBlock[] {
    const textBlocks: TextBlock[] = items
      .filter((item: any) => 'str' in item && item.str.trim())
      .map((item: any) => {
        const transform = item.transform;
        return {
          text: item.str,
          x: transform[4],
          y: viewportHeight - transform[5],
          width: item.width,
          height: Math.abs(transform[0]) || item.height || 12,
          fontSize: Math.abs(transform[0]) || 12,
          page: pageNum,
          isReference: false,
          fontName: item.fontName || 'Helvetica',
          isBold: item.fontName?.includes('Bold') || false,
          isItalic: item.fontName?.includes('Italic') || false,
          color: item.color || '#000000',
          transform: transform
        };
      });

    if (textBlocks.length === 0) return [];

    textBlocks.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
      return a.x - b.x;
    });

    const paragraphs: ParagraphBlock[] = [];
    let currentParagraph: TextBlock[] = [];
    let lastY = -Infinity;
    let lastX = -Infinity;
    let inReferenceSection = false;

    for (const block of textBlocks) {
      if (this.isReferenceSection(block.text)) {
        inReferenceSection = true;
      }

      block.isReference = inReferenceSection;

      const yDiff = Math.abs(block.y - lastY);
      const xDiff = block.x - lastX;

      if (currentParagraph.length === 0) {
        currentParagraph.push(block);
      } else if (yDiff < 3 && xDiff < 20) {
        currentParagraph.push(block);
      } else {
        if (currentParagraph.length > 0 && !currentParagraph[0].isReference) {
          paragraphs.push(this.createParagraphBlock(currentParagraph));
        }
        currentParagraph = [block];
      }

      lastY = block.y;
      lastX = block.x + block.width;
    }

    if (currentParagraph.length > 0 && !currentParagraph[0].isReference) {
      paragraphs.push(this.createParagraphBlock(currentParagraph));
    }

    return paragraphs;
  }

  private createParagraphBlock(blocks: TextBlock[]): ParagraphBlock {
    const text = blocks.map(b => b.text).join(' ');
    const minX = Math.min(...blocks.map(b => b.x));
    const minY = Math.min(...blocks.map(b => b.y));
    const maxX = Math.max(...blocks.map(b => b.x + b.width));
    const maxY = Math.max(...blocks.map(b => b.y + b.height));
    const avgFontSize = blocks.reduce((sum, b) => sum + b.fontSize, 0) / blocks.length;

    return {
      text,
      blocks,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      fontSize: avgFontSize,
      page: blocks[0].page
    };
  }

  async extractParagraphsFromPage(pageNum: number, skipReferences: boolean = true): Promise<ParagraphBlock[]> {
    const page = await this.pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    
    const paragraphs = this.mergeTextBlocksIntoParagraphs(textContent.items, pageNum, viewport.height);
    
    if (skipReferences) {
      const fullPageText = paragraphs.map(p => p.text).join(' ');
      const totalPages = this.pdfDocument.numPages;
      
      if (this.isReferencePage(fullPageText, pageNum, totalPages)) {
        return [];
      }
      
      return paragraphs.filter(p => !this.isReferenceSection(p.text));
    }
    
    return paragraphs;
  }

  async translateParagraphs(paragraphs: ParagraphBlock[]): Promise<ParagraphBlock[]> {
    if (paragraphs.length === 0) return [];

    const prompt = `你是一位精通化学教育、统计学和数据科学的资深学术翻译。请将以下学术论文段落翻译为自然、专业的中文。

**翻译要求**：
1. **术语规范**：保持学术严谨性，专业术语准确翻译（如 Chemometrics 译为"化学计量学"，ANOVA 译为"方差分析"）
2. **严禁占位符**：绝对禁止输出任何 XXX、...、[待补充] 等占位符
3. **保留原样**：遇到公式、代码、专有名词无法翻译时，请保持原样
4. **长度适配**：译文长度应适中，确保能嵌入原 PDF 排版空间
5. **格式要求**：每段翻译前标注 [数字] 对应原文序号，直接返回译文，不要任何解释

待翻译段落：
${paragraphs.map((p, i) => `[${i}] ${p.text}`).join('\n\n')}

请按格式返回：
[0] 第一段译文
[1] 第二段译文
...`;

    // 模型优先级：硅基流动 > Kimi > DeepSeek
    const modelPriority = ['siliconflow', 'kimi', 'deepseek'];
    const availableModels = modelPriority
      .map(modelId => {
        const model = SUPPORTED_MODELS[modelId];
        const apiKey = localStorage.getItem(model.keyPrefix) || '';
        return { model, apiKey };
      })
      .filter(item => item.apiKey);

    // 首先尝试当前模型
    const currentModelIndex = availableModels.findIndex(item => item.model.name === this.model.name);
    if (currentModelIndex !== -1) {
      // 将当前模型移到列表首位
      const currentModel = availableModels.splice(currentModelIndex, 1)[0];
      availableModels.unshift(currentModel);
    }

    // 尝试所有可用模型
    for (const { model, apiKey } of availableModels) {
      try {
        console.log(`Attempting translation with model: ${model.name}`);
        const response = await requestAI({
          text: prompt,
          action: 'translate',
          apiKey: apiKey,
          model: model
        });

        if (response.error) {
          console.warn(`Model ${model.name} failed: ${response.error}`);
          continue; // 尝试下一个模型
        }

        const translations = this.parseTranslations(response.result, paragraphs.length);
        
        return paragraphs.map((p, i) => ({
          ...p,
          translatedText: translations[i] || p.text,
          error: !translations[i]
        }));
      } catch (error) {
        console.warn(`Model ${model.name} error:`, error);
        // 继续尝试下一个模型
        continue;
      }
    }

    // 所有模型都失败
    console.error('All models failed to translate');
    return paragraphs.map(p => ({
      ...p,
      translatedText: `[翻译失败] ${p.text.substring(0, 50)}...`,
      error: true
    }));
  }

  private parseTranslations(result: string, expectedCount: number): string[] {
    const translations: string[] = [];
    const lines = result.split('\n');
    let currentTranslation = '';
    let currentIndex = -1;

    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.*)$/);
      if (match) {
        if (currentIndex >= 0 && currentTranslation) {
          translations[currentIndex] = currentTranslation.trim();
        }
        currentIndex = parseInt(match[1]);
        currentTranslation = match[2];
      } else if (currentIndex >= 0) {
        currentTranslation += ' ' + line;
      }
    }

    if (currentIndex >= 0 && currentTranslation) {
      translations[currentIndex] = currentTranslation.trim();
    }

    for (let i = 0; i < expectedCount; i++) {
      if (!translations[i]) {
        translations[i] = '';
      }
    }

    return translations;
  }

  async translatePages(
    pageNumbers: number[],
    skipReferences: boolean = true,
    onProgress?: (progress: TranslationProgress) => void,
    onPageComplete?: (page: TranslatedPage) => void
  ): Promise<TranslatedPage[]> {
    this.startTime = Date.now();
    this.progressCallback = onProgress || undefined;
    const numPages = this.pdfDocument.numPages;
    const translatedPages: TranslatedPage[] = new Array(numPages).fill(null);
    let completedCount = 0;
    const totalPagesToTranslate = pageNumbers.length;

    this.updateProgress({
      currentPage: 0,
      totalPages: totalPagesToTranslate,
      completedPages: 0,
      status: 'extracting',
      message: '正在提取文本...'
    });

    const translatePageWithCallback = async (pageNum: number): Promise<void> => {
      this.updateProgress({
        currentPage: pageNum,
        totalPages: totalPagesToTranslate,
        completedPages: completedCount,
        status: 'translating',
        message: `正在翻译 PDF 第 ${pageNum} 页 (${completedCount + 1}/${totalPagesToTranslate})...`
      });

      try {
        const page = await this.translatePage(pageNum, skipReferences);
        translatedPages[pageNum - 1] = page;
      } catch (err) {
        translatedPages[pageNum - 1] = {
          pageNumber: pageNum,
          paragraphs: [],
          status: 'error',
          error: err instanceof Error ? err.message : '翻译失败'
        };
      } finally {
        completedCount++;
      }

      this.updateProgress({
        currentPage: pageNum,
        totalPages: totalPagesToTranslate,
        completedPages: completedCount,
        status: 'translating',
        message: `已完成 ${completedCount}/${totalPagesToTranslate} 页`
      });

      onPageComplete?.(translatedPages[pageNum - 1]!);
    };

    for (let i = 0; i < pageNumbers.length; i += this.maxConcurrency) {
      const batch = pageNumbers.slice(i, i + this.maxConcurrency);
      await Promise.all(batch.map(pageNum => translatePageWithCallback(pageNum)));
    }

    this.updateProgress({
      currentPage: numPages,
      totalPages: totalPagesToTranslate,
      completedPages: totalPagesToTranslate,
      status: 'completed',
      message: '翻译完成！'
    });

    return translatedPages;
  }

  async translatePage(pageNum: number, skipReferences: boolean = true): Promise<TranslatedPage> {
    const page: TranslatedPage = {
      pageNumber: pageNum,
      paragraphs: [],
      status: 'translating'
    };

    try {
      const paragraphs = await this.extractParagraphsFromPage(pageNum, skipReferences);
      
      if (paragraphs.length === 0) {
        page.status = 'completed';
        page.paragraphs = [];
        return page;
      }

      try {
        const translatedParagraphs = await this.translateParagraphs(paragraphs);
        page.paragraphs = translatedParagraphs;
        page.status = 'completed';
      } catch (translateError) {
        console.error(`Page ${pageNum} translation error:`, translateError);
        page.paragraphs = paragraphs.map(p => ({
          ...p,
          translatedText: `[翻译失败]`,
          error: true
        }));
        page.status = 'error';
        page.error = translateError instanceof Error ? translateError.message : '翻译失败';
      }
    } catch (extractError) {
      console.error(`Page ${pageNum} extraction error:`, extractError);
      page.status = 'error';
      page.error = extractError instanceof Error ? extractError.message : '文本提取失败';
    }

    return page;
  }

  async translateFullDocumentConcurrent(
    onPageComplete?: (page: TranslatedPage) => void
  ): Promise<TranslatedPage[]> {
    this.startTime = Date.now();
    const numPages = this.pdfDocument.numPages;
    const translatedPages: TranslatedPage[] = new Array(numPages).fill(null);
    let completedCount = 0;

    this.updateProgress({
      currentPage: 0,
      totalPages: numPages,
      completedPages: 0,
      status: 'extracting',
      message: '正在提取文本...'
    });

    const translatePageWithCallback = async (pageNum: number): Promise<void> => {
      this.updateProgress({
        currentPage: pageNum,
        totalPages: numPages,
        completedPages: completedCount,
        status: 'translating',
        message: `正在翻译第 ${pageNum}/${numPages} 页...`
      });

      const page = await this.translatePage(pageNum);
      translatedPages[pageNum - 1] = page;
      completedCount++;

      this.updateProgress({
        currentPage: pageNum,
        totalPages: numPages,
        completedPages: completedCount,
        status: 'translating',
        message: `已完成 ${completedCount}/${numPages} 页`
      });

      onPageComplete?.(page);
    };

    const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);
    
    for (let i = 0; i < pageNumbers.length; i += this.maxConcurrency) {
      const batch = pageNumbers.slice(i, i + this.maxConcurrency);
      await Promise.all(batch.map(pageNum => translatePageWithCallback(pageNum)));
    }

    this.updateProgress({
      currentPage: numPages,
      totalPages: numPages,
      completedPages: numPages,
      status: 'completed',
      message: '翻译完成！'
    });

    return translatedPages;
  }

  renderPageToCanvas(
    page: TranslatedPage,
    originalCanvas: HTMLCanvasElement,
    scale: number = 1.5
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height;
    
    const ctx = canvas.getContext('2d')!;
    
    // 绘制原始 PDF 作为底层
    ctx.drawImage(originalCanvas, 0, 0);
    
    ctx.textBaseline = 'alphabetic';

    for (const paragraph of page.paragraphs) {
      if (!paragraph?.translatedText || paragraph?.error) continue;

      const x = paragraph.x * scale;
      const y = paragraph.y * scale;
      const width = paragraph.width * scale;
      const height = paragraph.height * scale;

      // 直接绘制中文译文，不覆盖原文
      let fontSize = paragraph.fontSize * scale * 0.8;
      ctx.font = `${fontSize}px "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", sans-serif`;
      
      const textWidth = ctx.measureText(paragraph.translatedText).width;
      if (textWidth > width) {
        fontSize = fontSize * (width / textWidth) * 0.95;
        ctx.font = `${fontSize}px "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", sans-serif`;
      }

      // 使用半透明背景（alpha < 0.2），避免遮挡原文
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x - 2, y - height, width + 4, height + 4);
      
      // 绘制中文译文
      ctx.fillStyle = '#1e293b';
      ctx.fillText(paragraph.translatedText, x, y + fontSize * 0.8);
    }
    
    return canvas;
  }

  async exportToPDF(
    translatedPages: TranslatedPage[],
    originalFile: File
  ): Promise<Blob> {
    this.updateProgress({
      currentPage: 0,
      totalPages: translatedPages.length,
      completedPages: 0,
      status: 'exporting',
      message: '正在生成 PDF 文件...'
    });

    const arrayBuffer = await originalFile.arrayBuffer();
    const pdfDoc = await (await import('pdf-lib')).PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();

    for (let i = 0; i < translatedPages.length; i++) {
      const page = translatedPages[i];
      if (!page || !page.paragraphs || page.paragraphs.length === 0) continue;

      const pdfPage = pages[i];
      const { height } = pdfPage.getSize();

      const { rgb, StandardFonts } = await import('pdf-lib');
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const paragraph of page.paragraphs) {
        if (!paragraph?.translatedText || paragraph?.error) continue;

        // 直接绘制中文译文，不覆盖原文
        let fontSize = paragraph.fontSize;
        const textWidth = font.widthOfTextAtSize(paragraph.translatedText, fontSize);
        if (textWidth > paragraph.width) {
          fontSize = fontSize * (paragraph.width / textWidth) * 0.9;
        }

        pdfPage.drawText(paragraph.translatedText, {
          x: paragraph.x,
          y: height - paragraph.y - paragraph.height + 2,
          size: fontSize,
          font: font,
          color: rgb(0.1, 0.15, 0.25),
        });
      }

      this.updateProgress({
        currentPage: i + 1,
        totalPages: translatedPages.length,
        completedPages: i + 1,
        status: 'exporting',
        message: `正在处理第 ${i + 1}/${translatedPages.length} 页...`
      });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  }

  async exportToWordAsStructure(
    translatedPages: TranslatedPage[],
    mode: TranslationMode = 'bilingual'
  ): Promise<Blob> {
    this.updateProgress({
      currentPage: 0,
      totalPages: translatedPages.length,
      completedPages: 0,
      status: 'exporting',
      message: '正在重建文档结构...'
    });

    // 创建 Word 文档
    const doc = new Document({
      sections: [
        ...translatedPages.map((page) => {
          const sectionChildren = this.buildSectionChildren(page, mode);
          
          return {
            properties: {
              type: SectionType.NEXT_PAGE,
              page: {
                size: {
                  width: 12240, // 8.5 英寸
                  height: 15840, // 11 英寸
                },
                margin: {
                  top: 1440, // 1 英寸
                  right: 1440,
                  bottom: 1440,
                  left: 1440,
                },
              },
            },
            children: sectionChildren,
          };
        }),
      ],
    });

    // 打包 Word 文档
    this.updateProgress({
      currentPage: translatedPages.length,
      totalPages: translatedPages.length,
      completedPages: translatedPages.length,
      status: 'exporting',
      message: '正在生成 Word 文件...'
    });

    const buffer = await Packer.toBlob(doc);
    return buffer;
  }

  private buildSectionChildren(page: TranslatedPage, mode: TranslationMode): any[] {
    if (mode === 'bilingual') {
      return this.buildBilingualLayout(page);
    } else {
      return this.buildSingleLanguageLayout(page);
    }
  }

  private buildBilingualLayout(page: TranslatedPage): any[] {
    const children: any[] = [];
    
    // 添加页面标题
    children.push(new Paragraph({
      text: `第 ${page.pageNumber} 页`,
      heading: 'Heading3',
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 200,
        after: 200,
      },
    }));

    // 为每个段落创建双语对照表格
    for (const paragraph of page.paragraphs) {
      if (!paragraph.translatedText) continue;

      // 计算字体大小（Word 使用 half-points）
      const fontSize = paragraph.fontSize * 2;
      const isBold = paragraph.blocks.some(b => b.isBold);
      const isItalic = paragraph.blocks.some(b => b.isItalic);
      const color = paragraph.blocks[0]?.color || '000000';

      // 创建两列表格
      const table = {
        rows: [
          {
            cells: [
              {
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: paragraph.text,
                        size: fontSize,
                        bold: isBold,
                        italics: isItalic,
                        color: color,
                        font: {
                          name: 'Times New Roman',
                        },
                      }),
                    ],
                    alignment: AlignmentType.LEFT,
                  }),
                ],
                width: { size: 50, type: 'pct' },
              },
              {
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: paragraph.translatedText,
                        size: fontSize,
                        bold: isBold,
                        italics: isItalic,
                        color: color,
                        font: {
                          name: 'SimSun', // 中文字体
                        },
                      }),
                    ],
                    alignment: AlignmentType.LEFT,
                  }),
                ],
                width: { size: 50, type: 'pct' },
              },
            ],
          },
        ],
        width: { size: 100, type: 'pct' },
        spacing: {
          after: 100,
        },
      };

      children.push(table);
    }

    return children;
  }

  private buildSingleLanguageLayout(page: TranslatedPage): any[] {
    const children: any[] = [];
    
    // 添加页面标题
    children.push(new Paragraph({
      text: `第 ${page.pageNumber} 页`,
      heading: 'Heading3',
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 200,
        after: 200,
      },
    }));

    // 为每个段落创建单独的段落
    for (const paragraph of page.paragraphs) {
      if (!paragraph.translatedText) continue;

      // 计算字体大小（Word 使用 half-points）
      const fontSize = paragraph.fontSize * 2;
      const isBold = paragraph.blocks.some(b => b.isBold);
      const isItalic = paragraph.blocks.some(b => b.isItalic);
      const color = paragraph.blocks[0]?.color || '000000';

      // 确定标题级别
      let heading: any = undefined;
      if (fontSize > 24) {
        heading = 'Heading1';
      } else if (fontSize > 20) {
        heading = 'Heading2';
      } else if (fontSize > 16) {
        heading = 'Heading3';
      }

      // 创建段落
      const docParagraph = new Paragraph({
        children: [
          new TextRun({
            text: paragraph.translatedText,
            size: fontSize,
            bold: isBold,
            italics: isItalic,
            color: color,
            font: {
              name: 'SimSun', // 中文字体
            },
          }),
        ],
        alignment: AlignmentType.LEFT,
        heading: heading,
        spacing: {
          before: 100,
          after: 100,
          line: 240, // 1.5 倍行高
        },
      });

      children.push(docParagraph);
    }

    return children;
  }

  async exportWord(
    translatedPages: TranslatedPage[],
    mode: TranslationMode = 'bilingual'
  ): Promise<Blob> {
    // 使用新的文档重建方式
    return this.exportToWordAsStructure(translatedPages, mode);
  }

  async exportPDF(
    translatedPages: TranslatedPage[],
    mode: TranslationMode = 'bilingual',
    originalFile?: File
  ): Promise<Blob> {
    if (!originalFile) {
      // 如果没有提供原始文件，使用备用方法
      return this.generatePDFFromTranslation(translatedPages, mode);
    }
    // 基于原PDF进行修改，避免黑块遮挡
    return this.exportToPDF(translatedPages, originalFile);
  }

  private async generatePDFFromTranslation(
    translatedPages: TranslatedPage[],
    mode: TranslationMode
  ): Promise<Blob> {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    
    // 添加中文字体
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // 为每个翻译页面创建 PDF 页面
    for (const page of translatedPages) {
      if (!page || page.paragraphs.length === 0) continue;
      
      const pdfPage = pdfDoc.addPage();
      const { height } = pdfPage.getSize();
      
      let yPosition = height - 50;
      const lineHeight = 20;
      const margin = 50;
      
      // 绘制页面标题
      pdfPage.drawText(`第 ${page.pageNumber} 页`, {
        x: margin,
        y: yPosition,
        size: 16,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      yPosition -= 30;
      
      // 绘制段落内容
      for (const paragraph of page.paragraphs) {
        if (!paragraph.translatedText) continue;
        
        // 在双语模式下，先绘制原文
        if (mode === 'bilingual') {
          pdfPage.drawText(paragraph.text, {
            x: margin,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0.4, 0.4, 0.4),
          });
          yPosition -= lineHeight;
        }
        
        // 绘制译文
        pdfPage.drawText(paragraph.translatedText, {
          x: margin,
          y: yPosition,
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight * 2;
        
        // 检查是否需要新页面
        if (yPosition < margin) {
          const newPage = pdfDoc.addPage();
          const { height: newHeight } = newPage.getSize();
          yPosition = newHeight - 50;
        }
      }
    }
    
    // 生成 PDF
    const pdfBytes = await pdfDoc.save();
    
    // 返回标准的 PDF Blob
    return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  }

  async translateText(text: string): Promise<string> {
    const prompt = `你是一位精通化学教育、统计学和数据科学的资深学术翻译。请将以下学术论文段落翻译为自然、专业的中文。

**翻译要求**：
1. **术语规范**：保持学术严谨性，专业术语准确翻译（如 Chemometrics 译为"化学计量学"，ANOVA 译为"方差分析"）
2. **严禁占位符**：绝对禁止输出任何 XXX、...、[待补充] 等占位符
3. **保留原样**：遇到公式、代码、专有名词无法翻译时，请保持原样
4. **长度适配**：译文长度应适中，确保能嵌入原 PDF 排版空间
5. **格式要求**：直接返回译文，不要任何解释

待翻译文本：
${text}

请直接返回译文：`;

    try {
      const response = await requestAI({
        text: prompt,
        action: 'translate',
        apiKey: this.apiKey,
        model: this.model
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return response.result.trim();
    } catch (error) {
      console.error('Translation error:', error);
      return `[翻译失败] ${text.substring(0, 50)}...`;
    }
  }
}

export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}分${secs}秒`;
}
