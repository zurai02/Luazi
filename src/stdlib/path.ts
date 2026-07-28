import * as path from "path";

/**
 * Luazi Standard Library - Path Module
 * Provides path manipulation utilities for Luazi scripts
 */

export default {
    // =========================================================================
    // PATH CONSTRUCTION
    // =========================================================================

    /**
     * Join multiple path segments together
     */
    join: (...paths: string[]): string => {
        return path.join(...paths);
    },

    /**
     * Resolve a path to an absolute path
     */
    resolve: (...paths: string[]): string => {
        return path.resolve(...paths);
    },

    /**
     * Get the directory name of a path
     */
    dirname: (filePath: string): string => {
        return path.dirname(filePath);
    },

    /**
     * Get the base name of a path (filename with extension)
     */
    basename: (filePath: string, ext?: string): string => {
        if (ext) {
            return path.basename(filePath, ext);
        }
        return path.basename(filePath);
    },

    /**
     * Get the file extension
     */
    extname: (filePath: string): string => {
        return path.extname(filePath);
    },

    /**
     * Get the relative path from one path to another
     */
    relative: (from: string, to: string): string => {
        return path.relative(from, to);
    },

    /**
     * Check if a path is absolute
     */
    isAbsolute: (filePath: string): boolean => {
        return path.isAbsolute(filePath);
    },

    /**
     * Normalize a path (resolve . and .. segments)
     */
    normalize: (filePath: string): string => {
        return path.normalize(filePath);
    },

    // =========================================================================
    // PATH INFORMATION
    // =========================================================================

    /**
     * Get the OS-specific path separator
     */
    sep: (): string => {
        return path.sep;
    },

    /**
     * Get the OS-specific path delimiter
     */
    delimiter: (): string => {
        return path.delimiter;
    },

    /**
     * Parse a path into its components
     */
    parse: (filePath: string): { root: string; dir: string; base: string; ext: string; name: string } => {
        return path.parse(filePath);
    },

    /**
     * Build a path from components
     */
    format: (pathObject: { root?: string; dir?: string; base?: string; ext?: string; name?: string }): string => {
        return path.format(pathObject as any);
    },

    // =========================================================================
    // PATH UTILITIES
    // =========================================================================

    /**
     * Get the file name without extension
     */
    name: (filePath: string): string => {
        return path.basename(filePath, path.extname(filePath));
    },

    /**
     * Change the extension of a path
     */
    changeExt: (filePath: string, newExt: string): string => {
        const dir = path.dirname(filePath);
        const name = path.basename(filePath, path.extname(filePath));
        const ext = newExt.startsWith(".") ? newExt : `.${newExt}`;
        return path.join(dir, name + ext);
    },

    /**
     * Add a suffix to the filename before the extension
     */
    addSuffix: (filePath: string, suffix: string): string => {
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const name = path.basename(filePath, ext);
        return path.join(dir, name + suffix + ext);
    },

    /**
     * Check if a path has a specific extension
     */
    hasExt: (filePath: string, ext: string): boolean => {
        const fileExt = path.extname(filePath).toLowerCase();
        const checkExt = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
        return fileExt === checkExt;
    },

    /**
     * Check if a path is a child of another path
     */
    isChildOf: (childPath: string, parentPath: string): boolean => {
        const relative = path.relative(parentPath, childPath);
        return !relative.startsWith("..") && relative !== "";
    },

    /**
     * Get the common prefix of multiple paths
     */
    commonPrefix: (...paths: string[]): string => {
        if (paths.length === 0) return "";
        if (paths.length === 1) return path.dirname(paths[0]);

        const parts = paths.map(p => p.split(path.sep));
        const first = parts[0];
        let common = "";

        for (let i = 0; i < first.length; i++) {
            const segment = first[i];
            if (parts.every(p => p[i] === segment)) {
                common = path.join(common, segment);
            } else {
                break;
            }
        }

        return common;
    },

    /**
     * Convert a path to use forward slashes (useful for URLs)
     */
    toForwardSlashes: (filePath: string): string => {
        return filePath.replace(/\\/g, "/");
    },

    /**
     * Convert a path to use backslashes (Windows style)
     */
    toBackslashes: (filePath: string): string => {
        return filePath.replace(/\//g, "\\");
    },

    /**
     * Get the parent directory
     */
    parent: (filePath: string): string => {
        return path.dirname(filePath);
    },

    /**
     * Get the depth of a path (number of directories)
     */
    depth: (filePath: string): number => {
        return path.normalize(filePath).split(path.sep).filter(s => s !== "").length;
    },

    /**
     * Check if a path is the root directory
     */
    isRoot: (filePath: string): boolean => {
        const normalized = path.normalize(filePath);
        return normalized === "/" || /^[a-zA-Z]:[\\/]$/.test(normalized);
    },

    /**
     * Get the home directory
     */
    home: (): string => {
        return require("os").homedir();
    },

    /**
     * Get the current working directory
     */
    cwd: (): string => {
        return process.cwd();
    },

    /**
     * Get the temporary directory
     */
    tmpdir: (): string => {
        return require("os").tmpdir();
    },

    /**
     * Create a unique temporary path
     */
    tempPath: (prefix: string = "tmp", suffix: string = ""): string => {
        const tmpDir = require("os").tmpdir();
        const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`;
        return path.join(tmpDir, name);
    },

    /**
     * Sanitize a filename (remove invalid characters)
     */
    sanitize: (fileName: string): string => {
        return fileName.replace(/[<>:"/\\|?*]/g, "_").trim();
    },

    /**
     * Truncate a path if it's too long
     */
    truncate: (filePath: string, maxLength: number = 60): string => {
        if (filePath.length <= maxLength) return filePath;
        const parts = filePath.split(path.sep);
        if (parts.length <= 2) return filePath;
        return path.join(parts[0], "...", parts[parts.length - 1]);
    },

    /**
     * Match a path against a glob pattern
     */
    matches: (filePath: string, pattern: string): boolean => {
        const regex = new RegExp(
            "^" + pattern
                .replace(/\.\*/g, "\.")
                .replace(/\*\*/g, ".*")
                .replace(/\*/g, "[^\/]*")
                .replace(/\?/g, ".")
                .replace(/\./g, "\.")
            + "$"
        );
        return regex.test(filePath);
    },

    /**
     * Get all extensions from a path (e.g., .tar.gz)
     */
    allExts: (filePath: string): string[] => {
        const base = path.basename(filePath);
        const parts = base.split(".");
        if (parts.length <= 1) return [];
        return parts.slice(1).map((_, i) => "." + parts.slice(i + 1).join("."));
    },
};
