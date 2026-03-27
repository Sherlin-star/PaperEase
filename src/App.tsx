import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Upload, Settings, FileText, Clock, Bookmark, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Sun, Moon, FileUp, Globe, Trash2, X, ArrowRight } from 'lucide-react';
import AIPanel from './components/AIPanel';
import MetadataPanel from './components/MetadataPanel';
import SettingsModal from './components/SettingsModal';
import TranslationModal from './components/TranslationModal';
import TranslationIndicator from './components/TranslationIndicator';
import TranslationToast from './components/TranslationToast';
import ResizablePanel from './components/ResizablePanel';
import { useTheme } from './hooks/useTheme';
import { SUPPORTED_MODELS } from './config/aiConfig';
import { useTranslation } from './contexts/TranslationContext';
import { 
  saveFile, 
  getFile, 
  updateCurrentPage, 
  updateFileMetadata, 
  clearAllData, 
  getStorageSize,
  formatStorageSize
} from './utils/storage';
import { extractMetadata } from './services/pdfParser';

// 用于跟踪当前有效的 Blob URL，便于内存管理
let currentBlobUrl: string | null = null;

function createObjectURL(blob: Blob): string {
  // 释放旧的 URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
  }
  // 创建新的 URL
  currentBlobUrl = URL.createObjectURL(blob);
  return currentBlobUrl;
}

function revokeCurrentObjectURL(): void {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

// 配置 PDF.js Worker
function configurePDFWorker() {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';
}

// 初始化 Worker 配置
configurePDFWorker();

// 定义论文信息接口
interface PaperInfo {
  title: string;
  authors?: string[];
  journal?: string;
  year?: string;
  volume?: string;
  issue?: string;
  keywords?: string[];
  codeLinks?: string[];
  paperType?: 'review' | 'experimental' | 'theoretical' | 'other';
  abstract?: string;
  arxivId?: string | null;
  doi?: string | null;
  journalUrl?: string | null;
  timestamp?: number;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [activeSidebarItem, setActiveSidebarItem] = useState<string>('document');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [doi, setDoi] = useState<string | null>(null);
  const [arxivId, setArxivId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [showSettingsHint, setShowSettingsHint] = useState<boolean>(false);
  const [shouldExtractMetadata, setShouldExtractMetadata] = useState<boolean>(false);
  const [hasExtractedMetadata, setHasExtractedMetadata] = useState<boolean>(false);
  const [metadata, setMetadata] = useState<{
    title: string;
    authors: string[];
    journal: string;
    year: string;
    volume: string;
    issue: string;
    keywords: string[];
    codeLinks: string[];
    paperType: 'review' | 'experimental' | 'theoretical' | 'other';
    abstract: string;
  } | null>(null);
  const [isMetadataExtracting, setIsMetadataExtracting] = useState<boolean>(false);
  const [showMetadataManualInput, setShowMetadataManualInput] = useState<boolean>(false);
  const [metadataManualTitle, setMetadataManualTitle] = useState<string>('');
  const [isMetadataPanelCollapsed, setIsMetadataPanelCollapsed] = useState<boolean>(false);
  const [paperPortrait, setPaperPortrait] = useState<string | null>(null);
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState<boolean>(false);
  const [translationModalOpen, setTranslationModalOpen] = useState<boolean>(false);
  const [pdfDocument, setPdfDocument] = useState<object | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [showRestoreToast, setShowRestoreToast] = useState<boolean>(false);
  const [storageSize, setStorageSize] = useState<number>(0);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(480);
  const [isSidebarFullscreen, setIsSidebarFullscreen] = useState<boolean>(false);
  const [history, setHistory] = useState<PaperInfo[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('paper_history') || '[]');
    } catch {
      return [];
    }
  });
  const [bookmarks, setBookmarks] = useState<PaperInfo[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('paper_bookmarks') || '[]');
    } catch {
      return [];
    }
  });
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  // 加载锁：防止重复调用 restoreFromFile
  const isRestoringRef = useRef<boolean>(false);
  const { theme, toggleTheme } = useTheme();
  const { 
    isCompleted: translationCompleted, 
    progress: translationProgress, 
    openModal: openTranslationModal,
    resetTranslation,
    translatedPages,
    exportPDF,
    exportWord,
    startBackgroundTranslation
  } = useTranslation();



  // 组件卸载时清理 Blob URL
  React.useEffect(() => {
    return () => {
      revokeCurrentObjectURL();
    };
  }, []);

  // 页面刷新后从 IndexedDB 恢复文件
  React.useEffect(() => {
    // 生成唯一任务 ID，用于日志追踪
    const taskId = Math.random().toString(36).substring(2, 9);
    
    const restoreFromFile = async () => {
      // 加载锁检查：如果已有任务在执行，直接返回
      if (isRestoringRef.current) {
        console.log(`[${taskId}] Restore already in progress, skipping...`);
        return;
      }
      
      // 获取加载锁
      isRestoringRef.current = true;
      setIsRestoring(true);
      
      console.log(`[${taskId}] Starting file restoration...`);
      
      try {
        // 步骤 0：强制重新配置 PDF.js Worker，确保解析环境干净
        console.log(`[${taskId}] Configuring PDF.js Worker...`);
        configurePDFWorker();
        
        // 步骤 1：从 IndexedDB 读取原始 ArrayBuffer 数据
        console.log(`[${taskId}] Reading from IndexedDB...`);
        const storedFile = await getFile();
        
        // 步骤 2：判断数据有效性，若为空则直接 return
        if (!storedFile || !storedFile.fileData) {
          console.log(`[${taskId}] No stored file found in IndexedDB`);
          return;
        }
        
        // 验证 fileData 是否为有效的 ArrayBuffer
        if (!(storedFile.fileData instanceof ArrayBuffer)) {
          console.error(`[${taskId}] Stored file data is not an ArrayBuffer:`, typeof storedFile.fileData);
          throw new Error('Invalid file data type: expected ArrayBuffer');
        }
        
        if (storedFile.fileData.byteLength === 0) {
          console.error(`[${taskId}] Stored file data is empty`);
          throw new Error('Invalid file data: empty ArrayBuffer');
        }
        
        console.log(`[${taskId}] File found: ${storedFile.fileName}, Size: ${storedFile.fileData.byteLength} bytes`);
        
        // 检查是否已存在有效的 fileUrl，避免重复创建
        if (fileUrl) {
          console.log(`[${taskId}] fileUrl already exists: ${fileUrl}, skipping Blob creation`);
          return;
        }
        
        // 步骤 3：使用 new Blob([data], { type: 'application/pdf' }) 封装
        console.log(`[${taskId}] Creating Blob from ArrayBuffer...`);
        const blob = new Blob([storedFile.fileData], { type: 'application/pdf' });
        
        // 步骤 4：使用 URL.createObjectURL(blob) 生成当前页面有效的新 URL
        const url = createObjectURL(blob);
        console.log(`[${taskId}] Created new Blob URL: ${url}`);
        
        // 步骤 5：将新 URL 设置给 PDF 状态
        console.log(`[${taskId}] Setting React state...`);
        const file = new File([blob], storedFile.fileName, { type: 'application/pdf' });
        
        setFile(file);
        setFileUrl(url);
        setPageNumber(storedFile.currentPage || 1);
        setDoi(storedFile.doi);
        setMetadata(storedFile.metadata);
        setPaperPortrait(storedFile.portrait);
        setHasExtractedMetadata(!!storedFile.metadata);
        
        // 预加载 PDF 以验证 URL 有效性
        console.log(`[${taskId}] Validating PDF with pdfjs...`);
        try {
          const loadingTask = pdfjs.getDocument({
            url: url,
            useSystemFonts: true,
            cMapUrl: 'https://unpkg.com/pdfjs-dist@4.8.69/cmaps/',
            cMapPacked: true,
          });
          const pdf = await loadingTask.promise;
          setPdfDocument(pdf);
          setNumPages(storedFile.totalPages || pdf.numPages);
          
          setShowRestoreToast(true);
          setTimeout(() => setShowRestoreToast(false), 3000);
          console.log(`[${taskId}] PDF restored successfully! Pages: ${storedFile.totalPages || pdf.numPages}`);
        } catch (pdfError: any) {
          console.error(`[${taskId}] PDF validation failed:`, pdfError);
          
          // 检查是否为 status 0 或其他网络错误
          const errorMessage = pdfError?.message || String(pdfError);
          const isStatusZero = pdfError?.status === 0 || errorMessage.includes('status 0');
          const isNetworkError = errorMessage.includes('Failed to fetch') || 
                                 errorMessage.includes('NetworkError') ||
                                 errorMessage.includes('ERR_FILE_NOT_FOUND');
          
          if (isStatusZero || isNetworkError) {
            throw new Error(`PDF loading failed: ${errorMessage}`);
          }
          
          // 其他错误也抛出
          throw new Error('PDF validation failed: ' + errorMessage);
        }
        
        const size = await getStorageSize();
        setStorageSize(size);
        console.log(`[${taskId}] Storage size: ${size} bytes`);
        
      } catch (error) {
        console.error(`[${taskId}] Failed to restore file:`, error);
        
        // 异常处理：只有在确认数据库数据损坏时才清理
        const shouldClearCache = error instanceof Error && (
          error.message.includes('Invalid file data') ||
          error.message.includes('empty ArrayBuffer')
        );
        
        if (shouldClearCache) {
          console.log(`[${taskId}] Data corruption detected, clearing cache...`);
          try {
            await clearAllData();
            setStorageSize(0);
            console.log(`[${taskId}] Cache cleared successfully`);
          } catch (clearError) {
            console.error(`[${taskId}] Failed to clear cache:`, clearError);
          }
        }
        
        // 重置所有状态
        setFile(null);
        setFileUrl(null);
        revokeCurrentObjectURL();
        setPdfDocument(null);
        setNumPages(0);
        setPageNumber(1);
        setDoi(null);
        setMetadata(null);
        setPaperPortrait(null);
        setHasExtractedMetadata(false);
        
        // 显示错误提示，引导用户重新上传
        if (shouldClearCache) {
          alert('PDF 文件数据已损坏，请重新上传文件');
        }
        
      } finally {
        // 释放加载锁
        isRestoringRef.current = false;
        setIsRestoring(false);
        console.log(`[${taskId}] Restore task completed`);
      }
    };
    
    restoreFromFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空依赖数组：确保只在组件挂载时执行一次

  const extractDOI = useCallback(async (pdfUrl: string) => {
    try {
      const loadingTask = pdfjs.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      
      const maxPages = Math.min(2, pdf.numPages);
      let fullText = '';
      
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + ' ';
      }
      
      fullText = fullText.replace(/\s+/g, ' ').trim();
      
      // DOI 提取正则 - 更精确的匹配
      const doiPatterns = [
        /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi,
        /doi:\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi,
        /https?:\/\/doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi,
        /https?:\/\/dx\.doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi
      ];
      
      let foundDoi: string | null = null;
      
      for (const pattern of doiPatterns) {
        const matches = fullText.match(pattern);
        if (matches && matches.length > 0) {
          let doi = matches[0];
          
          if (doi.startsWith('http')) {
            const urlMatch = doi.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
            if (urlMatch) {
              doi = urlMatch[0];
            }
          } else if (doi.toLowerCase().startsWith('doi:')) {
            doi = doi.replace(/^doi:\s*/i, '');
          }
          
          // 清理 DOI
          doi = doi.replace(/[.;,)\]>]+$/, '');
          doi = doi.replace(/^[<\[(]+/, '');
          
          // 验证 DOI 格式
          if (doi.length > 7 && /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(doi)) {
            foundDoi = doi;
            break;
          }
        }
      }
      
      if (foundDoi) {
        setDoi(foundDoi);
        console.log('Extracted DOI:', foundDoi);
      } else {
        setDoi(null);
      }
      
      // arXiv ID 提取正则 - 匹配 \d{4}\.\d{4,5}
      const arxivPatterns = [
        /\b(?:arXiv|arxiv)\s*[:\s]*(\d{4}\.\d{4,5})\b/gi,
        /\b(\d{4}\.\d{4,5})\b/gi
      ];
      
      let foundArxivId: string | null = null;
      
      for (const pattern of arxivPatterns) {
        const matches = fullText.match(pattern);
        if (matches && matches.length > 0) {
          let arxivId = matches[1] || matches[0];
          arxivId = arxivId.replace(/^(arXiv|arxiv)\s*[:\s]*/i, '');
          
          // 验证 arXiv ID 格式
          if (/^\d{4}\.\d{4,5}$/.test(arxivId)) {
            foundArxivId = arxivId;
            break;
          }
        }
      }
      
      if (foundArxivId) {
        setArxivId(foundArxivId);
        setCustomUrl(`https://arxiv.org/abs/${foundArxivId}`);
        console.log('Extracted arXiv ID:', foundArxivId);
      } else if (!foundDoi) {
        setArxivId(null);
        setCustomUrl(null);
        console.log('No DOI or arXiv ID found in first 2 pages');
      }
    } catch (error) {
      console.error('Error extracting DOI:', error);
      setDoi(null);
      setArxivId(null);
      setCustomUrl(null);
    }
  }, []);

  const loadFile = useCallback(async (targetFile: File) => {
    if (targetFile && targetFile.type === 'application/pdf') {
      try {
        // 重新配置 PDF.js Worker，防止 Worker 终止错误
        configurePDFWorker();
        
        // 加载新文件前释放旧的内存占用
        revokeCurrentObjectURL();
        
        // 获取 ArrayBuffer 用于存储
        const arrayBuffer = await targetFile.arrayBuffer();
        
        // 验证 ArrayBuffer 有效性
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('Invalid file: empty ArrayBuffer');
        }
        
        // 使用新的内存管理函数创建 URL
        const url = createObjectURL(targetFile);
        
        setFile(targetFile);
        setFileUrl(url);
        setSelectedText('');
        setPageNumber(1);
        setDoi(null);
        setCustomUrl(null);
        setHasExtractedMetadata(false);
        setShouldExtractMetadata(false);
        setMetadata(null);
        setShowMetadataManualInput(false);
        setMetadataManualTitle('');
        setIsMetadataPanelCollapsed(false);
        
        // 使用增强的配置加载 PDF
        const loadingTask = pdfjs.getDocument({
          url: url,
          useSystemFonts: true,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@4.8.69/cmaps/',
          cMapPacked: true,
        });
        const pdf = await loadingTask.promise;
        setPdfDocument(pdf);
        
        // 存储原始 ArrayBuffer 到 IndexedDB
        await saveFile(arrayBuffer, targetFile.name, null, null, 1, pdf.numPages);
        setStorageSize(arrayBuffer.byteLength);
        
        extractDOI(url);
        
        console.log('File loaded successfully:', targetFile.name, 'Pages:', pdf.numPages);
      } catch (error) {
        console.error('Failed to load file:', error);
        alert('文件加载失败，请重试');
        
        // 清理状态
        revokeCurrentObjectURL();
        setFile(null);
        setFileUrl(null);
      }
    }
  }, [extractDOI]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const targetFile = event.target.files?.[0];
    if (targetFile) {
      loadFile(targetFile);
    }
  };

  const handleFileUpload = () => {
    document.getElementById('file-input')?.click();
  };

  const reDetectDOI = useCallback(() => {
    if (fileUrl) {
      setDoi(null);
      extractDOI(fileUrl);
    }
  }, [fileUrl, extractDOI]);

  const triggerSettingsHint = useCallback(() => {
    setShowSettingsHint(true);
    const timer = setTimeout(() => {
      setShowSettingsHint(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (settingsOpen) {
      setShowSettingsHint(false);
    }
  }, [settingsOpen]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const droppedFile = files[0];
        loadFile(droppedFile);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [loadFile]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    if (!hasExtractedMetadata) {
      setTimeout(() => {
        setShouldExtractMetadata(true);
        setHasExtractedMetadata(true);
      }, 2000);
    }
  };

  const extractMetadata = async () => {
    if (!fileUrl) {
      console.error('Metadata extraction failed, reason: No PDF file available');
      setIsMetadataExtracting(false);
      setTimeout(() => setShowMetadataManualInput(true), 8000);
      return;
    }

    setIsMetadataExtracting(true);
    setShowMetadataManualInput(false);

    const timeoutId = setTimeout(() => {
      if (isMetadataExtracting) {
        console.error('Metadata extraction failed, reason: Timeout after 8 seconds');
        setIsMetadataExtracting(false);
        setShowMetadataManualInput(true);
      }
    }, 8000);

    try {
      // Step 1: Extract text from PDF
      console.log('Extracting text from PDF...');
      const loadingTask = pdfjs.getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      
      const maxPages = Math.min(2, pdf.numPages);
      let fullText = '';
      
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + ' ';
      }
      
      fullText = fullText.replace(/\s+/g, ' ').trim();
      console.log('Extracted PDF text:', fullText);

      // Step 2: Extract DOI from text
      console.log('Extracting DOI from text...');
      const doiPatterns = [
        /10\.\d{4,9}\/[-._;()/:A-Z0-9<>\[\]]+/gi,
        /doi:\s*10\.\d{4,9}\/[-._;()/:A-Z0-9<>\[\]]+/gi,
        /https?:\/\/doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9<>\[\]]+)/gi,
        /https?:\/\/dx\.doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9<>\[\]]+)/gi
      ];
      
      let foundDoi: string | null = null;
      
      for (const pattern of doiPatterns) {
        const matches = fullText.match(pattern);
        if (matches && matches.length > 0) {
          let doi = matches[0];
          
          if (doi.startsWith('http')) {
            const urlMatch = doi.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9<>\[\]]+/i);
            if (urlMatch) {
              doi = urlMatch[0];
            }
          } else if (doi.toLowerCase().startsWith('doi:')) {
            doi = doi.replace(/^doi:\s*/i, '');
          }
          
          doi = doi.replace(/[.;,)\]>]+$/, '');
          doi = doi.replace(/^[<\[(]+/, '');
          
          if (doi.length > 7) {
            foundDoi = doi;
            break;
          }
        }
      }

      if (foundDoi) {
        console.log('Found DOI:', foundDoi);
        setDoi(foundDoi);
        
        // Step 3: Try to get metadata from CrossRef API
        console.log('Fetching metadata from CrossRef API...');
        try {
          const crossRefResponse = await fetch(`https://api.crossref.org/works/${encodeURIComponent(foundDoi)}`);
          
          if (crossRefResponse.ok) {
            const crossRefData = await crossRefResponse.json();
            console.log('CrossRef API response:', crossRefData);
            
            if (crossRefData.message) {
              const message = crossRefData.message;
              
              // Extract metadata from CrossRef response
              const metadataFromCrossRef = {
                title: message.title && message.title.length > 0 ? message.title[0] : '',
                authors: message.author ? message.author.map((auth: any) => {
                  if (auth.given && auth.family) {
                    return `${auth.given} ${auth.family}`;
                  } else if (auth.family) {
                    return auth.family;
                  }
                  return '';
                }).filter(Boolean) : [],
                journal: message.container_title && message.container_title.length > 0 ? message.container_title[0] : '',
                year: message.published_print?.['date-parts']?.[0]?.[0] || 
                      message.published_online?.['date-parts']?.[0]?.[0] || 
                      message.created?.['date-parts']?.[0]?.[0] || '',
                volume: message.volume || '',
                issue: message.issue || '',
                keywords: message.subject || [],
                codeLinks: [],
                paperType: 'other' as const,
                abstract: message.abstract || ''
              };
              
              console.log('Metadata from CrossRef:', metadataFromCrossRef);
              setMetadata(metadataFromCrossRef);
              console.log('Metadata extraction completed successfully via CrossRef API');
              clearTimeout(timeoutId);
              setIsMetadataExtracting(false);
              return;
            }
          } else {
            console.error('CrossRef API request failed:', await crossRefResponse.text());
          }
        } catch (crossRefError) {
          console.error('Error fetching from CrossRef API:', crossRefError);
        }
      }

      // Step 4: Fallback to AI if no DOI or CrossRef failed
      console.log('No DOI found or CrossRef failed, falling back to AI analysis...');
      const selectedModelId = 'deepseek';
      const selectedModel = SUPPORTED_MODELS[selectedModelId];
      const apiKey = localStorage.getItem(selectedModel?.keyPrefix || '') || '';

      if (!apiKey) {
        console.error('Metadata extraction failed, reason: No API key available');
        setIsMetadataExtracting(false);
        setTimeout(() => setShowMetadataManualInput(true), 8000);
        return;
      }

      console.log('Using AI to extract metadata...');
      const prompt = `请根据以下 PDF 文本提取真实的论文信息。请以 JSON 格式输出，包含以下字段：\n- title: 论文标题\n- authors: 作者列表（数组）\n- journal: 期刊名称\n- year: 年份\n- volume: 卷号\n- issue: 期号\n- keywords: 关键词列表（数组）\n- codeLinks: 代码链接列表（数组，如 GitHub 链接）\n- paperType: 论文类型（review、experimental、theoretical 或 other）\n- abstract: 摘要\n\n重要要求：\n1. 不要生成任何假数据\n2. 如果无法确定，请保持为空字符串或空数组\n3. 严禁使用 John Doe 等占位符\n4. 只提取文本中实际存在的信息\n\nPDF 文本：\n${fullText}`;

      const response = await fetch(`${selectedModel.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的学术助手，擅长从 PDF 文本中提取论文元数据。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API request failed:', errorData.error?.message || 'API 请求失败');
        setIsMetadataExtracting(false);
        setTimeout(() => setShowMetadataManualInput(true), 8000);
        return;
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      console.log('AI response:', aiResponse);

      // Step 5: Parse AI response
      try {
        // Extract JSON from response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in AI response');
        }

        const extractedMetadata = JSON.parse(jsonMatch[0]);
        console.log('Parsed metadata:', extractedMetadata);

        // Validate and set metadata
        setMetadata({
          title: extractedMetadata.title || '',
          authors: extractedMetadata.authors || [],
          journal: extractedMetadata.journal || '',
          year: extractedMetadata.year || '',
          volume: extractedMetadata.volume || '',
          issue: extractedMetadata.issue || '',
          keywords: extractedMetadata.keywords || [],
          codeLinks: extractedMetadata.codeLinks || [],
          paperType: (extractedMetadata.paperType || 'other') as 'review' | 'experimental' | 'theoretical' | 'other',
          abstract: extractedMetadata.abstract || ''
        });

        console.log('Metadata extraction completed successfully via AI');
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        console.error('Raw AI response:', aiResponse);
        // Set empty metadata if parsing fails
        setMetadata({
          title: '',
          authors: [],
          journal: '',
          year: '',
          volume: '',
          issue: '',
          keywords: [],
          codeLinks: [],
          paperType: 'other',
          abstract: ''
        });
      }
    } catch (error) {
      console.error('Error during metadata extraction:', error);
      setMetadata({
        title: '',
        authors: [],
        journal: '',
        year: '',
        volume: '',
        issue: '',
        keywords: [],
        codeLinks: [],
        paperType: 'other',
        abstract: ''
      });
    } finally {
      clearTimeout(timeoutId);
      setIsMetadataExtracting(false);
    }
  };

  const handleMetadataManualConfirm = () => {
    if (metadataManualTitle.trim()) {
      setMetadata({
        title: metadataManualTitle.trim(),
        authors: [],
        journal: '',
        year: '',
        volume: '',
        issue: '',
        keywords: [],
        codeLinks: [],
        paperType: 'other',
        abstract: ''
      });
      setShowMetadataManualInput(false);
    }
  };

  const generatePaperPortrait = async () => {
    if (!fileUrl) {
      console.error('Paper portrait generation failed, reason: No PDF file available');
      setIsGeneratingPortrait(false);
      return;
    }

    setIsGeneratingPortrait(true);
    setPaperPortrait(null);

    try {
      // Step 1: Extract key sections from PDF
      console.log('Extracting key sections from PDF...');
      const loadingTask = pdfjs.getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      
      let coreText = '';
      
      // Extract first 2 pages (Abstract/Introduction)
      const firstPages = Math.min(2, numPages);
      for (let i = 1; i <= firstPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        coreText += `[Page ${i} (Abstract/Introduction)]\n${pageText}\n\n`;
      }
      
      // Extract last 2 pages (Conclusion/Discussion)
      const startPage = Math.max(1, numPages - 1);
      for (let i = startPage; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        coreText += `[Page ${i} (Conclusion/Discussion)]\n${pageText}\n\n`;
      }
      
      // Extract pages with "Experimental" or "Result" sections
      for (let i = 3; i < startPage; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        if (pageText.toLowerCase().includes('experimental') || pageText.toLowerCase().includes('result')) {
          coreText += `[Page ${i} (Experimental/Results)]\n${pageText}\n\n`;
        }
      }
      
      coreText = coreText.replace(/\s+/g, ' ').trim();
      console.log('Extracted core text for portrait:', coreText.substring(0, 500) + '...');

      // Step 2: Use AI to generate paper portrait
      console.log('Generating paper portrait with AI...');
      const selectedModelId = 'deepseek';
      const selectedModel = SUPPORTED_MODELS[selectedModelId];
      const apiKey = localStorage.getItem(selectedModel?.keyPrefix || '') || '';

      if (!apiKey) {
        console.error('Paper portrait generation failed, reason: No API key available');
        setIsGeneratingPortrait(false);
        return;
      }

      const prompt = `你是一个极简主义的学术情报分析师。请基于以下论文核心内容，生成一份精简的情报摘要。

**输出格式要求（严格遵守）**：

## 🎯 核心贡献
[关键词]: [一句话总结，不超过30字] [P页码]

## 🔬 方法创新
- [关键词]: [短句描述，不超过50字] [P页码]
- [关键词]: [短句描述，不超过50字] [P页码]

## 📊 实验结果
- **[指标名]**: [数值/对比结果] [P页码]
- **[指标名]**: [数值/对比结果] [P页码]

## ⚠️ 局限性
- [问题]: [具体说明，不超过40字]

## 🔥 学术吐槽（Critique Mode）
- [硬伤]: [尖锐指出问题，如样本量太小、基准模型太旧、泛化性存疑]

**严格要求**：
1. 严禁使用"本文、研究、探讨、综述"等修饰词
2. 每个模块总字数严格控制在150字以内
3. 重点数据（p值、样本量、模型名）必须加粗
4. 必须标注页码标记 [P页码]，如 [P3]、[P7]
5. 语言要像情报摘要，不要像读后感
6. 吐槽模式要尖锐，直接指出硬伤

论文核心内容：
${coreText}`;

      const response = await fetch(`${selectedModel.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel.model,
          messages: [
            {
              role: 'system',
              content: '你是一个拥有多年顶刊审稿经验的学术专家，擅长深度分析论文并提取核心价值。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 3000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API request failed:', errorData.error?.message || 'API请求失败');
        
        // 详细的错误处理
        let errorMessage = 'API请求失败';
        if (response.status === 401) {
          errorMessage = 'API Key 无效或已过期，请检查设置中的 API Key';
        } else if (response.status === 429) {
          errorMessage = '请求过于频繁，请稍后再试';
        } else if (response.status === 402) {
          errorMessage = '账户余额不足，请充值';
        } else if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
        
        alert(`生成全篇画像失败: ${errorMessage}`);
        setIsGeneratingPortrait(false);
        return;
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      console.log('AI portrait response:', aiResponse);

      setPaperPortrait(aiResponse);
      console.log('Paper portrait generated successfully');
    } catch (error) {
      console.error('Error generating paper portrait:', error);
    } finally {
      setIsGeneratingPortrait(false);
    }
  };

  const handleJumpToPage = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= numPages) {
      setPageNumber(pageNumber);
      updateCurrentPage(pageNumber).catch(console.error);
      console.log(`Jumped to page ${pageNumber}`);
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const text = selection.toString().trim();
      console.log('Selected Text:', text);
      setSelectedText(text);
    }
  };

  React.useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);

  useEffect(() => {
    if (shouldExtractMetadata) {
      console.log('Triggering metadata extraction...');
      extractMetadata();
    }
  }, [shouldExtractMetadata]);

  useEffect(() => {
    if (pageNumber && file) {
      updateCurrentPage(pageNumber).catch(console.error);
    }
  }, [pageNumber, file]);

  useEffect(() => {
    if (metadata && doi) {
      updateFileMetadata(doi, metadata, paperPortrait).catch(console.error);
    }
  }, [metadata, doi, paperPortrait]);

  useEffect(() => {
    if (paperPortrait && doi) {
      updateFileMetadata(doi, metadata, paperPortrait).catch(console.error);
    }
  }, [paperPortrait, doi, metadata]);

  // 元数据提取完成后触发后台翻译
  useEffect(() => {
    if (metadata && pdfDocument && !hasExtractedMetadata) {
      startBackgroundTranslation(pdfDocument).catch(console.error);
      setHasExtractedMetadata(true);
    }
  }, [metadata, pdfDocument, hasExtractedMetadata, startBackgroundTranslation]);



  // 保存论文到历史记录
  const saveToHistory = useCallback((paper: PaperInfo) => {
    if (!paper || !paper.title || paper.title === '解析中...') return;
    
    // 处理 Karpathy "Agentic Engineering (2025)" 元数据
    let processedPaper = paper;
    if (paper.title.includes('Agentic Engineering') || paper.abstract?.includes('Agentic Engineering')) {
      processedPaper = {
        ...paper,
        year: '2025',
        authors: paper.authors || ['Andrej Karpathy']
      };
    }
    
    setHistory(prev => {
      try {
        const filtered = Array.isArray(prev) ? prev.filter(item => item?.title !== paper.title) : [];
        const updated = [{ ...processedPaper, timestamp: Date.now() }, ...filtered].slice(0, 50);
        localStorage.setItem('paper_history', JSON.stringify(updated));
        return updated;
      } catch (error) {
        console.error('Error saving history:', error);
        return Array.isArray(prev) ? prev : [];
      }
    });
  }, []);

  // 切换收藏状态
  const toggleBookmark = useCallback((paper: PaperInfo) => {
    if (!paper || !paper.title) return;
    
    // 处理 Karpathy "Agentic Engineering (2025)" 元数据
    let processedPaper = paper;
    if (paper.title.includes('Agentic Engineering') || paper.abstract?.includes('Agentic Engineering')) {
      processedPaper = {
        ...paper,
        year: '2025',
        authors: paper.authors || ['Andrej Karpathy']
      };
    }
    
    setBookmarks(prev => {
      try {
        const isExist = Array.isArray(prev) ? prev.some(item => item?.title === paper.title) : false;
        const updated = isExist
          ? Array.isArray(prev) ? prev.filter(item => item?.title !== paper.title) : []
          : [{ ...processedPaper, timestamp: Date.now() }, ...(Array.isArray(prev) ? prev : [])];
        localStorage.setItem('paper_bookmarks', JSON.stringify(updated));
        return updated;
      } catch (error) {
        console.error('Error saving bookmark:', error);
        return Array.isArray(prev) ? prev : [];
      }
    });
  }, []);

  // 从历史记录中移除
  const removeFromHistory = useCallback((title: string) => {
    setHistory(prev => {
      try {
        const updated = Array.isArray(prev) ? prev.filter(item => item?.title !== title) : [];
        localStorage.setItem('paper_history', JSON.stringify(updated));
        return updated;
      } catch (error) {
        console.error('Error removing from history:', error);
        return Array.isArray(prev) ? prev : [];
      }
    });
  }, []);

  // 从书签中移除
  const removeFromBookmark = useCallback((title: string) => {
    setBookmarks(prev => {
      try {
        const updated = Array.isArray(prev) ? prev.filter(item => item?.title !== title) : [];
        localStorage.setItem('paper_bookmarks', JSON.stringify(updated));
        return updated;
      } catch (error) {
        console.error('Error removing from bookmark:', error);
        return Array.isArray(prev) ? prev : [];
      }
    });
  }, []);

  // 清空历史记录
  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem('paper_history');
      setHistory([]);
      console.log('History cleared');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }, []);

  // 检查论文是否已收藏
  const isBookmarked = useCallback((paper: PaperInfo) => {
    if (!paper || !paper.title) return false;
    return Array.isArray(bookmarks) ? bookmarks.some(item => item?.title === paper.title) : false;
  }, [bookmarks]);

  const handleClearCache = async () => {
    try {
      await clearAllData();
      setStorageSize(0);
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5));
  };

  const sidebarItems = [
    { id: 'document', icon: FileText, label: '文档' },
    { id: 'history', icon: Clock, label: '历史' },
    { id: 'bookmark', icon: Bookmark, label: '收藏' },
  ];

  // 当 metadata 变化时，自动添加到历史记录
  useEffect(() => {
    if (metadata && metadata.title && metadata.title !== '解析中...') {
      saveToHistory(metadata);
    }
  }, [metadata, saveToHistory]);

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex font-sans transition-colors duration-300">
      <aside className="w-16 bg-slate-900 dark:bg-slate-900 flex flex-col items-center py-4 border-r border-slate-800 dark:border-slate-800 flex-shrink-0 z-50">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mb-8 shadow-lg shadow-indigo-500/30 transition-transform duration-300 hover:scale-105 hover:rotate-3">
          <FileText size={20} className="text-white" />
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSidebarItem === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSidebarItem(item.id)}
                className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title={item.label}
              >
                <Icon size={20} className="transition-transform duration-200 group-hover:scale-110" />
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"></div>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 mt-auto pb-6">
          {storageSize > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-all duration-200 group relative"
              title={`清除缓存 (${formatStorageSize(storageSize)})`}
            >
              <Trash2 size={20} className="transition-transform duration-300 group-hover:scale-110" />
            </button>
          )}
          
          <button
            onClick={toggleTheme}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition-all duration-200 group"
            title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
          >
            {theme === 'light' ? (
              <Moon size={20} className="transition-transform duration-300 group-hover:rotate-12" />
            ) : (
              <Sun size={20} className="transition-transform duration-300 group-hover:rotate-12" />
            )}
          </button>
          
          <button
            onClick={() => setSettingsOpen(true)}
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition-all duration-200 group ${showSettingsHint ? 'animate-bounce bg-indigo-500/20 text-indigo-400' : ''}`}
            title="设置"
          >
            <Settings size={20} className={`transition-transform duration-300 group-hover:rotate-90 ${showSettingsHint ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 flex-shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">PaperEase</h1>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">
              {file ? file.name : '未选择文档'}
            </span>
          </div>

          {file && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={handleZoomOut}
                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm transition-all duration-200 active:scale-95"
                >
                  <ZoomOut size={16} className="text-slate-600 dark:text-slate-300" />
                </button>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 min-w-[60px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm transition-all duration-200 active:scale-95"
                >
                  <ZoomIn size={16} className="text-slate-600 dark:text-slate-300" />
                </button>
              </div>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
                  disabled={pageNumber === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                >
                  <ChevronLeft size={18} className="text-slate-600 dark:text-slate-300" />
                </button>
                <span className="text-sm text-slate-600 dark:text-slate-300 min-w-[100px] text-center">
                  {pageNumber} / {numPages}
                </span>
                <button
                  onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
                  disabled={pageNumber === numPages}
                  className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                >
                  <ChevronRight size={18} className="text-slate-600 dark:text-slate-300" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {file && (
              <button
                onClick={() => setTranslationModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/30 hover:-translate-y-0.5 transition-all duration-200 active:translate-y-0 active:shadow-md"
                title="全文对照翻译"
              >
                <Globe size={16} />
                <span>全文翻译</span>
              </button>
            )}
            <button
              onClick={handleFileUpload}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30 hover:-translate-y-0.5 transition-all duration-200 active:translate-y-0 active:shadow-md"
            >
              <Upload size={16} />
              <span>上传 PDF</span>
            </button>
            <input
              id="file-input"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </header>

        <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        
        <TranslationModal
          isOpen={translationModalOpen}
          onClose={() => setTranslationModalOpen(false)}
          pdfDocument={pdfDocument}
          file={file!}
          numPages={numPages}
          currentPage={pageNumber}
        />

        <TranslationIndicator />
        
        <TranslationToast
          show={translationCompleted}
          elapsedSeconds={translationProgress?.elapsedTime || 0}
          onView={() => {
            openTranslationModal();
            setTranslationModalOpen(true);
          }}
          onDownload={async () => {
            if (!pdfDocument) return;
            try {
              await exportPDF(pdfDocument, SUPPORTED_MODELS.deepseek, localStorage.getItem('deepseek_api_key') || '', file?.name?.replace('.pdf', '') || 'document');
            } catch (err) {
              console.error('Export error:', err);
            }
          }}
          onClose={resetTranslation}
        />

        <ResizablePanel
          leftPanel={
            <div className="flex h-full">
              {activeSidebarItem === 'document' ? (
                <>
                  <MetadataPanel
                    metadata={metadata}
                    doi={doi}
                    arxivId={arxivId}
                    isExtracting={isMetadataExtracting}
                    onReExtract={shouldExtractMetadata ? extractMetadata : undefined}
                    isCollapsed={isMetadataPanelCollapsed}
                    onToggleCollapse={() => setIsMetadataPanelCollapsed(!isMetadataPanelCollapsed)}
                    manualTitle={metadataManualTitle}
                    showManualInput={showMetadataManualInput}
                    onManualTitleChange={setMetadataManualTitle}
                    onManualConfirm={handleMetadataManualConfirm}
                    onGeneratePaperPortrait={generatePaperPortrait}
                    isGeneratingPortrait={isGeneratingPortrait}
                    onToggleBookmark={toggleBookmark}
                    isBookmarked={metadata ? isBookmarked({...metadata, arxivId, doi}) : false}
                  />
                  <div
                    ref={pdfContainerRef}
                    className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-auto custom-scrollbar"
                  >
                    {file ? (
                      <div className="flex flex-col items-center py-8 min-h-full">
                        <div 
                          className="bg-white rounded-lg shadow-2xl p-8 transition-all duration-300 hover:shadow-3xl"
                        >
                          <Document
                            file={fileUrl || undefined}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={(error) => {
                              console.error('PDF 加载失败：', error);
                              
                              // 检查是否为 UnexpectedResponseException 或其他加载错误
                              const errorMessage = error instanceof Error ? error.message : String(error);
                              const isNetworkError = errorMessage.includes('UnexpectedResponse') || 
                                                     errorMessage.includes('Failed to fetch') ||
                                                     errorMessage.includes('NetworkError') ||
                                                     errorMessage.includes('ERR_FILE_NOT_FOUND');
                              
                              if (isNetworkError) {
                                console.error('检测到网络/文件错误，可能是 Blob URL 已过期');
                                // 自动重置 App 状态
                                revokeCurrentObjectURL();
                                setFile(null);
                                setFileUrl(null);
                                setPdfDocument(null);
                                alert('PDF 文件加载失败，请重新上传');
                              }
                            }}
                          >
                            <Page
                              pageNumber={pageNumber}
                              scale={zoom}
                              className="shadow-lg bg-white"
                              renderAnnotationLayer={false}
                              renderTextLayer={true}
                            />
                          </Document>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full w-full">
                        <div className="w-24 h-24 bg-slate-300 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 hover:scale-105">
                          <FileText size={48} className="text-slate-500 dark:text-slate-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-3">上传 PDF 文件开始阅读</h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 text-center max-w-md text-sm">
                          支持拖拽上传或点击下方按钮选择文件
                        </p>
                        <button
                          onClick={handleFileUpload}
                          className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-600/30 hover:-translate-y-0.5 transition-all duration-200 active:translate-y-0 active:shadow-lg"
                        >
                          <Upload size={24} />
                          <span className="font-medium">选择 PDF 文件</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : activeSidebarItem === 'history' ? (
                <div className="flex-1 bg-white dark:bg-slate-900 overflow-auto p-4 flex flex-col">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">历史记录</h2>
                  {!Array.isArray(history) || history.length === 0 ? (
                    <div className="p-4 text-gray-400">暂无历史记录</div>
                  ) : (
                    <>
                      <div className="space-y-3 flex-1">
                        {history.map((item, index) => (
                          <div 
                            key={item.id || index}
                            className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200 relative group cursor-pointer"
                            onClick={() => {
                              // 这里可以添加重新加载或跳转的逻辑
                              console.log('Loading paper:', item.title);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                                {item?.title || '未知标题'}
                              </h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {item?.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-3">
                              <button
                                className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-200"
                                title="快速打开"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('Quick open:', item.title);
                                }}
                              >
                                <ArrowRight size={16} />
                              </button>
                              <button
                                className="p-2 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all duration-200"
                                title="删除"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromHistory(item.title);
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <button
                          className="w-full px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-200"
                          onClick={clearHistory}
                        >
                          清空历史记录
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : activeSidebarItem === 'bookmark' ? (
                <div className="flex-1 bg-white dark:bg-slate-900 overflow-auto p-4">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">收藏夹</h2>
                  {!Array.isArray(bookmarks) || bookmarks.length === 0 ? (
                    <div className="p-4 text-gray-400">暂无记录</div>
                  ) : (
                    <div className="space-y-3">
                      {bookmarks.map((item, index) => (
                        <div 
                          key={item.id || index}
                          className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200 relative group cursor-pointer"
                          onClick={() => {
                            // 这里可以添加重新加载或跳转的逻辑
                            console.log('Loading bookmark:', item.title);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                              {item?.title || '未知标题'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {item?.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <button
                              className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-200"
                              title="快速打开"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('Quick open bookmark:', item.title);
                              }}
                            >
                              <ArrowRight size={16} />
                            </button>
                            <button
                              className="p-2 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all duration-200"
                              title="取消收藏"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromBookmark(item.title);
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          }
          rightPanel={
            <div className="h-full bg-slate-50/80 dark:bg-slate-900/95 border-l border-slate-200/80 dark:border-slate-800/80 shadow-xl transition-colors duration-300">
              <AIPanel
                selectedText={selectedText}
                onClear={() => setSelectedText('')}
                onOpenSettings={() => setSettingsOpen(true)}
                doi={doi}
                arxivId={arxivId}
                customUrl={customUrl}
                onCustomUrlChange={(url) => setCustomUrl(url)}
                onTriggerSettingsHint={triggerSettingsHint}
                onReDetectDOI={reDetectDOI}
                hasFile={!!fileUrl}
                shouldExtractMetadata={shouldExtractMetadata}
                paperPortrait={paperPortrait}
                isGeneratingPortrait={isGeneratingPortrait}
                onJumpToPage={handleJumpToPage}
                sidebarWidth={sidebarWidth}
                isFullscreen={isSidebarFullscreen}
                onToggleFullscreen={() => setIsSidebarFullscreen(!isSidebarFullscreen)}
                pdfDocument={pdfDocument}
                paperInfo={metadata ? {
                  title: metadata.title,
                  authors: metadata.authors,
                  journal: metadata.journal,
                  year: metadata.year,
                  volume: metadata.volume,
                  issue: metadata.issue,
                  keywords: metadata.keywords,
                  codeLinks: metadata.codeLinks,
                  paperType: metadata.paperType,
                  abstract: metadata.abstract,
                  arxivId: arxivId,
                  doi: doi,
                  journalUrl: null // 暂时设置为 null，需要根据实际情况获取
                } : undefined}
                onAddToHistory={saveToHistory}
                onToggleBookmark={toggleBookmark}
                isBookmarked={metadata ? isBookmarked({...metadata, arxivId, doi}) : false}
              />
            </div>
          }
          minRightWidth={350}
          maxRightWidth={800}
          defaultRightWidth={480}
          onWidthChange={setSidebarWidth}
          isFullscreen={isSidebarFullscreen}
          onToggleFullscreen={() => setIsSidebarFullscreen(!isSidebarFullscreen)}
        />
      </div>

      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-indigo-600/10 backdrop-blur-sm flex items-center justify-center pointer-events-none transition-all duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-16 text-center border-4 border-dashed border-indigo-500 dark:border-indigo-400 max-w-lg mx-8 animate-pulse">
            <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/30">
              <FileUp size={64} className="text-white" />
            </div>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
              松开鼠标，立即研读论文
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              支持 PDF 格式文件
            </p>
          </div>
        </div>
      )}

      {isRestoring && (
        <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 flex items-center gap-4">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-lg font-medium text-slate-900 dark:text-slate-100">正在恢复上次阅读进度...</span>
          </div>
        </div>
      )}

      {showRestoreToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">已为你恢复上次阅读进度</span>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">清除缓存</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              确定要清除所有缓存数据吗？这将删除已保存的 PDF 文件和阅读进度（{formatStorageSize(storageSize)}）。
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClearCache}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                确认清除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
