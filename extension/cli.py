import sys
import json
from analyzer import analyze_workspace

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No path provided"}))
        sys.exit(1)

    workspace_path = sys.argv[1]
    result = analyze_workspace(workspace_path)
    print(json.dumps(result))

if __name__ == "__main__":
    main()