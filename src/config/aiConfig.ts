export type AIAction = 'translate' | 'explain' | 'summarize';

export interface AIModel {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  keyPrefix: string;
}

export const SUPPORTED_MODELS: Record<string, AIModel> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyPrefix: 'deepseek_api_key'
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama3-70b-8192',
    keyPrefix: 'groq_api_key'
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyPrefix: 'kimi_api_key'
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    keyPrefix: 'siliconflow_api_key'
  }
};

export interface AIRequest {
  text: string;
  action: AIAction;
  apiKey: string;
  model: AIModel;
}

export interface AIResponse {
  result: string;
  error?: string;
}

export async function requestAI({ text, action, apiKey, model }: AIRequest): Promise<AIResponse> {
  if (!apiKey) {
    return { result: '', error: '请先配置 API Key' };
  }

  const prompts = {
    translate: `请将以下英文文本翻译成中文，保持学术风格和准确性：\n\n${text}`,
    explain: `请详细解释以下英文文本的含义，包括背景知识和关键概念：\n\n${text}`,
    summarize: `请用中文总结以下英文文本的主要观点和结论：\n\n${text}`
  };

  try {
    const response = await fetch(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model.model,
        messages: [
          {
            role: 'system',
            content: '你是一个专业的学术助手，擅长分析英文学术论文，提供准确的翻译、解释和总结。'
          },
          {
            role: 'user',
            content: prompts[action]
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      let errorMessage = errorData.error?.message || 'API 请求失败';
      if (response.status === 401) {
        errorMessage = 'API Key 无效或已过期，请检查设置中的 API Key';
      } else if (response.status === 429) {
        errorMessage = '请求过于频繁，请稍后再试';
      } else if (response.status === 402) {
        errorMessage = '账户余额不足，请充值';
      } else if (response.status === 403) {
        errorMessage = '没有权限访问此 API，请检查 API Key 是否正确';
      }
      
      return { 
        result: '', 
        error: errorMessage 
      };
    }

    const data = await response.json();
    return { result: data.choices[0].message.content };
  } catch (error) {
    return { 
      result: '', 
      error: error instanceof Error ? error.message : '网络请求失败' 
    };
  }
}
