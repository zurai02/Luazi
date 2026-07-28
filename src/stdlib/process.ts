import { execSync, exec, spawnSync } from "child_process";

/**
 * Luazi Standard Library - Process Module
 * Provides process and system utilities for Luazi scripts
 */

export default {
    // =========================================================================
    // ARGUMENTS & ENVIRONMENT
    // =========================================================================

    /**
     * Command line arguments passed to the script
     */
    argv: process.argv.slice(2),

    /**
     * All command line arguments including node path and script path
     */
    argvFull: process.argv,

    /**
     * Exit the process with a code
     */
    exit: (code: number = 0): never => {
        process.exit(code);
    },

    /**
     * Get an environment variable
     */
    env: (key: string): string | undefined => {
        return process.env[key];
    },

    /**
     * Get all environment variables
     */
    envAll: (): Record<string, string | undefined> => {
        return { ...process.env };
    },

    /**
     * Set an environment variable
     */
    setEnv: (key: string, value: string): void => {
        process.env[key] = value;
    },

    /**
     * Remove an environment variable
     */
    unsetEnv: (key: string): void => {
        delete process.env[key];
    },

    /**
     * Check if an environment variable exists
     */
    hasEnv: (key: string): boolean => {
        return key in process.env;
    },

    // =========================================================================
    // PROCESS INFO
    // =========================================================================

    /**
     * Get the current working directory
     */
    cwd: (): string => {
        return process.cwd();
    },

    /**
     * Change the current working directory
     */
    chdir: (dir: string): void => {
        process.chdir(dir);
    },

    /**
     * Get the process ID
     */
    pid: (): number => {
        return process.pid;
    },

    /**
     * Get the parent process ID
     */
    ppid: (): number => {
        return process.ppid;
    },

    /**
     * Get the Node.js version
     */
    version: (): string => {
        return process.version;
    },

    /**
     * Get the process title
     */
    title: (): string => {
        return process.title;
    },

    /**
     * Set the process title
     */
    setTitle: (title: string): void => {
        process.title = title;
    },

    /**
     * Get process uptime in seconds
     */
    uptime: (): number => {
        return process.uptime();
    },

    /**
     * Get memory usage statistics
     */
    memoryUsage: (): { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number } => {
        return process.memoryUsage();
    },

    /**
     * Get CPU usage statistics
     */
    cpuUsage: (): { user: number; system: number } => {
        return process.cpuUsage();
    },

    /**
     * Get resource usage
     */
    resourceUsage: (): Record<string, number> => {
        return process.resourceUsage() || {};
    },

    // =========================================================================
    // SYSTEM INFO
    // =========================================================================

    /**
     * Get the operating system platform
     */
    platform: (): string => {
        return process.platform;
    },

    /**
     * Get the CPU architecture
     */
    arch: (): string => {
        return process.arch;
    },

    /**
     * Check if running on Windows
     */
    isWindows: (): boolean => {
        return process.platform === "win32";
    },

    /**
     * Check if running on macOS
     */
    isMac: (): boolean => {
        return process.platform === "darwin";
    },

    /**
     * Check if running on Linux
     */
    isLinux: (): boolean => {
        return process.platform === "linux";
    },

    /**
     * Get the number of CPU cores
     */
    cpus: (): number => {
        return require("os").cpus().length;
    },

    /**
     * Get total system memory in bytes
     */
    totalMemory: (): number => {
        return require("os").totalmem();
    },

    /**
     * Get free system memory in bytes
     */
    freeMemory: (): number => {
        return require("os").freemem();
    },

    /**
     * Get load average
     */
    loadAvg: (): number[] => {
        return require("os").loadavg();
    },

    /**
     * Get hostname
     */
    hostname: (): string => {
        return require("os").hostname();
    },

    /**
     * Get user info
     */
    userInfo: (): { username: string; uid: number; gid: number; shell: string; homedir: string } => {
        return require("os").userInfo();
    },

    // =========================================================================
    // COMMAND EXECUTION
    // =========================================================================

    /**
     * Execute a shell command synchronously
     */
    exec: (command: string): { code: number; stdout: string; stderr: string } => {
        try {
            const stdout = execSync(command, { encoding: "utf8", maxBuffer: 1024 * 1024 * 100 });
            return { code: 0, stdout, stderr: "" };
        } catch (error: any) {
            return {
                code: error.status || 1,
                stdout: error.stdout?.toString() || "",
                stderr: error.stderr?.toString() || "",
            };
        }
    },

    /**
     * Execute a shell command asynchronously
     */
    execAsync: (command: string): Promise<{ code: number; stdout: string; stderr: string }> => {
        return new Promise((resolve) => {
            exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error: any, stdout: string, stderr: string) => {
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

    /**
     * Execute a command with a timeout
     */
    execTimeout: (command: string, timeoutMs: number): { code: number; stdout: string; stderr: string } => {
        try {
            const stdout = execSync(command, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 * 100 });
            return { code: 0, stdout, stderr: "" };
        } catch (error: any) {
            return {
                code: error.status || 1,
                stdout: error.stdout?.toString() || "",
                stderr: error.stderr?.toString() || "",
            };
        }
    },

    /**
     * Spawn a process synchronously
     */
    spawn: (command: string, args: string[]): { stdout: string; stderr: string; code: number } => {
        const result = spawnSync(command, args, { encoding: "utf8" });
        return {
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            code: result.status || 0,
        };
    },

    /**
     * Spawn a process with options
     */
    spawnWithOptions: (command: string, args: string[], options: { cwd?: string; env?: Record<string, string>; timeout?: number }): { stdout: string; stderr: string; code: number } => {
        const result = spawnSync(command, args, {
            encoding: "utf8",
            cwd: options.cwd,
            env: options.env,
            timeout: options.timeout,
        });
        return {
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            code: result.status || 0,
        };
    },

    /**
     * Run a command and return only stdout
     */
    run: (command: string): string => {
        try {
            return execSync(command, { encoding: "utf8", maxBuffer: 1024 * 1024 * 100 });
        } catch (error: any) {
            throw new Error(`Command failed: ${command} - ${error.message}`);
        }
    },

    /**
     * Run a command and return only stdout (trimmed)
     */
    runTrim: (command: string): string => {
        try {
            return execSync(command, { encoding: "utf8", maxBuffer: 1024 * 1024 * 100 }).trim();
        } catch (error: any) {
            throw new Error(`Command failed: ${command} - ${error.message}`);
        }
    },

    /**
     * Check if a command exists in PATH
     */
    which: (command: string): string | undefined => {
        try {
            const result = execSync(`which ${command}`, { encoding: "utf8" }).trim();
            return result;
        } catch {
            return undefined;
        }
    },

    /**
     * Check if a command is available
     */
    hasCommand: (command: string): boolean => {
        try {
            execSync(`which ${command}`, { encoding: "utf8" });
            return true;
        } catch {
            return false;
        }
    },

    // =========================================================================
    // SIGNALS & EVENTS
    // =========================================================================

    /**
     * Register a handler for process signals
     */
    onSignal: (signal: string, handler: () => void): void => {
        process.on(signal, handler);
    },

    /**
     * Remove a signal handler
     */
    offSignal: (signal: string, handler: () => void): void => {
        process.off(signal, handler);
    },

    /**
     * Register exit handler
     */
    onExit: (handler: (code: number) => void): void => {
        process.on("exit", handler);
    },

    /**
     * Register uncaught exception handler
     */
    onError: (handler: (error: Error) => void): void => {
        process.on("uncaughtException", handler);
    },

    /**
     * Register unhandled rejection handler
     */
    onRejection: (handler: (reason: any, promise: Promise<any>) => void): void => {
        process.on("unhandledRejection", handler);
    },

    // =========================================================================
    // STREAMS
    // =========================================================================

    /**
     * Write to stdout
     */
    stdout: (data: string): void => {
        process.stdout.write(data);
    },

    /**
     * Write to stderr
     */
    stderr: (data: string): void => {
        process.stderr.write(data);
    },

    /**
     * Read from stdin (synchronous)
     */
    stdin: (): string => {
        const chunks: Buffer[] = [];
        let chunk: Buffer;
        while ((chunk = process.stdin.read()) !== null) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks).toString("utf8");
    },

    // =========================================================================
    // TIMERS
    // =========================================================================

    /**
     * Sleep for a specified number of milliseconds
     */
    sleep: (ms: number): Promise<void> => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Sleep synchronously (blocks thread)
     */
    sleepSync: (ms: number): void => {
        const start = Date.now();
        while (Date.now() - start < ms) {
            // Busy wait
        }
    },

    /**
     * Get current timestamp in milliseconds
     */
    now: (): number => {
        return Date.now();
    },

    /**
     * Get high-resolution time
     */
    hrtime: (): [number, number] => {
        return process.hrtime();
    },

    /**
     * Measure elapsed time
     */
    measureTime: (fn: () => void): number => {
        const start = process.hrtime.bigint();
        fn();
        const end = process.hrtime.bigint();
        return Number(end - start) / 1e6; // milliseconds
    },

    // =========================================================================
    // UTILITIES
    // =========================================================================

    /**
     * Open a URL in the default browser
     */
    open: (url: string): void => {
        const { exec } = require("child_process");
        const command = process.platform === "win32" ? `start "" "${url}"` :
                        process.platform === "darwin" ? `open "${url}"` :
                        `xdg-open "${url}"`;
        exec(command);
    },

    /**
     * Play a beep sound
     */
    beep: (): void => {
        process.stdout.write("\x07");
    },

    /**
     * Get next tick (microtask)
     */
    nextTick: (fn: () => void): void => {
        process.nextTick(fn);
    },

    /**
     * Force garbage collection (if enabled)
     */
    gc: (): void => {
        if (global.gc) {
            global.gc();
        }
    },
};
