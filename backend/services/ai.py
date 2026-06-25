"""
AI 服务层
封装 OpenAI 兼容 API 调用，支持流式响应
"""

import json
import logging
import time
from typing import AsyncGenerator, Optional

from openai import AsyncOpenAI

logger = logging.getLogger("paperlens.ai")


class AIService:
    """AI 服务类，封装 OpenAI 兼容 API"""
    
    def __init__(self, api_base_url: str, api_key: str, model_id: str):
        self.client = AsyncOpenAI(
            base_url=api_base_url,
            api_key=api_key,
        )
        self.model_id = model_id
    
    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> dict:
        """非流式对话"""
        start_time = time.time()
        
        response = await self.client.chat.completions.create(
            model=self.model_id,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        return {
            "content": response.choices[0].message.content or "",
            "tokens_input": response.usage.prompt_tokens if response.usage else 0,
            "tokens_output": response.usage.completion_tokens if response.usage else 0,
            "duration_ms": duration_ms,
        }
    
    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[dict, None]:
        """流式对话，返回 SSE 事件生成器"""
        start_time = time.time()
        full_content = ""
        tokens_input = 0
        tokens_output = 0
        
        # 记录首包时间用于诊断
        first_token_time = None
        
        try:
            stream = await self.client.chat.completions.create(
                model=self.model_id,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
        except Exception as e:
            raise
        
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_content += content
                if first_token_time is None:
                    first_token_time = time.time()
                    logger.info(
                        f"[Translate] First token received after "
                        f"{first_token_time - start_time:.2f}s"
                    )
                yield {
                    "type": "content",
                    "content": content,
                }
            
            if chunk.usage:
                tokens_input = chunk.usage.prompt_tokens
                tokens_output = chunk.usage.completion_tokens
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        yield {
            "type": "done",
            "content": full_content,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
            "duration_ms": duration_ms,
        }
    
    async def test_connection(self) -> dict:
        """测试模型连接"""
        try:
            start_time = time.time()
            response = await self.client.chat.completions.create(
                model=self.model_id,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
            )
            duration_ms = int((time.time() - start_time) * 1000)
            
            return {
                "success": True,
                "message": f"连接成功，响应时间 {duration_ms}ms",
                "duration_ms": duration_ms,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"连接失败: {str(e)}",
            }


async def get_ai_service(model_row: dict) -> AIService:
    """从模型记录创建 AI 服务实例"""
    return AIService(
        api_base_url=model_row["api_base_url"],
        api_key=model_row["api_key"],
        model_id=model_row["model_id"],
    )


TRANSLATE_SYSTEM_PROMPT = """你是一个专业的学术论文翻译专家。请将以下英文学术论文内容翻译成中文。

翻译要求：
1. 保持学术性和专业性，使用规范的学术用语
2. 保留专业术语的英文原文（在括号中标注），如：注意力机制（Attention Mechanism）
3. 保持原文的段落结构和逻辑关系
4. 数学公式使用 LaTeX 格式保留
5. 图表标题和引用文献保持原文
6. 翻译结果使用 Markdown 格式

直接输出翻译结果，不要添加任何额外说明。"""


GLOSSARY_SYSTEM_PROMPT = """你是一个学术术语翻译专家。请为以下英文术语提供准确的中文翻译和解释。

请以 JSON 格式返回：
{
  "phonetic": "音标（如果有）",
  "translation": "中文翻译",
  "explanation": "简短的中文解释（1-2句话）"
}

只返回 JSON，不要添加其他内容。"""


CHAT_SYSTEM_PROMPT_TEMPLATE = """你是一个专业的学术论文阅读助手。用户正在阅读以下论文：

论文标题：{title}
作者：{authors}
年份/会议：{year} · {venue}

回答要求：
1. 使用用户的语言回答
2. 保留专业术语并给出解释
3. 引用具体数据时标注页码
4. 回答要准确、专业、简洁"""
