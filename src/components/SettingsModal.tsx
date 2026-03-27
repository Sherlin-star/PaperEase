import React, { useState, useEffect } from 'react';
import { X, Key, Save, Eye, EyeOff, ChevronDown, Shield, BookOpen, ExternalLink, ArrowLeft, AlertTriangle, CheckCircle, CreditCard, Copy, Globe } from 'lucide-react';
import { SUPPORTED_MODELS } from '../config/aiConfig';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideStep {
  title: string;
  description: string;
  highlight?: string;
}

interface GuideContent {
  name: string;
  icon: string;
  color: string;
  url: string;
  consoleUrl: string;
  steps: GuideStep[];
  tips: string[];
  warnings: string[];
}

const API_GUIDES: Record<string, GuideContent> = {
  deepseek: {
    name: 'DeepSeek',
    icon: '🧠',
    color: 'from-blue-500 to-indigo-600',
    url: 'https://www.deepseek.com/',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    steps: [
      { title: '访问 DeepSeek 官网', description: '打开 https://www.deepseek.com/', highlight: '官网链接' },
      { title: '注册/登录账户', description: '使用手机号或邮箱注册，支持微信扫码登录' },
      { title: '进入控制台', description: '点击右上角头像，选择"API 开放平台"' },
      { title: '创建 API Key', description: '在"API Keys"页面点击"创建 API Key"，输入名称后确认' },
      { title: '复制并保存', description: '复制生成的 API Key（以 sk- 开头），粘贴到上方输入框' }
    ],
    tips: [
      '新用户通常有免费额度赠送',
      'DeepSeek 价格非常实惠，适合大量使用',
      '支持中文对话，响应速度快'
    ],
    warnings: [
      'API Key 只显示一次，请务必保存',
      '不要将 Key 分享给他人或提交到公开代码仓库'
    ]
  },
  groq: {
    name: 'Groq',
    icon: '⚡',
    color: 'from-orange-500 to-red-600',
    url: 'https://groq.com/',
    consoleUrl: 'https://console.groq.com/keys',
    steps: [
      { title: '访问 Groq 官网', description: '打开 https://groq.com/', highlight: '官网链接' },
      { title: '注册账户', description: '使用 Google 账号或邮箱注册' },
      { title: '进入控制台', description: '登录后自动跳转到控制台，或访问 https://console.groq.com/' },
      { title: '创建 API Key', description: '点击左侧菜单"API Keys"，然后点击"Create API Key"' },
      { title: '复制并保存', description: '输入 Key 名称，创建后复制 Key（以 gsk_ 开头）' }
    ],
    tips: [
      'Groq 提供超快的推理速度',
      '免费套餐有慷慨的调用额度',
      '支持 LLaMA、Mixtral 等开源模型'
    ],
    warnings: [
      '免费额度有限制，注意查看用量',
      'API Key 泄露可能导致额度被恶意使用'
    ]
  },
  kimi: {
    name: 'Kimi (月之暗面)',
    icon: '🌙',
    color: 'from-purple-500 to-pink-600',
    url: 'https://kimi.moonshot.cn/',
    consoleUrl: 'https://platform.moonshot.cn/console/api-keys',
    steps: [
      { title: '访问 Kimi 官网', description: '打开 https://kimi.moonshot.cn/', highlight: '官网链接' },
      { title: '注册/登录', description: '使用手机号注册，支持验证码登录' },
      { title: '进入开放平台', description: '访问 https://platform.moonshot.cn/ 或从官网底部进入' },
      { title: '创建 API Key', description: '在"API Key 管理"页面点击"创建新的 API Key"' },
      { title: '复制并保存', description: '复制生成的 Key（以 sk- 开头）' }
    ],
    tips: [
      'Kimi 擅长长文本处理，支持 20 万字上下文',
      '新用户有免费体验额度',
      '中文理解能力强，适合学术论文'
    ],
    warnings: [
      '注意查看账户余额，避免服务中断',
      'API Key 请妥善保管，不要泄露'
    ]
  },
  siliconflow: {
    name: '硅基流动',
    icon: '💎',
    color: 'from-cyan-500 to-blue-600',
    url: 'https://siliconflow.cn/',
    consoleUrl: 'https://cloud.siliconflow.cn/account/ak',
    steps: [
      { title: '访问硅基流动官网', description: '打开 https://siliconflow.cn/', highlight: '官网链接' },
      { title: '注册账户', description: '使用手机号或微信扫码注册' },
      { title: '进入控制台', description: '登录后点击右上角"控制台"或访问 https://cloud.siliconflow.cn/' },
      { title: '创建 API Key', description: '在"账户设置 > API 密钥"页面点击"新建 API 密钥"' },
      { title: '复制并保存', description: '复制生成的 Key（以 sk- 开头）' }
    ],
    tips: [
      '提供多种开源模型，价格实惠',
      '支持 DeepSeek、Qwen 等国产大模型',
      '新用户通常有免费额度'
    ],
    warnings: [
      '不同模型价格不同，注意查看计费',
      'API Key 泄露可能导致账户余额被盗用'
    ]
  }
};

function GuideModal({ 
  isOpen, 
  onClose,
  defaultTab 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  defaultTab: string;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  if (!shouldRender) return null;

  const guide = API_GUIDES[activeTab];

  return (
    <div 
      className={`fixed inset-0 bg-slate-900/70 dark:bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-[60] transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div 
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-800 transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-all duration-200"
            >
              <ArrowLeft size={20} className="text-slate-500 dark:text-slate-400" />
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl flex items-center justify-center">
              <BookOpen size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">API Key 获取教程</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">保姆级图文指南</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-all duration-200 hover:rotate-90"
          >
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6">
          <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
            {Object.entries(API_GUIDES).map(([key, g]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  activeTab === key
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-lg">{g.icon}</span>
                <span>{g.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(85vh-200px)] p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 bg-gradient-to-br ${guide.color} rounded-xl flex items-center justify-center text-white text-2xl shadow-lg`}>
                {guide.icon}
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{guide.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">快速获取 API Key</p>
              </div>
            </div>
            <a
              href={guide.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30 transition-all duration-200"
            >
              <Globe size={16} />
              <span>直达控制台</span>
              <ExternalLink size={14} />
            </a>
          </div>

          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-xs text-indigo-600 dark:text-indigo-400">📋</span>
              操作步骤
            </h4>
            <div className="space-y-3">
              {guide.steps.map((step, index) => (
                <div 
                  key={index}
                  className="flex gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-md">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-1">{step.title}</h5>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {step.description}
                      {step.highlight && (
                        <a
                          href={guide.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                        >
                          {step.highlight}
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-xs">💡</span>
              小贴士
            </h4>
            <div className="grid gap-2">
              {guide.tips.map((tip, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl"
                >
                  <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span className="w-6 h-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-xs">⚠️</span>
              注意事项
            </h4>
            <div className="grid gap-2">
              {guide.warnings.map((warning, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl"
                >
                  <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">{warning}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
            <div className="flex items-start gap-3">
              <CreditCard size={20} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-indigo-900 dark:text-indigo-200 mb-1">关于费用</h4>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed">
                  大多数 AI 平台都采用按量计费模式。新用户通常有免费额度，足够日常使用。建议先充值少量金额（如 ¥10-50）体验，满意后再增加预算。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            遇到问题？查看各平台官方文档或联系客服
          </p>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30 transition-all duration-200"
          >
            <ArrowLeft size={18} />
            <span>返回设置</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>('deepseek');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const selectedModel = SUPPORTED_MODELS[selectedModelId];
  const currentApiKey = apiKeys[selectedModel.keyPrefix] || '';

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsVisible(true), 10);
      const keys: Record<string, string> = {};
      Object.values(SUPPORTED_MODELS).forEach(model => {
        keys[model.keyPrefix] = localStorage.getItem(model.keyPrefix) || '';
      });
      setApiKeys(keys);
      setSaved(false);
    } else {
      setIsVisible(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  const handleKeyChange = (value: string) => {
    setApiKeys(prev => ({
      ...prev,
      [selectedModel.keyPrefix]: value
    }));
  };

  const handleSave = () => {
    Object.entries(apiKeys).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      setShouldRender(false);
      onClose();
    }, 300);
  };

  if (!shouldRender) return null;

  return (
    <>
      <div 
        className={`fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      >
        <div 
          className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-slate-200 dark:border-slate-800 transition-all duration-300 ${
            isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center transition-transform duration-200 hover:scale-105">
                <Key size={20} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">设置</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">配置您的 API 密钥</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-all duration-200 hover:rotate-90"
            >
              <X size={20} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                AI 模型
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all duration-200"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-300">{selectedModel.name}</span>
                  <ChevronDown 
                    size={18} 
                    className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 ${showModelDropdown ? 'rotate-180' : ''}`} 
                  />
                </button>
                {showModelDropdown && (
                  <div className="dropdown-animate absolute top-full left-0 mt-2 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden">
                    {Object.values(SUPPORTED_MODELS).map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModelId(model.id);
                          setShowModelDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 ${
                          selectedModelId === model.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {selectedModel.name} API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={currentApiKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder={`请输入 ${selectedModel.name} 的 API Key`}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-12 transition-all duration-200 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
                >
                  {showKey ? <EyeOff size={18} className="text-slate-500 dark:text-slate-400" /> : <Eye size={18} className="text-slate-500 dark:text-slate-400" />}
                </button>
              </div>
              <div className="flex items-start gap-2 mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <Shield size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  您的 API Key 将仅保存在本地浏览器中，不会上传到任何服务器。
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowGuide(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all duration-200"
            >
              <BookOpen size={18} />
              <span>👉 我需要详细教程</span>
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={handleClose}
              className="px-5 py-2.5 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-6 py-2.5 font-medium rounded-xl transition-all duration-300 ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30 hover:-translate-y-0.5'
              }`}
            >
              {saved ? (
                <>
                  <span>已保存</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>保存设置</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <GuideModal 
        isOpen={showGuide} 
        onClose={() => setShowGuide(false)}
        defaultTab={selectedModelId}
      />
    </>
  );
}
