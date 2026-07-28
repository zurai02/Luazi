import * as fs from "fs";
import * as path from "path";

/**
 * Luazi Standard Library - File System Module
 * Provides file system operations for Luazi scripts
 */

export default {
    // =========================================================================
    // FILE READING
    // =========================================================================

    /**
     * Read a text file synchronously
     */
    readFile: (filePath: string): string => {
        try {
            return fs.readFileSync(filePath, "utf8");
        } catch (e: any) {
            throw new Error(`Failed to read file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Alias for readFile
     */
    readFileSync: (filePath: string): string => {
        try {
            return fs.readFileSync(filePath, "utf8");
        } catch (e: any) {
            throw new Error(`Failed to read file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Read a file as raw bytes (Uint8Array)
     */
    readBytes: (filePath: string): Uint8Array => {
        try {
            return fs.readFileSync(filePath);
        } catch (e: any) {
            throw new Error(`Failed to read file as bytes: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Read a file as a Buffer
     */
    readBuffer: (filePath: string): Buffer => {
        try {
            return fs.readFileSync(filePath);
        } catch (e: any) {
            throw new Error(`Failed to read file as buffer: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Read a JSON file and parse it
     */
    readJson: (filePath: string): any => {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            return JSON.parse(content);
        } catch (e: any) {
            throw new Error(`Failed to read JSON file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Read file line by line
     */
    readLines: (filePath: string): string[] => {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            return content.split(/\r?\n/);
        } catch (e: any) {
            throw new Error(`Failed to read lines from: ${filePath} - ${e.message}`);
        }
    },

    // =========================================================================
    // FILE WRITING
    // =========================================================================

    /**
     * Write text to a file synchronously
     */
    writeFile: (filePath: string, data: string): void => {
        try {
            fs.writeFileSync(filePath, data, "utf8");
        } catch (e: any) {
            throw new Error(`Failed to write file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Alias for writeFile
     */
    writeFileSync: (filePath: string, data: string): void => {
        try {
            fs.writeFileSync(filePath, data, "utf8");
        } catch (e: any) {
            throw new Error(`Failed to write file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Write raw bytes to a file
     */
    writeBytes: (filePath: string, data: Uint8Array): void => {
        try {
            fs.writeFileSync(filePath, data);
        } catch (e: any) {
            throw new Error(`Failed to write bytes to file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Write a Buffer to a file
     */
    writeBuffer: (filePath: string, data: Buffer): void => {
        try {
            fs.writeFileSync(filePath, data);
        } catch (e: any) {
            throw new Error(`Failed to write buffer to file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Write an object as JSON to a file
     */
    writeJson: (filePath: string, data: any, indent: number = 2): void => {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, indent), "utf8");
        } catch (e: any) {
            throw new Error(`Failed to write JSON file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Append text to a file
     */
    appendFile: (filePath: string, data: string): void => {
        try {
            fs.appendFileSync(filePath, data, "utf8");
        } catch (e: any) {
            throw new Error(`Failed to append to file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Append bytes to a file
     */
    appendBytes: (filePath: string, data: Uint8Array): void => {
        try {
            fs.appendFileSync(filePath, data);
        } catch (e: any) {
            throw new Error(`Failed to append bytes to file: ${filePath} - ${e.message}`);
        }
    },

    // =========================================================================
    // DIRECTORY OPERATIONS
    // =========================================================================

    /**
     * Create a directory
     */
    mkdir: (dirPath: string, recursive?: boolean): void => {
        try {
            fs.mkdirSync(dirPath, { recursive: recursive ?? false });
        } catch (e: any) {
            throw new Error(`Failed to create directory: ${dirPath} - ${e.message}`);
        }
    },

    /**
     * Alias for mkdir
     */
    mkdirSync: (dirPath: string, recursive?: boolean): void => {
        try {
            fs.mkdirSync(dirPath, { recursive: recursive ?? false });
        } catch (e: any) {
            throw new Error(`Failed to create directory: ${dirPath} - ${e.message}`);
        }
    },

    /**
     * Ensure a directory exists (create if not exists)
     */
    ensureDir: (dirPath: string): void => {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        } catch (e: any) {
            throw new Error(`Failed to ensure directory: ${dirPath} - ${e.message}`);
        }
    },

    /**
     * Remove a directory
     */
    removeDir: (dirPath: string, recursive?: boolean): void => {
        try {
            fs.rmSync(dirPath, { recursive: recursive ?? false, force: true });
        } catch (e: any) {
            throw new Error(`Failed to remove directory: ${dirPath} - ${e.message}`);
        }
    },

    /**
     * Remove a directory and all its contents
     */
    removeDirRecursive: (dirPath: string): void => {
        try {
            fs.rmSync(dirPath, { recursive: true, force: true });
        } catch (e: any) {
            throw new Error(`Failed to remove directory recursively: ${dirPath} - ${e.message}`);
        }
    },

    /**
     * Read directory contents
     */
    readdirSync: (dirPath: string): Array<{ name: string; isDirectory: boolean; isFile: boolean }> => {
        try {
            return fs.readdirSync(dirPath, { withFileTypes: true }).map((dirent) => ({
                name: dirent.name,
                isDirectory: dirent.isDirectory(),
                isFile: dirent.isFile(),
            }));
        } catch (e: any) {
            throw new Error(`Failed to read directory: ${dirPath} - ${e.message}`);
        }
    },

    /**
     * Read directory contents (names only)
     */
    readdir: (dirPath: string): string[] => {
        try {
            return fs.readdirSync(dirPath);
        } catch (e: any) {
            throw new Error(`Failed to read directory: ${dirPath} - ${e.message}`);
        }
    },

    // =========================================================================
    // FILE OPERATIONS
    // =========================================================================

    /**
     * Check if a file or directory exists
     */
    exists: (filePath: string): boolean => {
        return fs.existsSync(filePath);
    },

    /**
     * Check if a path is a file
     */
    isFile: (filePath: string): boolean => {
        try {
            return fs.statSync(filePath).isFile();
        } catch {
            return false;
        }
    },

    /**
     * Check if a path is a directory
     */
    isDirectory: (filePath: string): boolean => {
        try {
            return fs.statSync(filePath).isDirectory();
        } catch {
            return false;
        }
    },

    /**
     * Get file statistics
     */
    stat: (filePath: string): { size: number; mtime: Date; ctime: Date; isDirectory: boolean; isFile: boolean } => {
        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                mtime: stats.mtime,
                ctime: stats.ctime,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
            };
        } catch (e: any) {
            throw new Error(`Failed to stat file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Get file size in bytes
     */
    size: (filePath: string): number => {
        try {
            return fs.statSync(filePath).size;
        } catch (e: any) {
            throw new Error(`Failed to get file size: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Copy a file
     */
    copy: (src: string, dest: string): void => {
        try {
            fs.copyFileSync(src, dest);
        } catch (e: any) {
            throw new Error(`Failed to copy file from ${src} to ${dest} - ${e.message}`);
        }
    },

    /**
     * Copy a file with directory creation
     */
    copyFile: (src: string, dest: string): void => {
        try {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(src, dest);
        } catch (e: any) {
            throw new Error(`Failed to copy file from ${src} to ${dest} - ${e.message}`);
        }
    },

    /**
     * Rename/move a file
     */
    rename: (oldPath: string, newPath: string): void => {
        try {
            fs.renameSync(oldPath, newPath);
        } catch (e: any) {
            throw new Error(`Failed to rename file from ${oldPath} to ${newPath} - ${e.message}`);
        }
    },

    /**
     * Move a file (alias for rename with directory creation)
     */
    move: (src: string, dest: string): void => {
        try {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.renameSync(src, dest);
        } catch (e: any) {
            throw new Error(`Failed to move file from ${src} to ${dest} - ${e.message}`);
        }
    },

    /**
     * Remove/delete a file
     */
    remove: (filePath: string): void => {
        try {
            fs.unlinkSync(filePath);
        } catch (e: any) {
            throw new Error(`Failed to remove file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Delete a file (alias for remove)
     */
    delete: (filePath: string): void => {
        try {
            fs.unlinkSync(filePath);
        } catch (e: any) {
            throw new Error(`Failed to delete file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Create an empty file
     */
    touch: (filePath: string): void => {
        try {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, "");
            } else {
                const now = new Date();
                fs.utimesSync(filePath, now, now);
            }
        } catch (e: any) {
            throw new Error(`Failed to touch file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Create a temporary file
     */
    tempFile: (prefix: string = "tmp", suffix: string = ""): string => {
        const tmpDir = require("os").tmpdir();
        const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`;
        const filePath = path.join(tmpDir, name);
        fs.writeFileSync(filePath, "");
        return filePath;
    },

    /**
     * Create a temporary directory
     */
    tempDir: (prefix: string = "tmp"): string => {
        const tmpDir = require("os").tmpdir();
        const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const dirPath = path.join(tmpDir, name);
        fs.mkdirSync(dirPath, { recursive: true });
        return dirPath;
    },

    // =========================================================================
    // ADVANCED OPERATIONS
    // =========================================================================

    /**
     * Walk a directory recursively and return all file paths
     */
    walk: (dirPath: string): string[] => {
        const results: string[] = [];

        function walkDir(currentPath: string) {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    walkDir(fullPath);
                } else {
                    results.push(fullPath);
                }
            }
        }

        try {
            walkDir(dirPath);
        } catch (e: any) {
            throw new Error(`Failed to walk directory: ${dirPath} - ${e.message}`);
        }
        return results;
    },

    /**
     * Walk a directory recursively and return all paths (files and dirs)
     */
    walkAll: (dirPath: string): string[] => {
        const results: string[] = [];

        function walkDir(currentPath: string) {
            results.push(currentPath);
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    walkDir(fullPath);
                } else {
                    results.push(fullPath);
                }
            }
        }

        try {
            walkDir(dirPath);
        } catch (e: any) {
            throw new Error(`Failed to walk directory: ${dirPath} - ${e.message}`);
        }
        return results;
    },

    /**
     * Find files matching a glob pattern
     */
    glob: (pattern: string, dirPath: string): string[] => {
        const results: string[] = [];

        // Convert glob pattern to regex
        const regex = new RegExp(
            "^" +
            pattern
                .replace(/\/g, "\\")
                .replace(/\.\*/g, "\.")
                .replace(/\*\*\//g, "(?:.*\/)?")
                .replace(/\*/g, "[^\/]*")
                .replace(/\?/g, ".")
                .replace(/\./g, "\.")
            + "$"
        );

        function walk(currentPath: string) {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                const relPath = path.relative(dirPath, fullPath);
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (regex.test(relPath) || regex.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        }

        try {
            if (fs.existsSync(dirPath)) {
                walk(dirPath);
            }
        } catch (e: any) {
            throw new Error(`Failed to glob pattern ${pattern} in ${dirPath} - ${e.message}`);
        }
        return results;
    },

    /**
     * Find files by extension
     */
    findByExt: (dirPath: string, ext: string): string[] => {
        const results: string[] = [];
        const dotExt = ext.startsWith(".") ? ext : `.${ext}`;

        function walk(currentPath: string) {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.name.endsWith(dotExt)) {
                    results.push(fullPath);
                }
            }
        }

        try {
            if (fs.existsSync(dirPath)) {
                walk(dirPath);
            }
        } catch (e: any) {
            throw new Error(`Failed to find files by extension ${ext} in ${dirPath} - ${e.message}`);
        }
        return results;
    },

    /**
     * Copy a directory recursively
     */
    copyDir: (src: string, dest: string): void => {
        try {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }

            const entries = fs.readdirSync(src, { withFileTypes: true });
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                    fs.mkdirSync(destPath, { recursive: true });
                    fs.copyDir(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        } catch (e: any) {
            throw new Error(`Failed to copy directory from ${src} to ${dest} - ${e.message}`);
        }
    },

    /**
     * Empty a directory (remove all contents but keep the directory)
     */
    emptyDir: (dirPath: string): void => {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(fullPath);
                }
            }
        } catch (e: any) {
            throw new Error(`Failed to empty directory: ${dirPath} - ${e.message}`);
        }
    },

    /**
     * Watch a file for changes
     */
    watch: (filePath: string, callback: (event: string, filename: string) => void): { close: () => void } => {
        try {
            const watcher = fs.watch(filePath, callback);
            return {
                close: () => watcher.close(),
            };
        } catch (e: any) {
            throw new Error(`Failed to watch file: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Get file creation time
     */
    created: (filePath: string): Date => {
        try {
            return fs.statSync(filePath).birthtime;
        } catch (e: any) {
            throw new Error(`Failed to get creation time: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Get file modification time
     */
    modified: (filePath: string): Date => {
        try {
            return fs.statSync(filePath).mtime;
        } catch (e: any) {
            throw new Error(`Failed to get modification time: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Check if a file is older than a given age (in milliseconds)
     */
    isOlderThan: (filePath: string, ageMs: number): boolean => {
        try {
            const mtime = fs.statSync(filePath).mtime.getTime();
            return Date.now() - mtime > ageMs;
        } catch (e: any) {
            throw new Error(`Failed to check file age: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Get disk usage information
     */
    diskUsage: (filePath: string): { total: number; free: number; used: number } => {
        try {
            const stats = require("fs").statSync(filePath);
            // Note: This is a simplified version. Real disk usage requires platform-specific code
            return {
                total: 0,
                free: 0,
                used: 0,
            };
        } catch (e: any) {
            throw new Error(`Failed to get disk usage: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Create a symbolic link
     */
    symlink: (target: string, linkPath: string): void => {
        try {
            fs.symlinkSync(target, linkPath);
        } catch (e: any) {
            throw new Error(`Failed to create symlink: ${linkPath} -> ${target} - ${e.message}`);
        }
    },

    /**
     * Read a symbolic link
     */
    readlink: (linkPath: string): string => {
        try {
            return fs.readlinkSync(linkPath);
        } catch (e: any) {
            throw new Error(`Failed to read symlink: ${linkPath} - ${e.message}`);
        }
    },

    /**
     * Change file permissions
     */
    chmod: (filePath: string, mode: number): void => {
        try {
            fs.chmodSync(filePath, mode);
        } catch (e: any) {
            throw new Error(`Failed to chmod: ${filePath} - ${e.message}`);
        }
    },

    /**
     * Get file permissions
     */
    getMode: (filePath: string): number => {
        try {
            return fs.statSync(filePath).mode;
        } catch (e: any) {
            throw new Error(`Failed to get mode: ${filePath} - ${e.message}`);
        }
    },
};
