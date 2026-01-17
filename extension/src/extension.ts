import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('DCF extension activated');

    const diagnosticCollection = vscode.languages.createDiagnosticCollection("dcf");
    context.subscriptions.push(diagnosticCollection);

    let analysisResult: any = null;
    let analyzerTimeout: NodeJS.Timeout | null = null;
    const DEBOUNCE_DELAY = 500; // 500ms delay after last save

    // --- Single CodeLens provider ---
    class DeadCodeCodeLensProvider implements vscode.CodeLensProvider {
        private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
        public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

        public refresh() {
            this._onDidChangeCodeLenses.fire();
        }

        provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
            if (!analysisResult) return [];

            const codeLenses: vscode.CodeLens[] = [];
            const functionsInFile = analysisResult.unused_functions.filter((f: any) => f.file === document.uri.fsPath);

            for (const func of functionsInFile) {
                if (func.usage_count === 0) {
                    const range = new vscode.Range(func.line - 1, 0, func.line - 1, 0);
                    const title = `Unused function`;
                    codeLenses.push(new vscode.CodeLens(range, { title, command: "", arguments: [] }));
                }
            }

            return codeLenses;
        }
    }

    const codeLensProvider = new DeadCodeCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ scheme: 'file', language: 'python' }, codeLensProvider)
    );

    // --- Analyzer function ---
    const runAnalyzer = () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const pythonExecutable = 'python';

        const analyzerCandidates = [
            path.join(context.extensionPath, 'cli.py'),
            path.join(context.extensionPath, 'analyzer', 'cli.py'),
            path.join(context.extensionPath, '..', 'analyzer', 'cli.py')
        ];

        const analyzerPath = analyzerCandidates.find(p => fs.existsSync(p));
        if (!analyzerPath) {
            console.error('Analyzer script not found. Searched:', analyzerCandidates);
            return;
        }

        console.log('Running analyzer at:', analyzerPath);

        execFile(pythonExecutable, [analyzerPath, workspaceFolder.uri.fsPath], { timeout: 30000 }, (error, stdout, stderr) => {
            console.log('Analyzer output:', { error, stdout, stderr });

            if (error) return;

            try { analysisResult = JSON.parse(stdout); } catch { return; }

            console.log('Analysis result:', analysisResult);

            // --- Clear old diagnostics ---
            diagnosticCollection.clear();
            const fileDiagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();

            // --- Unused functions ---
            analysisResult.unused_functions.forEach((func: any) => {
                if (func.usage_count === 0) {
                    const range = new vscode.Range(func.line - 1, 0, func.line - 1, 100);
                    const message = `Unused function`;
                    const severity = vscode.DiagnosticSeverity.Warning;

                    const diagnostic = new vscode.Diagnostic(range, message, severity);
                    const uri = vscode.Uri.file(func.file);
                    const arr = fileDiagnosticsMap.get(uri.fsPath) || [];
                    arr.push(diagnostic);
                    fileDiagnosticsMap.set(uri.fsPath, arr);
                }
            });

            // --- Commented code ---
            analysisResult.commented_code.forEach((code: any) => {
                const range = new vscode.Range(code.line - 1, 0, code.line - 1, 100);
                const diagnostic = new vscode.Diagnostic(range, `Commented-out code: ${code.content}`, vscode.DiagnosticSeverity.Hint);
                const uri = vscode.Uri.file(code.file);
                const arr = fileDiagnosticsMap.get(uri.fsPath) || [];
                arr.push(diagnostic);
                fileDiagnosticsMap.set(uri.fsPath, arr);
            });

            // --- Update diagnostics ---
            fileDiagnosticsMap.forEach((diags, file) => {
                diagnosticCollection.set(vscode.Uri.file(file), diags);
            });

            // --- Refresh CodeLens ---
            codeLensProvider.refresh();
        });
    };

    // --- Command to manually scan workspace ---
    const disposable = vscode.commands.registerCommand('dcf.scanWorkspace', runAnalyzer);
    context.subscriptions.push(disposable);

    // --- Auto-run analyzer on save with debounce ---
    vscode.workspace.onDidSaveTextDocument(() => {
        if (analyzerTimeout) clearTimeout(analyzerTimeout);
        analyzerTimeout = setTimeout(() => {
            runAnalyzer();
        }, DEBOUNCE_DELAY);
    });

    // --- Initial scan on activation ---
    runAnalyzer();
}

export function deactivate() {}