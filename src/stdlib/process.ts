export default {
    argv: process.argv.slice(2),
    exit: (code: number = 0): never => {
        process.exit(code);
    },
    env: (key: string): string | undefined => {
        return process.env[key];
    },
    cwd: (): string => {
        return process.cwd();
    },
    pid: (): number => {
        return process.pid;
    },
    exec: (command: string): { code: number; stdout: string; stderr: string } => {
        const { execSync } = require("child_process");
        try {
            const stdout = execSync(command, { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });
            return { code: 0, stdout, stderr: "" };
        } catch (error: any) {
            return {
                code: error.status || 1,
                stdout: error.stdout?.toString() || "",
                stderr: error.stderr?.toString() || "",
            };
        }
    },
    execAsync: (command: string): Promise<{ code: number; stdout: string; stderr: string }> => {
        return new Promise((resolve) => {
            const { exec } = require("child_process");
            exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    resolve({
                        code: error.code || 1,
                        stdout: stdout || "",
                        stderr: stderr || "",
                    });
                } else {
                    resolve({ code: 0, stdout, stderr });
                }
            });
        });
    },
    spawn: (command: string, args: string[]): { stdout: string; stderr: string; code: number } => {
        const { spawnSync } = require("child_process");
        const result = spawnSync(command, args, { encoding: "utf8" });
        return {
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            code: result.status || 0,
        };
    },
    platform: (): string => {
        return process.platform;
    },
    arch: (): string => {
        return process.arch;
    },
    version: (): string => {
        return process.version;
    },
    uptime: (): number => {
        return process.uptime();
    },
    memoryUsage: (): { rss: number; heapTotal: number; heapUsed: number; external: number } => {
        return process.memoryUsage();
    },
};
