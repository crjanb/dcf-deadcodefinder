import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/* ---------------- TYPES ---------------- */

type FunctionInfo = {
    name: string;
    file: string;
    line: number;
    usageCount: number;
    lastUsed?: { file: string; line: number };
};

const functionIndex = new Map<string, FunctionInfo>();

/* ---------------- ACTIVATE ---------------- */

export function activate(context: vscode.ExtensionContext) {
    console.log('DCF extension activated');

    const diagnosticCollection = vscode.languages.createDiagnosticCollection("dcf");
    context.subscriptions.push(diagnosticCollection);

    let analysisResult: any = null;
    let analyzerTimeout: NodeJS.Timeout | null = null;
    const DEBOUNCE_DELAY = 500;

    /* ---------------- CODELENS ---------------- */

    class DeadCodeCodeLensProvider implements vscode.CodeLensProvider {
        private _onDidChange = new vscode.EventEmitter<void>();
        readonly onDidChangeCodeLenses = this._onDidChange.event;

        refresh() {
            this._onDidChange.fire();
        }

        provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
            if (!analysisResult) return [];

            const lenses: vscode.CodeLens[] = [];

            for (const fn of analysisResult.functions) {
                if (fn.file === document.uri.fsPath && fn.usage_count === 0) {
                    const range = new vscode.Range(fn.line - 1, 0, fn.line - 1, 0);
                    lenses.push(new vscode.CodeLens(range, {
                        title: 'Unused function',
                        command: ''
                    }));
                }
            }
            return lenses;
        }
    }

    const codeLensProvider = new DeadCodeCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ language: 'python', scheme: 'file' }, codeLensProvider)
    );

    /* ---------------- HOVER PROVIDER ---------------- */

    context.subscriptions.push(
        vscode.languages.registerHoverProvider('python', {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position);
                if (!range) return;

                const word = document.getText(range);
                const key = `${document.uri.fsPath}:${position.line + 1}`;
                const info = functionIndex.get(key);

                if (!info || info.name !== word) return;

                const md = new vscode.MarkdownString();
                md.isTrusted = true;

                if (info.usageCount === 0) {
                    md.appendMarkdown(`### 🚫 Unused function\n`);
                    md.appendMarkdown(`Defined in **${path.basename(info.file)}:${info.line}**\n\n`);
                    md.appendMarkdown(`Used: **0 times**`);
                } else {
                    md.appendMarkdown(`### ✅ Function used ${info.usageCount} times\n`);
                    md.appendMarkdown(`Defined in **${path.basename(info.file)}:${info.line}**\n\n`);
                    if (info.lastUsed) {
                        md.appendMarkdown(
                            `Last used in **${path.basename(info.lastUsed.file)}:${info.lastUsed.line}**`
                        );
                    }
                }

                return new vscode.Hover(md);
            }
        })
    );

    /* ---------------- ANALYZER ---------------- */

    const runAnalyzer = () => {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) return;

        const analyzerCandidates = [
            path.join(context.extensionPath, 'cli.py'),
            path.join(context.extensionPath, 'analyzer', 'cli.py'),
            path.join(context.extensionPath, '..', 'analyzer', 'cli.py')
        ];

        const analyzerPath = analyzerCandidates.find(p => fs.existsSync(p));
        if (!analyzerPath) return;

        execFile('python', [analyzerPath, workspace.uri.fsPath], { timeout: 30000 }, (err, stdout) => {
            if (err) return;

            try {
                analysisResult = JSON.parse(stdout);
            } catch {
                return;
            }

            /* ---- rebuild index ---- */
            functionIndex.clear();
            for (const fn of analysisResult.functions) {
                functionIndex.set(`${fn.file}:${fn.line}`, {
                    name: fn.name,
                    file: fn.file,
                    line: fn.line,
                    usageCount: fn.usage_count,
                    lastUsed: fn.last_used || undefined
                });
            }

            /* ---- diagnostics ---- */
            diagnosticCollection.clear();
            const fileMap = new Map<string, vscode.Diagnostic[]>();

            for (const fn of analysisResult.functions) {
                if (fn.usage_count === 0) {
                    const diag = new vscode.Diagnostic(
                        new vscode.Range(fn.line - 1, 0, fn.line - 1, 100),
                        'Unused function',
                        vscode.DiagnosticSeverity.Warning
                    );
                    const arr = fileMap.get(fn.file) || [];
                    arr.push(diag);
                    fileMap.set(fn.file, arr);
                }
            }

            for (const c of analysisResult.commented_code) {
                const diag = new vscode.Diagnostic(
                    new vscode.Range(c.line - 1, 0, c.line - 1, 100),
                    `Commented-out code`,
                    vscode.DiagnosticSeverity.Hint
                );
                const arr = fileMap.get(c.file) || [];
                arr.push(diag);
                fileMap.set(c.file, arr);
            }

            fileMap.forEach((diags, file) => {
                diagnosticCollection.set(vscode.Uri.file(file), diags);
            });

            codeLensProvider.refresh();
        });
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('dcf.scanWorkspace', runAnalyzer)
    );

    vscode.workspace.onDidSaveTextDocument(() => {
        if (analyzerTimeout) clearTimeout(analyzerTimeout);
        analyzerTimeout = setTimeout(runAnalyzer, DEBOUNCE_DELAY);
    });

    runAnalyzer();
}

export function deactivate() {}
