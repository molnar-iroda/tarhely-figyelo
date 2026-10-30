// A kezelőfelületről indított műveletek (futtatás, próba, ellenőrzés…): a
// parancssori programot indítjuk gyerekfolyamatként, a kimenetét gyűjtjük, így a
// felület ugyanazt látja és használja, mint az ütemezett futás.

import { type ChildProcess, spawn } from "node:child_process";

export type OperationName = "futtatas" | "proba" | "feldolgozas" | "ellenorzes" | "postafiokok" | "teszt-email";

export interface OperationView {
  readonly name: OperationName | null;
  readonly running: boolean;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly exitCode: number | null;
  readonly lines: readonly string[];
}

export interface OperationRequest {
  readonly name: OperationName;
  readonly since?: string | undefined;
  readonly all?: boolean | undefined;
  readonly to?: string | undefined;
}

export interface Operations {
  start(request: OperationRequest): OperationView;
  view(): OperationView;
  stop(): void;
}

const MAX_LINES = 1500;

/** @returns a parancssori program argumentumai (a program neve után). */
export function operationArguments(request: OperationRequest, configPath: string): string[] {
  const common = ["--beallitasok", configPath];
  switch (request.name) {
    case "futtatas":
      return ["futtatas", ...(request.all === true ? ["--mind"] : request.since ? ["--since", request.since] : []), ...common];
    case "proba":
      return ["futtatas", "--proba", ...(request.all === true ? ["--mind"] : request.since ? ["--since", request.since] : []), ...common];
    case "feldolgozas":
      return ["futtatas", "--csak-feldolgozas", ...common];
    case "ellenorzes":
      return ["ellenorzes", ...common];
    case "postafiokok":
      return ["postafiokok", ...common];
    case "teszt-email":
      return ["teszt-email", request.to ?? "", ...common];
  }
}

export function createOperations(
  cliPath: string,
  cwd: string,
  configPath: string,
  afterStop: () => void = () => {}
): Operations {
  let child: ChildProcess | null = null;
  let stopped = false;
  let state: {
    name: OperationName | null;
    startedAt: string | null;
    finishedAt: string | null;
    exitCode: number | null;
    lines: string[];
  } = { name: null, startedAt: null, finishedAt: null, exitCode: null, lines: [] };

  const view = (): OperationView => ({
    name: state.name,
    running: child !== null,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    exitCode: state.exitCode,
    lines: state.lines
  });

  function collect(chunk: Buffer, pending: { text: string }): void {
    pending.text += chunk.toString("utf8");
    const parts = pending.text.split(/\r?\n/u);
    pending.text = parts.pop() ?? "";
    for (const line of parts) {
      state.lines.push(line);
    }
    if (state.lines.length > MAX_LINES) {
      state.lines = state.lines.slice(-MAX_LINES);
    }
  }

  return {
    view,
    start(request) {
      if (child !== null) {
        throw new Error("Már fut egy művelet, várd meg a végét.");
      }
      stopped = false;
      state = { name: request.name, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, lines: [] };
      const process_ = spawn(process.execPath, [cliPath, ...operationArguments(request, configPath)], {
        cwd,
        env: process.env,
        windowsHide: true,
        // POSIX-on külön folyamatcsoportba, hogy a leállításkor a böngésző is megálljon.
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      });
      child = process_;
      const out = { text: "" };
      const err = { text: "" };
      process_.stdout.on("data", (chunk: Buffer) => collect(chunk, out));
      process_.stderr.on("data", (chunk: Buffer) => collect(chunk, err));
      const finish = (code: number | null, note?: string) => {
        for (const rest of [out.text, err.text]) {
          if (rest !== "") {
            state.lines.push(rest);
          }
        }
        if (note !== undefined) {
          state.lines.push(note);
        }
        state.exitCode = code ?? 1;
        state.finishedAt = new Date().toISOString();
        child = null;
        if (stopped) {
          afterStop();
        }
      };
      process_.on("error", (error) => finish(1, `A művelet nem indult el: ${error.message}`));
      process_.on("close", (code) => {
        if (child === process_) {
          finish(code);
        }
      });
      return view();
    },
    stop() {
      const running = child;
      if (running === null) {
        return;
      }
      stopped = true;
      state.lines.push("A műveletet megszakítottad.");
      if (process.platform === "win32" && running.pid !== undefined) {
        // A böngésző is leáll vele együtt.
        spawn("taskkill", ["/pid", String(running.pid), "/t", "/f"], { windowsHide: true });
      } else if (running.pid !== undefined && process.platform !== "win32") {
        try {
          process.kill(-running.pid, "SIGTERM");
        } catch {
          running.kill("SIGTERM");
        }
      } else {
        running.kill("SIGTERM");
      }
    }
  };
}
