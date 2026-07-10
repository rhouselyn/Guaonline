"""ponytail 端到端验证：两阶段处理「攀岩指导」样本。
跑：python3 backend/tests/test_two_stage_e2e.py
观察 processing_status 在阶段1（vocab 只有 word、translation 释义空）→ 阶段2（释义填上）的变化。
"""
import sys, os, asyncio, time, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.state import storage, processing_status
from utils.exercise_generators import process_text_background

USER_ID = "0f5f1d88-a234-4ccc-9540-79b16463f314"
FILE_ID = "test_two_stage_e2e_tmp"
# 攀岩指导样本（短句，省 LLM 额度）
TEXT = "Rock climbing needs focus and strength."


async def poll_and_assert():
    """轮询 processing_status，捕获阶段1 半成品（释义空）与阶段2 完成（释义填上）。"""
    saw_stage1_partial = False
    saw_meaning_filled = False
    final_vocab = None
    final_translations = None
    deadline = time.time() + 180
    last_log = 0
    while time.time() < deadline:
        st = processing_status.get(FILE_ID, {})
        status = st.get("status")
        vocab = st.get("vocab", [])
        sents = st.get("sentence_translations", [])
        progress = st.get("progress", 0)

        # 检测阶段1 半成品：有 vocab 词但释义空，或 sentence translation 有 text 但 meaning 空
        for v in vocab:
            if v.get("word") and not v.get("meaning"):
                saw_stage1_partial = True
        for sd in sents:
            tr = sd.get("translation_result", {}) if isinstance(sd, dict) else {}
            for tok in tr.get("translation", []) if isinstance(tr, dict) else []:
                if isinstance(tok, dict) and tok.get("text") and not tok.get("meaning"):
                    saw_stage1_partial = True
                if isinstance(tok, dict) and tok.get("text") and tok.get("meaning"):
                    saw_meaning_filled = True

        if time.time() - last_log > 3:
            print(f"[poll] status={status} progress={progress}% vocab={len(vocab)} sents={len(sents)} stage1_seen={saw_stage1_partial} filled_seen={saw_meaning_filled}")
            last_log = time.time()

        if status in ("completed", "error"):
            final_vocab = vocab
            final_translations = sents
            print(f"[poll] 终态 status={status}")
            break
        await asyncio.sleep(0.5)

    print("\n=== 验证 ===")
    print(f"1. 阶段1 半成品（释义空）出现过: {saw_stage1_partial}")
    print(f"2. 阶段2 释义填上出现过: {saw_meaning_filled}")

    # 最终 translation text 一致性 + 释义非空
    assert final_translations, "未拿到最终 sentence_translations"
    all_tokens = []
    for sd in final_translations:
        tr = sd.get("translation_result", {}) if isinstance(sd, dict) else {}
        for tok in tr.get("translation", []) if isinstance(tr, dict) else []:
            if isinstance(tok, dict) and tok.get("text"):
                all_tokens.append(tok)
    print(f"3. 最终 token 数: {len(all_tokens)}")
    for t in all_tokens:
        print(f"   text={t['text']!r} phonetic={t.get('phonetic','')!r} morph={t.get('morphology','')!r} meaning={t.get('meaning','')!r}")
    empty_meaning = [t for t in all_tokens if not t.get("meaning")]
    print(f"4. 释义为空的 token 数: {len(empty_meaning)}（应为 0 或极少，阶段2 填充后）")

    ok = saw_stage1_partial and saw_meaning_filled
    print(f"\n结果: {'通过 ✓' if ok else '未完全通过 ✗'}")
    return ok


async def main():
    # ponytail: process_text_background 假设 processing_status[file_id] 已被路由预初始化（含 original_text/title）
    processing_status[FILE_ID] = {"original_text": TEXT, "title": "攀岩指导"}
    print(f"启动两阶段处理: {TEXT!r}")
    task = asyncio.create_task(process_text_background(FILE_ID, TEXT, "en", "zh", USER_ID, "free"))
    ok = await poll_and_assert()
    # 等 task 真正结束
    try:
        await asyncio.wait_for(task, timeout=30)
    except asyncio.TimeoutError:
        task.cancel()
    # 清理临时数据
    try:
        storage.save_pipeline_data(FILE_ID, [])
        storage.save_vocab(FILE_ID, [])
        storage.save_learned_words(FILE_ID, [])
    except Exception:
        pass
    print("已清理临时数据")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
