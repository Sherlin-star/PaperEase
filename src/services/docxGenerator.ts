import { Document, Packer, Paragraph, TextRun, Textbox, WidthType, TextWrappingType, ImageRun } from 'docx';

interface TextStyle {
  fontSize: number;
  bold: boolean;
  color: string;
  backgroundColor?: string;
}

interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TranslatedParagraph {
  text: string;
  style: TextStyle;
  position: Position;
}

interface TranslatedImage {
  data: string;
  position: Position;
}

interface PageContent {
  paragraphs: TranslatedParagraph[];
  images: TranslatedImage[];
  width: number;
  height: number;
}

export async function generateDocx(pages: PageContent[]): Promise<Blob> {
  const doc = new Document({
    sections: pages.map(page => ({
      properties: {
        page: {
          size: {
            width: page.width * 1440 / 72, // 转换为 twips
            height: page.height * 1440 / 72
          }
        }
      },
      children: [
        // 添加图片
        ...page.images.map(image => createPositionedImage(image)),
        // 添加文本框
        ...page.paragraphs.map(paragraph => createPositionedTextbox(paragraph))
      ]
    }))
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}

function createPositionedTextbox(paragraph: TranslatedParagraph) {
  const { text, style, position } = paragraph;
  
  // 计算中文宽度，进行自适应调整
  const adjustedText = adjustTextForWidth(text, position.width, style.fontSize);
  
  return new Textbox({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: adjustedText,
            size: style.fontSize * 2, // docx 使用 half-points
            bold: style.bold,
            color: style.color
          })
        ]
      })
    ]
  });
}

function createPositionedImage(image: TranslatedImage) {
  const { data, position } = image;
  
  return new Paragraph({
    children: [
      new ImageRun({
        data: data,
        type: 'png',
        transformation: {
          width: position.width,
          height: position.height
        }
      })
    ]
  });
}

function adjustTextForWidth(text: string, maxWidth: number, fontSize: number): string {
  // 简单的文本宽度计算和调整
  // 实际实现可能需要更复杂的算法
  const avgCharWidth = fontSize * 0.6; // 平均字符宽度
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  
  if (text.length <= maxChars) {
    return text;
  }
  
  // 如果文本过长，进行截断（实际应用中可能需要更智能的处理）
  return text.substring(0, maxChars - 3) + '...';
}

export function generateExportFileName(originalFileName: string, translationModel: string, format: 'docx' | 'pdf'): string {
  const baseName = originalFileName.replace(/\.[^/.]+$/, "");
  return `${baseName}_重建翻译版_${translationModel}.${format}`;
}
