"""历史记录相关路由：history/*"""

import asyncio

from fastapi import APIRouter, HTTPException, Depends

from utils.state import storage
from utils.helpers import filter_eligible_sentences
from auth.deps import require_auth, TokenData

router = APIRouter(prefix="/api", tags=["history"])


def compute_file_progress(file_id: str) -> dict:
    try:
        result = {"phase1": {"completed": 0, "total": 0}, "phase2": {"completed": 0, "total": 0}}

        plan = storage.load_learning_plan(file_id)
        if plan:
            max_index = storage.load_learning_max_progress(file_id)
            accumulated = 0
            completed = 0
            for unit_plan in plan:
                items = unit_plan.get("items", [])
                end_index = accumulated + len(items)
                if max_index >= end_index:
                    completed += 1
                accumulated = end_index
            result["phase1"]["completed"] = completed
            result["phase1"]["total"] = len(plan)

        sentences = storage.load_pipeline_data(file_id)
        if sentences:
            eligible = filter_eligible_sentences(sentences)
            if eligible:
                exercise_order = storage.load_exercise_order(file_id, 2)
                exercises_per_sent = []
                for s in eligible:
                    wc = len(s.get("sentence", "").split())
                    if wc >= 20:
                        exercises_per_sent.append(3)
                    elif wc >= 3:
                        exercises_per_sent.append(4)
                    else:
                        exercises_per_sent.append(1)
                expected_length = sum(exercises_per_sent)

                if exercise_order and len(exercise_order) == expected_length:
                    total_exercises = len(exercise_order)
                    unit_size = 10
                    num_units = max(1, (total_exercises + unit_size - 1) // unit_size)
                    max_exercise_index = storage.load_phase2_max_progress(file_id)

                    completed = 0
                    for i in range(num_units):
                        end = min((i + 1) * unit_size, total_exercises)
                        if max_exercise_index >= end:
                            completed += 1
                    result["phase2"]["completed"] = completed
                    result["phase2"]["total"] = num_units
                else:
                    # exercise_order 尚未生成，从 eligible sentences 计算预期单元数
                    unit_size = 10
                    total_exercises = expected_length
                    num_units = max(1, (total_exercises + unit_size - 1) // unit_size)
                    result["phase2"]["completed"] = 0
                    result["phase2"]["total"] = num_units

        return result
    except Exception:
        return {"phase1": {"completed": 0, "total": 0}, "phase2": {"completed": 0, "total": 0}}


@router.get("/history")
async def get_history(current_user: TokenData = Depends(require_auth)):
    try:
        records = storage.load_history(user_id=current_user.user_id)
        records.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        # ponytail: 原实现在 async 端点里直接 for record: compute_file_progress(record)
        # 每条记录跑 6+ 次同步 SQLite + 一次纯 Python 遍历，10 条记录就是 60+ 次同步 DB
        # 调用全部串行阻塞事件循环——多用户场景下会把整个 worker 占死。
        # 改为：把整段同步循环扔到线程池，async 端点立即释放事件循环。
        # 注意 storage 的 _get_conn 用 threading.local()，线程池里调用会自动建独立连接。
        def _build_response():
            for record in records:
                file_id = record.get("file_id", "")
                if file_id:
                    record["progress"] = compute_file_progress(file_id)
                    # 修复历史遗留：source_lang 仍为 "auto"（标题生成失败时未更新），
                    # 从 language_settings 取回检测到的真实语言并回写 DB + 返回值，
                    # 使 HistorySidebar 语言分组和单词总表过滤恢复正常。
                    if record.get("source_lang", "") in ("", "auto"):
                        settings = storage.load_language_settings(file_id)
                        detected = settings.get("source_lang") if settings else None
                        if detected and detected not in ("", "auto"):
                            storage.add_history_record(
                                file_id, record.get("title", ""), detected,
                                record.get("target_lang", "zh"), record.get("text_preview", ""),
                                user_id=current_user.user_id
                            )
                            record["source_lang"] = detected
                else:
                    record["progress"] = {"phase1": {"completed": 0, "total": 0}, "phase2": {"completed": 0, "total": 0}}
            return records
        records = await asyncio.to_thread(_build_response)
        return {"records": records}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/history/{file_id}/touch")
async def touch_history(file_id: str, current_user: TokenData = Depends(require_auth)):
    """更新历史记录的 updated_at（点击条目进入时调用，使其成为"最近条目"）。"""
    try:
        records = storage.load_history(user_id=current_user.user_id)
        if not any(r.get("file_id") == file_id for r in records):
            raise HTTPException(status_code=404, detail="Record not found")
        storage.touch_history_record(file_id)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{file_id}")
async def delete_history(file_id: str, current_user: TokenData = Depends(require_auth)):
    try:
        # 验证该记录属于当前用户
        records = storage.load_history(user_id=current_user.user_id)
        if not any(r.get("file_id") == file_id for r in records):
            raise HTTPException(status_code=404, detail="Record not found")
        success = storage.delete_history_record(file_id)
        if success:
            return {"success": True}
        raise HTTPException(status_code=404, detail="Record not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/history/{file_id}")
async def rename_history(file_id: str, request: dict, current_user: TokenData = Depends(require_auth)):
    try:
        # 验证该记录属于当前用户
        records = storage.load_history(user_id=current_user.user_id)
        if not any(r.get("file_id") == file_id for r in records):
            raise HTTPException(status_code=404, detail="Record not found")
        new_title = request.get("title", "").strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Title is required")
        success = storage.rename_history_record(file_id, new_title)
        if success:
            return {"success": True}
        raise HTTPException(status_code=404, detail="Record not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
