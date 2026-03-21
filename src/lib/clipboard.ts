import { spawn } from "node:child_process";
import { platform } from "node:os";

function clipboardCommands(): string[][] {
  if (process.platform === "darwin") {
    return [["pbcopy"]];
  }
  if (process.platform === "win32") {
    return [["clip"]];
  }

  const sessionType = process.env.XDG_SESSION_TYPE;
  const commands: string[][] = [];
  if (sessionType === "wayland") {
    commands.push(["wl-copy"]);
  }
  commands.push(["xclip", "-selection", "clipboard"]);
  commands.push(["wl-copy"]);
  return commands;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  for (const [command, ...args] of clipboardCommands()) {
    const ok = await tryCopy(command, args, text);
    if (ok) {
      return true;
    }
  }
  return false;
}

async function tryCopy(command: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });

    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
    child.stdin.end(text);
  });
}
