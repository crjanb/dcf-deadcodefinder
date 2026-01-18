import os
import ast
import re
from collections import defaultdict

IGNORE_DIRS = {"venv", ".git", "__pycache__", "node_modules"}
COMMENT_CODE_PATTERN = re.compile(
    r'^\s*#\s*(def |class |import |return |for |while |if |elif |else )'
)

def analyze_workspace(path):
    all_func_defs = {}   # func_name -> {file, line}
    func_calls = defaultdict(list)  # func_name -> [{file, line}]
    py_files = []

    # --- Step 1: scan all python files ---
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file in files:
            if not file.endswith(".py"):
                continue

            full_path = os.path.join(root, file)
            py_files.append(full_path)

            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    source = f.read()
                tree = ast.parse(source)
            except Exception:
                continue

            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    all_func_defs[node.name] = {
                        "file": full_path,
                        "line": node.lineno
                    }

                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Name):
                        func_calls[node.func.id].append({
                            "file": full_path,
                            "line": node.lineno
                        })
                    elif isinstance(node.func, ast.Attribute):
                        func_calls[node.func.attr].append({
                            "file": full_path,
                            "line": node.lineno
                        })

    # --- Step 2: commented-out code ---
    commented_code = []
    for file in py_files:
        try:
            with open(file, "r", encoding="utf-8") as f:
                for i, line in enumerate(f.readlines()):
                    if COMMENT_CODE_PATTERN.match(line):
                        commented_code.append({
                            "file": file,
                            "line": i + 1,
                            "content": line.strip()
                        })
        except Exception:
            pass

    # --- Step 3: build function report ---
    functions = []

    for name, info in all_func_defs.items():
        calls = func_calls.get(name, [])
        usage_count = len(calls)

        last_used = None
        if calls:
            last = calls[-1]
            last_used = {
                "file": last["file"],
                "line": last["line"]
            }

        functions.append({
            "name": name,
            "file": info["file"],
            "line": info["line"],
            "usage_count": usage_count,
            "last_used": last_used
        })

    return {
        "functions": functions,
        "commented_code": commented_code,
        "unused_imports": []
    }
