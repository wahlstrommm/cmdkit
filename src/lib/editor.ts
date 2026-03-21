import { spawn } from "node:child_process";

function splitCommand(command: string): string[] {
  const matches = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return matches.map((part) => part.replace(/^"(.*)"$/, "$1"));
}

export async function openInEditor(filePath: string): Promise<void> {
  const fallbackEditors = ["zed --wait", "nano", "vi"];
  const editorCommand = process.env.EDITOR?.trim() || fallbackEditors.find(Boolean) || "vi";
  const [binary, ...args] = splitCommand(editorCommand);

  if (!binary) {
    throw new Error("No editor configured.");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, [...args, filePath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${editorCommand} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}
