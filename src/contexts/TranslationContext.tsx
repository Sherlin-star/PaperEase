import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { 
  TranslationService, 
  TranslationMode, 
  TranslationProgress, 
  TranslatedPage,
  downloadFile 
} from '../services/translationService';
import { extractTextStructure } from '../services/pdfParser';
import { generateDocx, generateExportFileName } from '../services/docxGenerator';
import { SUPPORTED_MODELS, AIModel } from '../config/aiConfig';
import { saveTranslationProgress, getTranslationProgress } from '../utils/storage';

export interface PageRange {
  type: 'all' | 'current' | 'custom';
  customRange?: string;
  pages: number[];
}

interface TranslationContextType {
  isTranslating: boolean;
  progress: TranslationProgress | null;
  translatedPages: TranslatedPage[];
  mode: TranslationMode;
  error: string | null;
  isModalOpen: boolean;
  isBackground: boolean;
  isCompleted: boolean;
  pageRange: PageRange;
  skipReferences: boolean;
  isBackgroundTranslating: boolean;
  backgroundProgress: TranslationProgress | null;
  
  startTranslation: (
    pdfDocument: any, 
    model: any, 
    apiKey: string, 
    mode: TranslationMode,
    pageRange?: PageRange,
    skipReferences?: boolean
  ) => Promise<void>;
  stopTranslation: () => void;
  openModal: () => void;
  closeModal: () => void;
  setBackgroundMode: (isBackground: boolean) => void;
  resetTranslation: () => void;
  retryPage: (pageNum: number, pdfDocument: any, model: any, apiKey: string) => Promise<void>;
  exportPDF: (pdfDocument: any, model: any, apiKey: string, filename: string, originalFile?: File) => Promise<void>;
  exportWord: (pdfDocument: any, model: any, apiKey: string, filename: string) => Promise<void>;
  startReconstructionTranslation: (pdfData: ArrayBuffer, model: any, apiKey: string, originalFileName: string) => Promise<void>;
  startBackgroundTranslation: (pdfDocument: any) => Promise<void>;
  getAvailableModel: () => { model: AIModel | null; apiKey: string };
  setPageRange: (range: PageRange) => void;
  setSkipReferences: (skip: boolean) => void;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export function parsePageRange(input: string, totalPages: number): number[] {
  const pages: Set<number> = new Set();
  
  const parts = input.split(',').map(p => p.trim()).filter(p => p);
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
          pages.add(i);
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        pages.add(pageNum);
      }
    }
  }
  
  return Array.from(pages).sort((a, b) => a - b);
}

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [translatedPages, setTranslatedPages] = useState<TranslatedPage[]>([]);
  const [mode, setMode] = useState<TranslationMode>('overlay');
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBackground, setIsBackground] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [pageRange, setPageRange] = useState<PageRange>({ type: 'all', pages: [] });
  const [skipReferences, setSkipReferences] = useState(true);
  const [isBackgroundTranslating, setIsBackgroundTranslating] = useState(false);
  const [backgroundProgress, setBackgroundProgress] = useState<TranslationProgress | null>(null);
  
  const serviceRef = useRef<TranslationService | null>(null);
  const abortRef = useRef<boolean>(false);
  const backgroundAbortRef = useRef<boolean>(false);
  
  // 组件挂载时恢复翻译进度
  React.useEffect(() => {
    const restoreProgress = async () => {
      try {
        const savedProgress = await getTranslationProgress();
        if (savedProgress) {
          setTranslatedPages(savedProgress.pages || []);
          setIsCompleted(savedProgress.isCompleted || false);
        }
      } catch (error) {
        console.error('Failed to restore translation progress:', error);
      }
    };
    
    restoreProgress();
  }, []);

  const startTranslation = useCallback(async (
    pdfDocument: any, 
    model: any, 
    apiKey: string, 
    translationMode: TranslationMode,
    range?: PageRange,
    skipRefs?: boolean
  ) => {
    if (!pdfDocument || !apiKey) {
      setError('缺少必要参数');
      return;
    }

    const totalPages = pdfDocument.numPages;
    let pagesToTranslate: number[];
    
    if (range && range.type !== 'all') {
      if (range.type === 'current') {
        pagesToTranslate = range.pages.length > 0 ? range.pages : [1];
      } else {
        pagesToTranslate = range.pages.length > 0 ? range.pages : Array.from({ length: totalPages }, (_, i) => i + 1);
      }
    } else {
      pagesToTranslate = Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (pagesToTranslate.length === 0) {
      setError('请选择要翻译的页面');
      return;
    }

    setIsTranslating(true);
    setError(null);
    setTranslatedPages([]);
    setMode(translationMode);
    setIsCompleted(false);
    abortRef.current = false;

    try {
      const service = new TranslationService(pdfDocument, model, apiKey);
      serviceRef.current = service;

      const pages = await service.translatePages(
        pagesToTranslate,
        skipRefs !== undefined ? skipRefs : skipReferences,
        (prog) => {
          if (!abortRef.current) {
            setProgress(prog);
          }
        },
        (page) => {
          if (!abortRef.current) {
            setTranslatedPages(prev => {
              const newPages = [...prev];
              const index = page.pageNumber - 1;
              newPages[index] = page;
              return newPages;
            });
          }
        }
      );

      if (!abortRef.current) {
        setTranslatedPages(pages);
        setIsCompleted(true);
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : '翻译失败');
      }
    } finally {
      setIsTranslating(false);
    }
  }, [skipReferences]);

  const stopTranslation = useCallback(() => {
    abortRef.current = true;
    setIsTranslating(false);
    setProgress(prev => prev ? { ...prev, status: 'completed' } : null);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
    setIsBackground(false);
  }, []);

  const closeModal = useCallback(() => {
    if (isTranslating) {
      setIsBackground(true);
    }
    setIsModalOpen(false);
  }, [isTranslating]);

  const setBackgroundMode = useCallback((background: boolean) => {
    setIsBackground(background);
  }, []);

  const resetTranslation = useCallback(() => {
    setIsTranslating(false);
    setProgress(null);
    setTranslatedPages([]);
    setError(null);
    setIsCompleted(false);
    setIsBackground(false);
    abortRef.current = false;
  }, []);

  const retryPage = useCallback(async (
    pageNum: number, 
    pdfDocument: any, 
    model: any, 
    apiKey: string
  ) => {
    if (!pdfDocument || !apiKey) return;

    setTranslatedPages(prev => {
      const newPages = [...prev];
      const index = pageNum - 1;
      if (newPages[index]) {
        newPages[index] = { ...newPages[index], status: 'translating', error: undefined };
      }
      return newPages;
    });

    try {
      const service = new TranslationService(pdfDocument, model, apiKey);
      const page = await service.translatePage(pageNum);
      
      setTranslatedPages(prev => {
        const newPages = [...prev];
        newPages[pageNum - 1] = page;
        return newPages;
      });
    } catch (err) {
      setTranslatedPages(prev => {
        const newPages = [...prev];
        const index = pageNum - 1;
        if (newPages[index]) {
          newPages[index] = { 
            ...newPages[index], 
            status: 'error', 
            error: err instanceof Error ? err.message : '翻译失败' 
          };
        }
        return newPages;
      });
    }
  }, []);

  const exportPDF = useCallback(async (
    pdfDocument: any,
    model: any,
    apiKey: string,
    filename: string,
    originalFile?: File
  ) => {
    if (!translatedPages.length || !pdfDocument) {
      throw new Error('没有可导出的内容');
    }

    const modelName = model?.name || 'deepseek';
    const pageNumbers = translatedPages
      .filter(p => p && p.status === 'completed')
      .map(p => p.pageNumber);
    
    let pageRangeStr = '';
    if (pageNumbers.length === 1) {
      pageRangeStr = `_第${pageNumbers[0]}页`;
    } else if (pageNumbers.length > 1) {
      pageRangeStr = `_第${Math.min(...pageNumbers)}-${Math.max(...pageNumbers)}页`;
    }

    const service = new TranslationService(pdfDocument, model, apiKey);
    const blob = await service.exportPDF(translatedPages, mode, originalFile);
    downloadFile(blob, `${filename}${pageRangeStr}_${modelName}_翻译版.pdf`);
  }, [translatedPages, mode]);

  const exportWord = useCallback(async (
    pdfDocument: any,
    model: any,
    apiKey: string,
    filename: string
  ) => {
    if (!translatedPages.length) {
      throw new Error('没有可导出的内容');
    }

    const modelName = model?.name || 'deepseek';
    const pageNumbers = translatedPages
      .filter(p => p && p.status === 'completed')
      .map(p => p.pageNumber);
    
    let pageRangeStr = '';
    if (pageNumbers.length === 1) {
      pageRangeStr = `_第${pageNumbers[0]}页`;
    } else if (pageNumbers.length > 1) {
      pageRangeStr = `_第${Math.min(...pageNumbers)}-${Math.max(...pageNumbers)}页`;
    }

    const service = new TranslationService(pdfDocument, model, apiKey);
    const blob = await service.exportWord(translatedPages, mode);
    downloadFile(blob, `${filename}${pageRangeStr}_${modelName}_翻译版.docx`);
  }, [translatedPages, mode]);

  const startReconstructionTranslation = useCallback(async (
    pdfData: ArrayBuffer,
    model: any,
    apiKey: string,
    originalFileName: string
  ) => {
    setIsTranslating(true);
    setError(null);
    setIsCompleted(false);
    
    try {
      // 1. 提取 PDF 结构
      const pages = await extractTextStructure(pdfData);
      
      // 2. 翻译文本内容
      const service = new TranslationService(null, model, apiKey);
      
      // 3. 准备翻译后的页面内容
      const translatedPages = await Promise.all(
        pages.map(async (page) => {
          const translatedParagraphs = await Promise.all(
            page.paragraphs.map(async (paragraph) => {
              // 提取段落文本
              const originalText = paragraph.words.map(word => word.text).join(' ');
              
              // 翻译文本
              const translatedText = await service.translateText(originalText);
              
              // 计算段落样式
              const firstWord = paragraph.words[0];
              const style = {
                fontSize: firstWord.fontSize,
                bold: firstWord.bold,
                color: firstWord.color
              };
              
              return {
                text: translatedText,
                style,
                position: {
                  x: paragraph.x,
                  y: paragraph.y,
                  width: paragraph.width,
                  height: paragraph.height
                }
              };
            })
          );
          
          // 转换图片格式以匹配 TranslatedImage 类型
          const translatedImages = page.images.map(image => ({
            data: image.data,
            position: {
              x: image.x,
              y: image.y,
              width: image.width,
              height: image.height
            }
          }));
          
          return {
            paragraphs: translatedParagraphs,
            images: translatedImages,
            width: page.width,
            height: page.height
          };
        })
      );
      
      // 4. 生成 Word 文档
      const modelName = model?.name || 'deepseek';
      const docxBlob = await generateDocx(translatedPages);
      
      // 5. 下载 Word 文档
      const fileName = generateExportFileName(originalFileName, modelName, 'docx');
      downloadFile(docxBlob, fileName);
      
      setIsCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文档重建失败');
    } finally {
      setIsTranslating(false);
    }
  }, []);

  // 智能模型调度器
  const getAvailableModel = useCallback(() => {
    // 模型优先级：硅基流动 > Kimi > DeepSeek
    const modelPriority = ['siliconflow', 'kimi', 'deepseek'];
    
    for (const modelId of modelPriority) {
      const model = SUPPORTED_MODELS[modelId];
      const apiKey = localStorage.getItem(model.keyPrefix) || '';
      
      if (apiKey) {
        return { model, apiKey };
      }
    }
    
    return { model: null, apiKey: '' };
  }, []);

  // 后台自动翻译
  const startBackgroundTranslation = useCallback(async (pdfDocument: any) => {
    // 状态锁：如果用户正在手动翻译，后台任务挂起
    if (isTranslating) {
      console.log('Background translation suspended: User is manually translating');
      return;
    }
    
    // 检查是否已有翻译结果
    const completedPages = translatedPages.filter(p => p && p.status === 'completed').length;
    const totalPages = pdfDocument.numPages;
    
    if (completedPages >= totalPages) {
      console.log('Background translation skipped: All pages already translated');
      return;
    }
    
    // 获取可用模型
    const { model, apiKey } = getAvailableModel();
    if (!model || !apiKey) {
      console.log('Background translation skipped: No available model with API key');
      return;
    }
    
    setIsBackgroundTranslating(true);
    setError(null);
    backgroundAbortRef.current = false;
    
    try {
      const service = new TranslationService(pdfDocument, model, apiKey);
      
      // 确定需要翻译的页面
      const pagesToTranslate = Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter(pageNum => {
          const existingPage = translatedPages[pageNum - 1];
          return !existingPage || existingPage.status !== 'completed';
        });
      
      if (pagesToTranslate.length === 0) {
        setIsBackgroundTranslating(false);
        return;
      }
      
      console.log(`Starting background translation for ${pagesToTranslate.length} pages`);
      
      await service.translatePages(
        pagesToTranslate,
        skipReferences,
        (prog) => {
          if (!backgroundAbortRef.current) {
            setBackgroundProgress({
              ...prog,
              message: `后台翻译中 ${prog.completedPages}/${prog.totalPages}页...`
            });
          }
        },
        (page) => {
          if (!backgroundAbortRef.current) {
            setTranslatedPages(prev => {
              const newPages = [...prev];
              const index = page.pageNumber - 1;
              newPages[index] = page;
              
              // 实时保存翻译进度
              saveTranslationProgress({
                pages: newPages,
                isCompleted: newPages.every(p => p && p.status === 'completed')
              }).catch(console.error);
              
              return newPages;
            });
          }
        }
      );
      
      // 检查是否所有页面都已翻译完成
      const finalPages = translatedPages;
      const allCompleted = finalPages.every(p => p && p.status === 'completed');
      if (allCompleted) {
        setIsCompleted(true);
        saveTranslationProgress({
          pages: finalPages,
          isCompleted: true
        }).catch(console.error);
      }
      
    } catch (err) {
      console.error('Background translation error:', err);
      // 后台翻译出错时不向用户报错，仅记录日志
    } finally {
      setIsBackgroundTranslating(false);
      setBackgroundProgress(null);
    }
  }, [isTranslating, translatedPages, skipReferences, getAvailableModel]);

  return (
    <TranslationContext.Provider
      value={{
        isTranslating,
        progress,
        translatedPages,
        mode,
        error,
        isModalOpen,
        isBackground,
        isCompleted,
        pageRange,
        skipReferences,
        isBackgroundTranslating,
        backgroundProgress,
        startTranslation,
        stopTranslation,
        openModal,
        closeModal,
        setBackgroundMode,
        resetTranslation,
        retryPage,
        exportPDF,
        exportWord,
        startReconstructionTranslation,
        startBackgroundTranslation,
        getAvailableModel,
        setPageRange,
        setSkipReferences,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
