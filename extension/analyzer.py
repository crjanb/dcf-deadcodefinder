import os
import ast
import re
from collections import defaultdict

# Directories to ignore
IGNORE_DIRS = {"venv", ".git", "__pycache__"}
COMMENT_CODE_PATTERN = re.compile(r'^\s*#\s*(def |class |import |return |for |while |if |elif |else )')

def analyze_workspace(path):
    # --- Step 1: scan all files and collect defs & calls ---
    all_func_defs = {}  # function_name -> {"file": file_path, "line": lineno}
    func_calls_counter = defaultdict(int)
    py_files = []

    for root, dirs, files in os.walk(path):
        # filter ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file in files:
            if file.endswith(".py"):
                full_path = os.path.join(root, file)
                py_files.append(full_path)

                with open(full_path, "r", encoding="utf-8") as f:
                    try:
                        tree = ast.parse(f.read())
                    except Exception:
                        continue

                    for node in ast.walk(tree):
                        if isinstance(node, ast.FunctionDef):
                            all_func_defs[node.name] = {"file": full_path, "line": node.lineno}

                        elif isinstance(node, ast.Call):
                            if isinstance(node.func, ast.Name):
                                func_calls_counter[node.func.id] += 1
                            elif isinstance(node.func, ast.Attribute):
                                func_calls_counter[node.func.attr] += 1

    # --- Step 2: detect commented code ---
    commented_code = []
    for file in py_files:
        with open(file, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
            for i, line in enumerate(lines):
                if COMMENT_CODE_PATTERN.match(line):
                    commented_code.append({
                        "file": file,
                        "line": i + 1,
                        "content": line.strip()
                    })

    # --- Step 3: build unused_functions with usage counts ---
    unused_functions = []
    for func_name, info in all_func_defs.items():
        usage_count = func_calls_counter.get(func_name, 0)
        unused_functions.append({
            "name": func_name,
            "file": info["file"],
            "line": info["line"],
            "usage_count": usage_count
        })

    return {
        "unused_functions": unused_functions,
        "unused_imports": [],  # optional: implement later
        "commented_code": commented_code
    }