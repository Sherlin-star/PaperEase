import React, { useState, useEffect, useRef } from 'react';
import { X, Globe, FileText, Download, Loader2, CheckCircle, AlertCircle, LayoutTemplate, BookOpen, Clock, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  TranslationMode, 
  formatTime,
  TranslatedPage,
  TranslationService
} from '../services/translationService';
import { SUPPORTED_MODELS } from '../config/aiConfig';
import { useTranslation, PageRange, parsePageRange } from '../contexts/TranslationContext';

interface TranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfDocument: any;
  file: File;
  numPages: number;
  currentPage?: number;
}

export default function TranslationModal({ 
  isOpen, 
  onClose, 
  pdfDocument, 
  file, 
  numPages,
  currentPage = 1
}: TranslationModalProps) {
  const {
    isTranslating,
    progress,
    translatedPages,
    error: contextError,
    isCompleted,
    startTranslation,
    closeModal,
    resetTranslation,
    exportPDF: contextExportPDF,
    exportWord: contextExportWord,
    skipReferences,
    setPageRange,
    setSkipReferences,
    isBackgroundTranslating,
    backgroundProgress
  } = useTranslation();

  const [localMode, setLocalMode] = useState<TranslationMode>('bilingual'); // 默认使用双语模式
  const [selectedModel, setSelectedModel] = useState<string>('deepseek');
  const [showPreview, setShowPreview] = useState(false);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);
  const [exportingType, setExportingType] = useState<'pdf' | 'word' | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [localPageRangeType, setLocalPageRangeType] = useState<'all' | 'current' | 'custom'>('all');
  const [customRangeInput, setCustomRangeInput] = useState('');
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [canvasLoading, setCanvasLoading] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const model = SUPPORTED_MODELS[selectedModel];
  const apiKey = localStorage.getItem(model?.keyPrefix || '') || '';

  useEffect(() => {
    if (isOpen) {
      setShowPreview(false);
      setExportSuccess(null);
      if (!isTranslating && !isCompleted) {
        resetTranslation();
      }
      setLocalPageRangeType('all');
      setCustomRangeInput('');
      setCustomRangeError(null);
    }
  }, [isOpen, resetTranslation, isTranslating, isCompleted]);

  useEffect(() => {
    if (isCompleted && translatedPages.length > 0) {
      setShowPreview(true);
    }
  }, [isCompleted, translatedPages]);

  // 强制渲染触发器：当 translatedPages 变化时，强制执行一次重新绘制
  useEffect(() => {
    if (showPreview && translatedPages.length > 0) {
      // 使用 requestAnimationFrame 确保 DOM 更新后重新绘制
      requestAnimationFrame(() => {
        const previewElement = document.querySelector('.border-slate-200.dark\:border-slate-700') as HTMLElement;
        if (previewElement) {
          // 触发重排
          previewElement.style.display = 'none';
          previewElement.offsetHeight; // 触发重排
          previewElement.style.display = '';
        }
      });
    }
  }, [translatedPages, showPreview, currentPreviewPage]);

  // 当页码或翻译数据变化时，重新渲染Canvas预览
  useEffect(() => {
    if (showPreview && translatedPages.length > 0 && currentPreviewPage > 0) {
      renderCanvasPreview();
    }
  }, [showPreview, currentPreviewPage, translatedPages, pdfDocument, model, apiKey]);

  const validateCustomRange = (input: string): { valid: boolean; pages: number[]; error?: string } => {
    if (!input.trim()) {
      return { valid: false, pages: [], error: '请输入页码范围' };
    }

    const pages = parsePageRange(input, numPages);
    
    if (pages.length === 0) {
      return { valid: false, pages: [], error: '无效的页码范围，请检查输入' };
    }

    return { valid: true, pages };
  };

  const handleCustomRangeChange = (value: string) => {
    setCustomRangeInput(value);
    
    if (value.trim()) {
      const result = validateCustomRange(value);
      setCustomRangeError(result.valid ? null : result.error || null);
    } else {
      setCustomRangeError(null);
    }
  };

  const handleStartTranslation = async () => {
    if (!apiKey) {
      return;
    }

    if (!pdfDocument) {
      return;
    }

    let range: PageRange;
    
    if (localPageRangeType === 'all') {
      range = { type: 'all', pages: Array.from({ length: numPages }, (_, i) => i + 1) };
    } else if (localPageRangeType === 'current') {
      range = { type: 'current', pages: [currentPage] };
    } else {
      const result = validateCustomRange(customRangeInput);
      if (!result.valid) {
        setCustomRangeError(result.error || '无效的页码范围');
        return;
      }
      range = { type: 'custom', customRange: customRangeInput, pages: result.pages };
    }

    setPageRange(range);
    setShowPreview(false);
    startTranslation(pdfDocument, model, apiKey, localMode, range, skipReferences);
  };

  const handleBackgroundRun = () => {
    closeModal();
  };

  const handleExportPDF = async () => {
    if (!translatedPages.length || !pdfDocument) return;
    
    setExportingType('pdf');
    setExportSuccess(null);

    try {
      await contextExportPDF(pdfDocument, model, apiKey, file.name.replace('.pdf', ''), file);
      setExportSuccess('PDF 导出成功！');
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setExportingType(null);
    }
  };

  const handleExportWord = async () => {
    if (!translatedPages.length) return;
    
    setExportingType('word');
    setExportSuccess(null);

    try {
      await contextExportWord(pdfDocument, model, apiKey, file.name.replace('.pdf', ''));
      setExportSuccess('Word 导出成功！');
    } catch (err) {
      console.error('Word export error:', err);
    } finally {
      setExportingType(null);
    }
  };

  const handleClose = () => {
    if (isTranslating) {
      handleBackgroundRun();
    } else {
      onClose();
    }
  };

  const renderPreviewContent = (page: TranslatedPage) => {
    if (!page) {
      return (
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
            <span>正在解析文档结构...</span>
          </div>
        </div>
      );
    }

    if (page.paragraphs.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          该页面没有可翻译的内容
        </div>
      );
    }

    return (
      <div className="relative">
        <canvas 
          ref={canvasRef} 
          className="border border-slate-200 dark:border-slate-700 rounded-xl"
        />
        <div 
          ref={(el) => {
            if (el) {
              // 虚拟层渲染逻辑
              renderVirtualLayer(el, page);
            }
          }}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
        {canvasLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 rounded-xl">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
              <span className="text-slate-600 dark:text-slate-400">正在渲染预览...</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 虚拟层渲染
  const renderVirtualLayer = (container: HTMLElement, page: TranslatedPage) => {
    // 清空容器
    container.innerHTML = '';
    
    // 为每个段落创建绝对定位的div
    page.paragraphs.forEach((paragraph, index) => {
      if (!paragraph?.translatedText || paragraph?.error) return;

      // 计算样式
      const fontSize = paragraph.fontSize * 1.5 * 0.8;
      const fontFamily = paragraph.blocks[0]?.fontName || 'Helvetica';
      const lineHeight = fontSize * 1.4; // 自动计算行高
      
      // 创建翻译容器
      const translationDiv = document.createElement('div');
      translationDiv.style.position = 'absolute';
      translationDiv.style.left = `${paragraph.x * 1.5}px`;
      translationDiv.style.top = `${paragraph.y * 1.5 - paragraph.height * 1.5}px`;
      translationDiv.style.width = `${paragraph.width * 1.5}px`;
      translationDiv.style.minHeight = `${paragraph.height * 1.5}px`;
      translationDiv.style.fontSize = `${fontSize}px`;
      translationDiv.style.fontFamily = `"Microsoft YaHei", "SimHei", "Noto Sans CJK SC", ${fontFamily}, sans-serif`;
      translationDiv.style.lineHeight = `${lineHeight}px`;
      translationDiv.style.color = '#1e293b';
      translationDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
      translationDiv.style.padding = '2px 4px';
      translationDiv.style.borderRadius = '2px';
      translationDiv.style.mixBlendMode = 'multiply';
      translationDiv.style.overflow = 'hidden';
      translationDiv.style.wordBreak = 'break-word';
      translationDiv.style.whiteSpace = 'normal';
      translationDiv.style.pointerEvents = 'none';
      translationDiv.className = 'translation-paragraph';
      translationDiv.textContent = paragraph.translatedText;
      
      container.appendChild(translationDiv);
    });
  };

  // 渲染Canvas预览（仅渲染原始PDF）
  const renderCanvasPreview = async () => {
    if (!canvasRef.current || !pdfDocument) return;

    setCanvasLoading(true);
    try {
      const page = translatedPages[currentPreviewPage - 1];
      if (!page) return;

      // 获取原始PDF页面
      const pdfPage = await pdfDocument.getPage(currentPreviewPage);
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      
      // 创建原始Canvas
      const originalCanvas = document.createElement('canvas');
      originalCanvas.width = viewport.width;
      originalCanvas.height = viewport.height;
      const ctx = originalCanvas.getContext('2d');
      
      if (ctx) {
        // 渲染原始PDF到Canvas
        const renderTask = pdfPage.render({
          canvasContext: ctx,
          viewport: viewport
        });
        
        await renderTask.promise;
        
        // 显示原始PDF
        const previewCanvas = canvasRef.current;
        previewCanvas.width = originalCanvas.width;
        previewCanvas.height = originalCanvas.height;
        const previewCtx = previewCanvas.getContext('2d');
        if (previewCtx) {
          previewCtx.drawImage(originalCanvas, 0, 0);
        }
      }
    } catch (error) {
      console.error('Canvas rendering error:', error);
    } finally {
      setCanvasLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ display: isOpen ? 'flex' : 'none' }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              全文对照翻译
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isTranslating && (
              <button
                onClick={handleBackgroundRun}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="后台运行"
              >
                <Minimize2 className="w-4 h-4" />
                后台运行
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {!showPreview ? (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  翻译范围
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="pageRange"
                      checked={localPageRangeType === 'all'}
                      onChange={() => setLocalPageRangeType('all')}
                      className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      全部页面 <span className="text-slate-500 dark:text-slate-400">(共 {numPages} 页)</span>
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="pageRange"
                      checked={localPageRangeType === 'current'}
                      onChange={() => setLocalPageRangeType('current')}
                      className="w-4 h-4 text-indigo-600 dark:text-indigo-400"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      仅当前页 <span className="text-slate-500 dark:text-slate-400">(第 {currentPage} 页)</span>
                    </span>
                  </label>
                  
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="pageRange"
                      checked={localPageRangeType === 'custom'}
                      onChange={() => setLocalPageRangeType('custom')}
                      className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-slate-700 dark:text-slate-300 block mb-2">
                        自定义范围
                      </span>
                      <input
                        type="text"
                        value={customRangeInput}
                        onChange={(e) => handleCustomRangeChange(e.target.value)}
                        onFocus={() => setLocalPageRangeType('custom')}
                        placeholder="例如: 1, 3-5, 8"
                        disabled={localPageRangeType !== 'custom'}
                        className={`w-full px-3 py-2 text-sm rounded-lg border transition-colors ${
                          customRangeError 
                            ? 'border-red-300 dark:border-red-700 focus:ring-red-500' 
                            : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500'
                        } ${localPageRangeType !== 'custom' ? 'opacity-50' : ''} bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100`}
                      />
                      {customRangeError && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-1">{customRangeError}</p>
                      )}
                      {!customRangeError && localPageRangeType === 'custom' && customRangeInput && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                          将翻译 {parsePageRange(customRangeInput, numPages).length} 页
                        </p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        支持格式: 单页 (1)、连续 (3-5)、混合 (1, 3-5, 8)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  智能选项
                </h3>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipReferences}
                    onChange={(e) => setSkipReferences(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5"
                  />
                  <div>
                    <span className="text-sm text-slate-700 dark:text-slate-300 block">
                      自动跳过参考文献部分
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block mt-1">
                      识别并跳过 "References" / "Bibliography" 等章节，减少约 30% 翻译时间
                    </span>
                  </div>
                </label>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  选择翻译模式
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setLocalMode('overlay')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      localMode === 'overlay'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <LayoutTemplate className={`w-8 h-8 mb-3 ${
                      localMode === 'overlay' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                    }`} />
                    <h4 className={`font-semibold mb-1 ${
                      localMode === 'overlay' ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      保留原排版替换
                    </h4>
                    <p className={`text-xs ${
                      localMode === 'overlay' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      在原 PDF 上覆盖中文
                    </p>
                  </button>

                  <button
                    onClick={() => setLocalMode('bilingual')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      localMode === 'bilingual'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <BookOpen className={`w-8 h-8 mb-3 ${
                      localMode === 'bilingual' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                    }`} />
                    <h4 className={`font-semibold mb-1 ${
                      localMode === 'bilingual' ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      双语左右对照
                    </h4>
                    <p className={`text-xs ${
                      localMode === 'bilingual' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      左侧英文，右侧中文
                    </p>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                  选择 AI 模型
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(SUPPORTED_MODELS).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedModel(key)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        selectedModel === key
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {config.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {config.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {(contextError || !apiKey) && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      {!apiKey ? '请先在设置中配置 API Key' : contextError}
                    </span>
                  </div>
                </div>
              )}

              {(isTranslating || translatedPages.some(p => p !== null)) && !showPreview && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {isTranslating ? (
                        <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      )}
                      <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                        {progress?.message || (isTranslating ? '正在初始化...' : '翻译完成')}
                      </span>
                    </div>
                    {progress && (
                      <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                        <Clock className="w-4 h-4" />
                        {progress.elapsedTime && formatTime(progress.elapsedTime)}
                        {progress.estimatedRemaining > 0 && (
                          <span className="text-indigo-500 dark:text-indigo-400">
                            · 预计还需 {formatTime(progress.estimatedRemaining)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {progress && (
                    <>
                      <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2 mb-4">
                        <div 
                          className="bg-indigo-600 dark:bg-indigo-400 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(progress.completedPages / progress.totalPages) * 100}%` }}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between text-sm text-indigo-700 dark:text-indigo-300">
                        <span>{progress.completedPages} / {progress.totalPages} 页</span>
                        <span>{Math.round((progress.completedPages / progress.totalPages) * 100)}%</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {translatedPages.length > 0 && !showPreview && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    实时翻译进度
                  </h4>
                  <div className="grid grid-cols-5 gap-2">
                    {translatedPages.map((page, index) => (
                      <div
                        key={index}
                        className={`h-8 rounded flex items-center justify-center text-xs font-medium ${
                          page?.status === 'completed' 
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                            : page?.status === 'error'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : page?.status === 'translating'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 animate-pulse'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {page?.status === 'completed' ? '✓' : page?.status === 'error' ? '✗' : page?.pageNumber || index + 1}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPreviewPage(Math.max(1, currentPreviewPage - 1))}
                    disabled={currentPreviewPage === 1}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    第 {currentPreviewPage} / {numPages} 页
                  </span>
                  <button
                    onClick={() => setCurrentPreviewPage(Math.min(numPages, currentPreviewPage + 1))}
                    disabled={currentPreviewPage === numPages}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 p-6 min-h-[500px] min-w-[600px]">
                {renderPreviewContent(translatedPages[currentPreviewPage - 1])}
              </div>

              {translatedPages[currentPreviewPage - 1]?.status === 'error' && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">该页翻译失败</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {exportSuccess && (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">{exportSuccess}</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {!showPreview ? (
                <>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    取消
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleStartTranslation}
                      disabled={isTranslating || !apiKey || (localPageRangeType === 'custom' && !!customRangeError)}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors"
                    >
                      {isTranslating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          翻译中...
                        </>
                      ) : (
                        <>
                          <Globe className="w-4 h-4" />
                          开始翻译
                        </>
                      )}
                    </button>
                    {isBackgroundTranslating && backgroundProgress && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-blue-700 dark:text-blue-300">
                          {backgroundProgress.message}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    返回设置
                  </button>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      翻译完成 · 用时 {progress ? formatTime(progress.elapsedTime || 0) : '--'}
                    </span>
                  </div>
                </>
              )}
              
              {showPreview && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportPDF}
                    disabled={exportingType !== null}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors"
                  >
                    {exportingType === 'pdf' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        文件准备中...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        导出 PDF
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleExportWord}
                    disabled={exportingType !== null}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors"
                  >
                    {exportingType === 'word' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        文件准备中...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        导出 Word
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
