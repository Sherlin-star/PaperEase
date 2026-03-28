import * as pdfjsLib from 'pdfjs-dist';

// 配置PDF.js Worker
const configurePdfWorker = () => {
  // 直接设置Worker路径，确保稳定性
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
};

// 初始化Worker
configurePdfWorker();

interface Word {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
  color: string;
  width: number;
}

interface Paragraph {
  words: Word[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Page {
  paragraphs: Paragraph[];
  images: Image[];
  width: number;
  height: number;
}

interface Image {
  data: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function extractTextStructure(pdfData: ArrayBuffer | Uint8Array): Promise<Page[]> {
  // 重新配置Worker，确保Worker线程正常运行
  configurePdfWorker();
  
  try {
    const loadingTask = pdfjsLib.getDocument({ 
      data: pdfData,
      // 移除非法自定义Header字段，修复Headers构造错误
    });
    const pdfDoc = await loadingTask.promise;
    
    // 验证PDFDocumentProxy有效性
    if (!pdfDoc || pdfDoc.numPages === 0) {
      throw new Error('无效的PDF文档');
    }
    
    const pages: Page[] = [];
    
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      const content = await page.getTextContent();
      
      // 提取文字信息
      const words: Word[] = content.items.map((item: any) => {
        const transform = item.transform;
        const x = transform[4];
        const y = viewport.height - transform[5]; // 转换坐标系
        const fontSize = item.height;
        const bold = item.fontName.includes('Bold') || item.fontName.includes('bold');
        const color = item.fillColor || '#000000';
        const width = item.width;
        
        return {
          text: item.str,
          x,
          y,
          fontSize,
          bold,
          color,
          width
        };
      });
      
      // 按 y 坐标排序，确保从上到下处理
      words.sort((a, b) => a.y - b.y);
      
      // 段落重组
      const paragraphs = groupWordsIntoParagraphs(words);
      
      // 提取图片（这里简化处理，实际需要根据 PDF 结构提取）
      const images: Image[] = [];
      
      pages.push({
        paragraphs,
        images,
        width: viewport.width,
        height: viewport.height
      });
    }
    
    return pages;
  } catch (error) {
    console.error('PDF parsing error:', error);
    // 发生错误时，尝试重新配置Worker并重新解析
    configurePdfWorker();
    throw error;
  }
}

function groupWordsIntoParagraphs(words: Word[]): Paragraph[] {
  if (words.length === 0) return [];
  
  const paragraphs: Paragraph[] = [];
  let currentParagraph: Word[] = [words[0]];
  
  for (let i = 1; i < words.length; i++) {
    const currentWord = words[i];
    const previousWord = words[i - 1];
    
    // 计算垂直距离
    const verticalDistance = currentWord.y - previousWord.y;
    
    // 如果垂直距离小于等于字体大小的 1.5 倍，认为是同一段落
    if (verticalDistance <= previousWord.fontSize * 1.5) {
      currentParagraph.push(currentWord);
    } else {
      // 完成当前段落
      const paragraph = createParagraph(currentParagraph);
      paragraphs.push(paragraph);
      
      // 开始新段落
      currentParagraph = [currentWord];
    }
  }
  
  // 添加最后一个段落
  if (currentParagraph.length > 0) {
    const paragraph = createParagraph(currentParagraph);
    paragraphs.push(paragraph);
  }
  
  return paragraphs;
}

function createParagraph(words: Word[]): Paragraph {
  if (words.length === 0) {
    return {
      words: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0
    };
  }
  
  // 计算段落的边界
  const minX = Math.min(...words.map(word => word.x));
  const minY = Math.min(...words.map(word => word.y));
  const maxX = Math.max(...words.map(word => word.x + word.width));
  const maxY = Math.max(...words.map(word => word.y + word.fontSize));
  
  return {
    words,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export async function extractImages(pdfData: ArrayBuffer | Uint8Array): Promise<Image[]> {
  // 这里需要实现图片提取逻辑
  // 实际实现会更复杂，需要处理 PDF 中的图片对象
  return [];
}

export async function extractMetadata(pdfData: ArrayBuffer | Uint8Array): Promise<{ doi: string | null; arxivId: string | null }> {
  // 重新配置Worker，确保Worker线程正常运行
  configurePdfWorker();
  
  try {
    const loadingTask = pdfjsLib.getDocument({ 
      data: pdfData,
    });
    const pdfDoc = await loadingTask.promise;
    
    // 验证PDFDocumentProxy有效性
    if (!pdfDoc || pdfDoc.numPages === 0) {
      throw new Error('无效的PDF文档');
    }
    
    const maxPages = Math.min(2, pdfDoc.numPages);
    let fullText = '';
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + ' ';
    }
    
    fullText = fullText.replace(/\s+/g, ' ').trim();
    
    // 提取 arXiv ID
    let arxivId: string | null = null;
    const arxivPatterns = [
      /\barxiv:\s*(\d{4}\.\d{4,5})\b/gi,
      /\b(?:arXiv|arxiv)\s*[:\s]*(\d{4}\.\d{4,5})\b/gi,
      /\b(\d{4}\.\d{4,5})\b/gi
    ];
    
    for (const pattern of arxivPatterns) {
      const matches = fullText.match(pattern);
      if (matches && matches.length > 0) {
        let id = matches[1] || matches[0];
        id = id.replace(/^(arXiv|arxiv)\s*[:\s]*/i, '');
        id = id.replace(/^arxiv:/i, '');
        
        if (/^\d{4}\.\d{4,5}$/.test(id)) {
          arxivId = id;
          break;
        }
      }
    }
    
    // 提取 DOI
    let doi: string | null = null;
    const doiPatterns = [
      /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi,
      /doi:\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi,
      /https?:\/\/doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi,
      /https?:\/\/dx\.doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi
    ];
    
    for (const pattern of doiPatterns) {
      const matches = fullText.match(pattern);
      if (matches && matches.length > 0) {
        let foundDoi = matches[0];
        
        if (foundDoi.startsWith('http')) {
          const urlMatch = foundDoi.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
          if (urlMatch) {
            foundDoi = urlMatch[0];
          }
        } else if (foundDoi.toLowerCase().startsWith('doi:')) {
          foundDoi = foundDoi.replace(/^doi:\s*/i, '');
        }
        
        foundDoi = foundDoi.replace(/[.;,)\]>]+$/, '');
        foundDoi = foundDoi.replace(/^[<\[(]+/, '');
        
        if (foundDoi.length > 7 && /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(foundDoi)) {
          doi = foundDoi;
          break;
        }
      }
    }
    
    return { doi, arxivId };
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return { doi: null, arxivId: null };
  }
}
