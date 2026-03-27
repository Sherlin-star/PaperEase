import React, { useState, useRef, useEffect } from 'react';
import { Languages, BookOpen, Copy, X, ChevronDown, ChevronUp, XCircle, ScanText, ClipboardCheck, Sparkles, Check, Globe, Settings, RefreshCw, Target, MessageCircle } from 'lucide-react';
import { requestAI, AIAction, SUPPORTED_MODELS, AIModel } from '../config/aiConfig';
import ReactMarkdown from 'react-markdown';
import PaperPortrait from './PaperPortrait';

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="toast-enter bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium">
        <Check size={16} className="text-emerald-400 dark:text-emerald-600" />
        <span>{message}</span>
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 transition-colors duration-300">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 skeleton-shimmer rounded-full"></div>
        <div className="h-4 skeleton-shimmer rounded w-32"></div>
      </div>
      <div className="space-y-3">
        <div className="h-3 skeleton-shimmer rounded w-full"></div>
        <div className="h-3 skeleton-shimmer rounded w-full"></div>
        <div className="h-3 skeleton-shimmer rounded w-4/5"></div>
      </div>
      <div className="space-y-3">
        <div className="h-3 skeleton-shimmer rounded w-full"></div>
        <div className="h-3 skeleton-shimmer rounded w-3/4"></div>
      </div>
      <div className="flex gap-2 pt-2">
        <div className="h-3 skeleton-shimmer rounded w-20"></div>
        <div className="h-3 skeleton-shimmer rounded w-16"></div>
      </div>
    </div>
  );
}

interface PDFParagraph {
  text: string;
  pageNumber: number;
  paragraphIndex: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: { pageNumber: number; text: string }[];
  timestamp: number;
}

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

interface AIPanelProps {
  selectedText: string;
  onClear?: () => void;
  onOpenSettings?: () => void;
  doi?: string | null;
  arxivId?: string | null;
  customUrl?: string | null;
  onCustomUrlChange?: (url: string) => void;
  onTriggerSettingsHint?: () => void;
  paperPortrait: string | null;
  isGeneratingPortrait: boolean;
  onReDetectDOI?: () => void;
  hasFile?: boolean;
  shouldExtractMetadata?: boolean;
  onJumpToPage?: (pageNumber: number) => void;
  sidebarWidth?: number;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  pdfDocument?: object | null;
  paperInfo?: PaperInfo;
  onAddToHistory?: (paperData: PaperInfo) => void;
  onToggleBookmark?: (paperData: PaperInfo) => void;
  isBookmarked?: boolean;
}

export default function AIPanel({ 
  selectedText, 
  onClear, 
  onOpenSettings, 
  doi, 
  arxivId, 
  customUrl, 
  onCustomUrlChange, 
  onTriggerSettingsHint,
  paperPortrait,
  isGeneratingPortrait,
  onReDetectDOI,
  hasFile = false,
  shouldExtractMetadata = false,
  onJumpToPage,
  sidebarWidth = 480,
  isFullscreen = false,
  onToggleFullscreen,
  pdfDocument,
  paperInfo,
  onAddToHistory,
  onToggleBookmark,
  isBookmarked = false
}: AIPanelProps) {
  const [mode, setMode] = useState<'portrait' | 'chat'>('portrait');
  const [actionType, setActionType] = useState<AIAction | null>(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>('deepseek');
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  const [showUrlInput, setShowUrlInput] = useState<boolean>(false);
  const [tempUrl, setTempUrl] = useState<string>('');
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [copiedReference, setCopiedReference] = useState<boolean>(false);
  const [isAccordionOpen, setIsAccordionOpen] = useState<boolean>(false);
  const [isDetectingSource, setIsDetectingSource] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 元数据提取完成后添加到历史记录
  useEffect(() => {
    if (paperInfo && onAddToHistory && paperInfo.title && paperInfo.title !== '解析中...') {
      onAddToHistory(paperInfo);
    }
  }, [paperInfo, onAddToHistory]);

  // RAG 对话相关状态
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [pdfParagraphs, setPdfParagraphs] = useState<PDFParagraph[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // 提取 PDF 全文并建立索引
  const extractPDFContent = async () => {
    if (!pdfDocument) return [];
    setIsIndexing(true);
    try {
      const paragraphs: PDFParagraph[] = [];
      const numPages = pdfDocument.numPages;
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.filter((item: any) => item.str?.trim());
        
        let currentParagraph = '';
        let paragraphIndex = 0;
        
        for (const item of textItems) {
          const text = item.str.trim();
          if (text.length > 10) {
            if (currentParagraph) {
              paragraphs.push({
                text: currentParagraph.trim(),
                pageNumber: pageNum,
                paragraphIndex: paragraphIndex++
              });
            }
            currentParagraph = text;
          } else {
            currentParagraph += ' ' + text;
          }
        }
        
        if (currentParagraph.trim()) {
          paragraphs.push({
            text: currentParagraph.trim(),
            pageNumber: pageNum,
            paragraphIndex: paragraphIndex++
          });
        }
      }
      
      console.log(`Indexed ${paragraphs.length} paragraphs from PDF`);
      return paragraphs;
    } catch (error) {
      console.error('Error indexing PDF:', error);
      return [];
    } finally {
      setIsIndexing(false);
    }
  };

  // 关键词检索相关段落
  const retrieveRelevantParagraphs = (query: string, topK: number = 5): PDFParagraph[] => {
    if (pdfParagraphs.length === 0) return [];
    
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = pdfParagraphs.map(p => {
      const text = p.text.toLowerCase();
      let score = 0;
      
      for (const word of queryWords) {
        if (text.includes(word)) {
          score += 1;
          if (text.startsWith(word)) score += 0.5;
        }
      }
      
      return { paragraph: p, score };
    });
    
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.paragraph);
  };

  // 发送消息并获取流式响应
  const sendChatMessage = async (userMessage: string) => {
    if (!selectedModel || !apiKey) return;
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    };
    
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsStreaming(true);
    setStreamedContent('');
    
    try {
      // 检索相关段落
      const relevantParagraphs = retrieveRelevantParagraphs(userMessage, 5);
      const contextText = relevantParagraphs.length > 0
        ? `【相关段落】\n${relevantParagraphs.map(p => `[P${p.pageNumber}] ${p.text}`).join('\n\n')}`
        : '';
      
      const systemPrompt = `你是一个专业的学术论文助手，基于提供的论文内容回答用户问题。
重要规则：
1. 只基于论文内容回答，不要编造信息
2. 在回答中标注引用来源，如：[P3] 表示来自第3页
3. 如果无法从论文中找到答案，直接说明"论文中未涉及该内容"
4. 使用简洁专业的学术语言`;

      const response = await fetch(`${selectedModel.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user', content: contextText ? `${userMessage}\n\n${contextText}` : userMessage }
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 2000
        })
      });
      
      if (!response.ok) {
        throw new Error('API 请求失败');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullContent += content;
                  setStreamedContent(fullContent);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      }
      
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullContent,
        references: relevantParagraphs.map(p => ({ pageNumber: p.pageNumber, text: p.text.substring(0, 100) + '...' })),
        timestamp: Date.now()
      };
      
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，发生了错误，请稍后重试。',
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setStreamedContent('');
    }
  };

  // 快捷提问
  const quickQuestions = [
    { label: '简述本文创新点', prompt: '请简要概括本文的主要创新点和贡献' },
    { label: '总结实验步骤', prompt: '请详细总结本文的实验方法和工作流程' },
    { label: '提取核心结论', prompt: '请提取本文的核心结论和研究发现' }
  ];

  useEffect(() => {
    if (selectedText) {
      setMode('chat');
    }
  }, [selectedText]);

  useEffect(() => {
    if (isGeneratingPortrait) {
      setMode('portrait');
    }
  }, [isGeneratingPortrait]);

  // 自动提取 PDF 内容建立索引
  useEffect(() => {
    if (pdfDocument && pdfParagraphs.length === 0) {
      extractPDFContent().then(paragraphs => {
        setPdfParagraphs(paragraphs);
      });
    }
  }, [pdfDocument]);

  // 自动滚动到最新消息
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, streamedContent]);

  const selectedModel = SUPPORTED_MODELS[selectedModelId];
  const apiKey = localStorage.getItem(selectedModel?.keyPrefix || '') || '';

  const hasSourceUrl = Boolean(doi || customUrl);

  const handleAction = async (type: AIAction) => {
    if (!selectedText || !selectedModel) return;
    
    setActionType(type);
    setLoading(true);
    setError('');
    setResult('');
    
    try {
      const response = await requestAI({
        text: selectedText,
        action: type,
        apiKey,
        model: selectedModel
      });
      
      if (response.error) {
        setError(response.error);
      } else {
        setResult(response.result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    onClear?.();
    setResult('');
    setError('');
    setActionType(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setShowToast(true);
    setTimeout(() => {
      setCopied(false);
      setShowToast(false);
    }, 2000);
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    setShowModelDropdown(false);
  };

  // 重构跳转逻辑函数 MapsToOfficialSource
  const MapsToOfficialSource = async () => {
    setIsDetectingSource(true);
    
    try {
      // 逻辑断路 (Short-circuit)
      // IF paperInfo.arxivId 存在 -> 跳转 https://arxiv.org/abs/${paperInfo.arxivId}
      if (paperInfo?.arxivId) {
        console.log('Found arXiv ID:', paperInfo.arxivId);
        window.open(`https://arxiv.org/abs/${paperInfo.arxivId}`, '_blank');
        return;
      }
      
      // ELSE IF paperInfo.doi 存在 -> 跳转 https://doi.org/${paperInfo.doi}
      else if (paperInfo?.doi) {
        console.log('Found DOI:', paperInfo.doi);
        window.open(`https://doi.org/${paperInfo.doi}`, '_blank');
        return;
      }
      
      // ELSE IF paperInfo.journalUrl 存在 -> 跳转该 URL
      else if (paperInfo?.journalUrl) {
        console.log('Found journal URL:', paperInfo.journalUrl);
        window.open(paperInfo.journalUrl, '_blank');
        return;
      }
      
      // ELSE (最后的手段) -> 使用 Google Scholar 精确搜索
      else if (paperInfo?.title) {
        console.warn('No direct link found, using Google Scholar search');
        const searchQuery = encodeURIComponent(`"${paperInfo.title}"`);
        window.open(`https://scholar.google.com/scholar?q=${searchQuery}`, '_blank');
        return;
      }
      
      // 兜底逻辑
      else {
        console.warn('No paper information available for跳转');
      }
    } catch (error) {
      console.error('Error opening source:', error);
    } finally {
      setIsDetectingSource(false);
    }
  };

  const handleOpenSource = MapsToOfficialSource;

  const handleReDetect = async () => {
    if (!onReDetectDOI) return;
    setIsDetecting(true);
    try {
      await onReDetectDOI();
    } finally {
      setTimeout(() => setIsDetecting(false), 1000);
    }
  };

  const handleSaveUrl = () => {
    onCustomUrlChange?.(tempUrl);
    setShowUrlInput(false);
    setTempUrl('');
  };

  const handleCopyReference = async () => {
    if (!doi) return;
    await navigator.clipboard.writeText(doi);
    setCopiedReference(true);
    setTimeout(() => setCopiedReference(false), 2000);
  };

  const actionButtons = [
    { type: 'translate' as AIAction, icon: Languages, label: '翻译' },
    { type: 'explain' as AIAction, icon: BookOpen, label: '解释' },
    { type: 'summarize' as AIAction, icon: ScanText, label: '总结' }
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 transition-colors duration-300 relative">
      <Toast message="复制成功" visible={showToast} />
      
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI 助手</span>
        </div>
        
        <div className="flex items-center gap-2 relative z-10">
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-2 rounded-lg transition-all duration-200 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={isFullscreen ? '退出全屏' : '全屏模式'}
            >
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              )}
            </button>
          )}
          <div className="flex items-center gap-1">
            {hasFile && !hasSourceUrl && (
              <button
                onClick={handleReDetect}
                disabled={isDetecting}
                className={`p-2 rounded-lg transition-all duration-200 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${isDetecting ? 'animate-spin' : ''}`}
                title="重新侦测 DOI"
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 text-sm"
            >
              <span className="font-medium text-slate-700 dark:text-slate-300">{selectedModel?.name || '选择模型'}</span>
              {showModelDropdown ? <ChevronUp size={14} className="text-slate-500 dark:text-slate-400" /> : <ChevronDown size={14} className="text-slate-500 dark:text-slate-400" />}
            </button>
            {showModelDropdown && (
              <div className="dropdown-animate absolute top-full right-0 mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                {Object.values(SUPPORTED_MODELS).map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelChange(model.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 ${
                      selectedModelId === model.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
            title="设置"
          >
            <XCircle size={18} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </div>

      {showUrlInput && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              placeholder="请输入论文 URL..."
              className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveUrl()}
            />
            <button
              onClick={handleSaveUrl}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              保存
            </button>
            <button
              onClick={() => setShowUrlInput(false)}
              className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setMode('portrait')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
            mode === 'portrait'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Target size={14} />
          <span>情报摘要</span>
        </button>
        <button
          onClick={() => setMode('chat')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
            mode === 'chat'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <MessageCircle size={14} />
          <span>AI 对话</span>
        </button>
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <button
          onClick={MapsToOfficialSource}
          disabled={isDetectingSource}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md cursor-pointer ${isDetectingSource ? 'opacity-70 cursor-not-allowed' : ''}`}
          title="访问官方原文"
        >
          {isDetectingSource ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>正在识别链接...</span>
            </>
          ) : paperInfo?.arxivId ? (
            <>
              <Globe size={16} />
              <span>直达 arXiv 官方页面</span>
            </>
          ) : paperInfo?.doi ? (
            <>
              <Globe size={16} />
              <span>访问 DOI 原文</span>
            </>
          ) : paperInfo?.journalUrl ? (
            <>
              <Globe size={16} />
              <span>访问期刊原文</span>
            </>
          ) : (
            <>
              <Globe size={16} />
              <span>访问官方原文</span>
            </>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden group">
        <div className="absolute inset-0 h-full overflow-y-auto p-4">
          {mode === 'portrait' && paperPortrait && (
            <PaperPortrait portrait={paperPortrait} onJumpToPage={onJumpToPage} sidebarWidth={sidebarWidth} />
          )}

          {mode === 'chat' && (
            <div className="h-full flex flex-col">
              {/* 快捷提问按钮 */}
              {chatMessages.length === 0 && (
                <div className="flex-shrink-0 px-4 pt-4 pb-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">快捷提问</p>
                  <div className="flex flex-wrap gap-2">
                    {quickQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendChatMessage(q.prompt)}
                        disabled={isStreaming || !apiKey || isIndexing}
                        className="px-3 py-1.5 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 聊天消息区域 */}
              <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              >
                {chatMessages.length === 0 && !isIndexing && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/40 dark:to-indigo-800/40 rounded-2xl flex items-center justify-center">
                      <MessageCircle size={28} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      基于论文的智能问答
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[280px] mx-auto">
                      我已经读取了全文，可以针对论文内容为您解答任何问题
                    </p>
                  </div>
                )}

                {isIndexing && (
                  <div className="text-center py-8">
                    <div className="w-10 h-10 mx-auto mb-3 border-3 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">正在索引论文内容...</p>
                  </div>
                )}

                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-700 dark:text-slate-300 leading-relaxed">{children}</p>,
                              code: ({ children }) => (
                                <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-mono">{children}</code>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {/* 引用来源 */}
                          {msg.references && msg.references.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">引用来源：</p>
                              <div className="flex flex-wrap gap-1">
                                {msg.references.map((ref, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => onJumpToPage?.(ref.pageNumber)}
                                    className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                  >
                                    P{ref.pageNumber}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* 流式输出 */}
                {isStreaming && streamedContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-700 dark:text-slate-300 leading-relaxed">{children}</p>,
                            code: ({ children }) => (
                              <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs font-mono">{children}</code>
                            ),
                          }}
                        >
                          {streamedContent}
                        </ReactMarkdown>
                      </div>
                      <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-1"></span>
                    </div>
                  </div>
                )}

                {isStreaming && !streamedContent && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 输入区域 */}
              <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatInput.trim() && !isStreaming) {
                        sendChatMessage(chatInput.trim());
                      }
                    }}
                    placeholder={isIndexing ? "正在索引论文..." : "输入问题，基于论文内容回答..."}
                    disabled={isStreaming || isIndexing || !apiKey}
                    className="flex-1 px-4 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    onClick={() => chatInput.trim() && sendChatMessage(chatInput.trim())}
                    disabled={!chatInput.trim() || isStreaming || isIndexing || !apiKey}
                    className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                  </button>
                </div>
                
                {/* 生成分享文案按钮 */}
                {chatMessages.length > 0 && (
                  <button
                    onClick={() => {
                      const shareText = chatMessages.map(m => 
                        m.role === 'user' ? `问：${m.content}` : `答：${m.content}`
                      ).join('\n\n');
                      navigator.clipboard.writeText(shareText);
                      setShowToast(true);
                      setTimeout(() => setShowToast(false), 2000);
                    }}
                    className="mt-2 w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1"
                  >
                    <Copy size={12} />
                    生成分享文案
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
