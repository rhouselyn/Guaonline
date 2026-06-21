"""共享状态：全局单例和可变状态，供各 router 和工具模块引用。"""



from text_processor import TextProcessor
from db_storage import DatabaseStorage

# ---- 核心单例 ----
text_processor = TextProcessor()
storage = DatabaseStorage()

# ---- 向后兼容的 llm_api shim ----
# 旧代码（如 learning.py）仍然 from utils.state import llm_api
# 这个 shim 将 process_text_with_dictionary 委托给 gateway
# 其他方法（如 generate_multiple_choice）需要调用方迁移到新接口
class _LegacyLLMApiShim:
    """向后兼容旧 llm_api 引用的适配器，仅支持 process_text_with_dictionary。"""
    async def process_text_with_dictionary(self, text, source_lang, target_lang, context_sentences=None):
        from utils.exercise_generators import _gateway_process_text_with_dictionary
        return await _gateway_process_text_with_dictionary(None, "free", text, source_lang, target_lang, context_sentences)

    async def generate_multiple_choice(self, word, correct_meaning, context, target_lang, source_lang, temperature):
        from utils.exercise_generators import _gateway_generate_multiple_choice
        return await _gateway_generate_multiple_choice(None, "free", word, correct_meaning, context, target_lang, source_lang, temperature)

    async def process_remaining_words(self, words, source_lang, target_lang, context):
        from utils.exercise_generators import _gateway_process_remaining_words
        return await _gateway_process_remaining_words(None, "free", words, source_lang, target_lang, context)

    async def call_llm(self, messages, tools=None, temperature=0.0, max_tokens=None, user_id=None):
        from utils.llm_gateway import gateway
        return await gateway.call(user_id or "system", "free", messages, temperature=temperature, max_tokens=max_tokens, request_type="llm_call", tools=tools)

    def reload(self):
        from utils.llm_gateway import gateway
        gateway.reload()

llm_api = _LegacyLLMApiShim()

# ---- 处理状态 ----
processing_status = {}
word_gen_state = {}

# ---- 预生成单词信息 ----
pre_generated_words = {}
