#!/usr/bin/env python3
"""数据库自动迁移脚本。

用法:
    cd /workspace/backend && python migrate.py

功能:
1. Schema 迁移: 为 language_settings 添加 prompt 列, 创建二级索引
2. 数据修复: 清理 pipeline_data 中残留的 __failed 标记, 使条目可正常访问
3. 数据检查: 报告有句子但无词汇表的条目
"""

import json
import os
import sqlite3
import sys
from pathlib import Path

BASE_DIR = Path(os.environ.get("BASE_DIR", str(Path(__file__).resolve().parent.parent)))
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "gualingo.db"


def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def migrate_schema(conn):
    """Schema 迁移: prompt 列 + 二级索引"""
    print("=== Schema 迁移 ===")
    changed = False

    # 1. language_settings 添加 prompt 列
    cols = [r[1] for r in conn.execute("PRAGMA table_info(language_settings)").fetchall()]
    if "prompt" not in cols:
        conn.execute("ALTER TABLE language_settings ADD COLUMN prompt TEXT")
        conn.commit()
        print("  [+] language_settings.prompt 列已添加")
        changed = True
    else:
        print("  [ok] language_settings.prompt 列已存在")

    # 2. 二级索引
    indexes = [
        ("idx_history_user_created", "history(user_id, created_at DESC)",
         "CREATE INDEX IF NOT EXISTS idx_history_user_created ON history(user_id, created_at DESC)"),
        ("idx_word_cache_word", "word_cache(word)",
         "CREATE INDEX IF NOT EXISTS idx_word_cache_word ON word_cache(word)"),
        ("idx_language_settings_source", "language_settings(source_lang)",
         "CREATE INDEX IF NOT EXISTS idx_language_settings_source ON language_settings(source_lang)"),
    ]
    existing = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()}
    for name, desc, sql in indexes:
        if name not in existing:
            conn.execute(sql)
            conn.commit()
            print(f"  [+] 索引 {name} ({desc}) 已创建")
            changed = True
        else:
            print(f"  [ok] 索引 {name} ({desc}) 已存在")

    return changed


def cleanup_failed_markers(conn):
    """清理 pipeline_data 中残留的 __failed 标记"""
    print("\n=== 数据修复: 清理 __failed 标记 ===")
    rows = conn.execute("SELECT file_id, data FROM pipeline_data").fetchall()
    cleaned = 0

    for row in rows:
        file_id = row["file_id"]
        try:
            pipeline = json.loads(row["data"])
        except (json.JSONDecodeError, TypeError):
            continue

        if not isinstance(pipeline, list):
            continue

        had_failed = any(isinstance(sd, dict) and sd.get("__failed") for sd in pipeline)
        if not had_failed:
            continue

        # 清除 __failed 标记和关联的 error 字段
        new_pipeline = []
        for sd in pipeline:
            if isinstance(sd, dict) and sd.get("__failed"):
                cleaned_sd = {k: v for k, v in sd.items() if k != "__failed" and k != "error"}
                # 如果清理后只剩 sentence 字段,说明该句子从未成功翻译,保留 sentence 但移除失败标记
                new_pipeline.append(cleaned_sd)
            else:
                new_pipeline.append(sd)

        conn.execute(
            "UPDATE pipeline_data SET data = ?, updated_at = datetime('now') WHERE file_id = ?",
            (json.dumps(new_pipeline, ensure_ascii=False), file_id)
        )
        cleaned += 1
        print(f"  [+] {file_id}: 已清除 __failed 标记")

    if cleaned:
        conn.commit()
        print(f"  共清理 {cleaned} 个条目的 __failed 标记")
    else:
        print("  [ok] 无需清理, 没有发现 __failed 标记")

    return cleaned


def check_data_integrity(conn):
    """检查数据完整性: 报告有句子但无词汇表、有词汇表但无句子等异常"""
    print("\n=== 数据完整性检查 ===")

    # 获取所有 file_id
    all_files = set()
    for table in ["pipeline_data", "vocab", "language_settings", "history"]:
        for row in conn.execute(f"SELECT DISTINCT file_id FROM {table}").fetchall():
            all_files.add(row["file_id"])

    issues = []
    for file_id in sorted(all_files):
        has_pipeline = conn.execute(
            "SELECT 1 FROM pipeline_data WHERE file_id = ?", (file_id,)
        ).fetchone() is not None

        has_vocab = conn.execute(
            "SELECT 1 FROM vocab WHERE file_id = ?", (file_id,)
        ).fetchone() is not None

        has_settings = conn.execute(
            "SELECT 1 FROM language_settings WHERE file_id = ?", (file_id,)
        ).fetchone() is not None

        has_history = conn.execute(
            "SELECT 1 FROM history WHERE file_id = ?", (file_id,)
        ).fetchone() is not None

        if has_pipeline and not has_vocab:
            # 检查 pipeline 中是否有有效的翻译数据
            row = conn.execute(
                "SELECT data FROM pipeline_data WHERE file_id = ?", (file_id,)
            ).fetchone()
            try:
                pipeline = json.loads(row["data"]) if row else []
                valid = sum(1 for sd in pipeline if isinstance(sd, dict) and sd.get("translation_result"))
                issues.append(f"  [!] {file_id}: 有句子({len(pipeline)}条, {valid}条已翻译)但无词汇表")
            except (json.JSONDecodeError, TypeError):
                issues.append(f"  [!] {file_id}: pipeline_data 解析失败")

        if not has_settings and (has_pipeline or has_vocab):
            issues.append(f"  [!] {file_id}: 有数据但无 language_settings 记录")

    if issues:
        print(f"  发现 {len(issues)} 个潜在问题:")
        for issue in issues:
            print(issue)
    else:
        print("  [ok] 数据完整性检查通过")

    return len(issues)


def main():
    if not DB_PATH.exists():
        print(f"错误: 数据库文件不存在: {DB_PATH}")
        sys.exit(1)

    print(f"数据库: {DB_PATH}")
    print(f"大小: {DB_PATH.stat().st_size / 1024 / 1024:.1f} MB")
    print()

    conn = get_conn()

    try:
        migrate_schema(conn)
        cleanup_failed_markers(conn)
        check_data_integrity(conn)

        print("\n=== 迁移完成 ===")
        print("所有迁移步骤已执行完毕。")
    except Exception as e:
        print(f"\n迁移出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
