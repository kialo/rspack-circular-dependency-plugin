"use strict";

/**
 * @typedef {Record<string, import('@rspack/core').StatsModule>} ModuleMap
 * @typedef {{
 *      exclude?: RegExp;
 *      include?: RegExp;
 *      failOnError?: boolean;
 *      allowAsyncCycles?: boolean;
 *      onStart?: (x: { compilation: import('@rspack/core').Compilation }) => void;
 *      onDetected?: (x: { paths: string[]; compilation: import('@rspack/core').Compilation; }) => void;
 *      onEnd?: (x: { compilation: import('@rspack/core').Compilation }) => void;
 * }} Options
 * @typedef {Required<Omit<Options, 'onStart' | 'onEnd' | 'onDetected'>> & Pick<Options, 'onStart' | 'onEnd' | 'onDetected'>} FullOptions
 */

const BASE_ERROR = "Circular dependency detected:\r\n";
const PluginTitle = "RspackCircularDependencyPlugin";

/**
 * @param {string} path
 */
const normalizePath = (path) => path.replace(/^\.\//, "");

class RspackCircularDependencyPlugin {
    /**
     * @param {Options} options
     */
    constructor(options = {}) {
        /** @type {FullOptions} */
        this.options = {
            exclude: options.exclude ?? /$^/,
            include: options.include ?? /.*/,
            failOnError: options.failOnError ?? false,
            allowAsyncCycles: options.allowAsyncCycles ?? false,
            onStart: options.onStart,
            onDetected: options.onDetected,
            onEnd: options.onEnd,
        };
    }

    /**
     * @param {import('@rspack/core').Compiler} compiler
     */
    apply(compiler) {
        compiler.hooks.afterCompile.tap(PluginTitle, (compilation) => {
            this.options.onStart?.({ compilation });
            const stats = compilation.getStats().toJson();

            /** @type {ModuleMap} */
            const modulesById = Object.fromEntries(
                (stats.modules ?? [])
                    .filter(
                        (module) =>
                            !module.orphan &&
                            !!module.id &&
                            module.name.match(this.options.include) &&
                            !module.name.match(this.options.exclude),
                    )
                    .map((module) => [module.id, module]),
            );

            for (const module of Object.keys(modulesById)) {
                const maybeCyclicalPathsList = this.isCyclic(module, module, modulesById);

                if (maybeCyclicalPathsList) {
                    if (this.options.onDetected) {
                        try {
                            this.options.onDetected({
                                paths: maybeCyclicalPathsList,
                                compilation,
                            });
                        } catch (/** @type {any} **/ err) {
                            compilation.errors.push(err);
                        }
                    } else {
                        // mark warnings or errors on rspack compilation
                        const error = new Error(BASE_ERROR.concat(maybeCyclicalPathsList.join(" -> ")));
                        if (this.options.failOnError) {
                            compilation.errors.push(error);
                        } else {
                            compilation.warnings.push(error);
                        }
                    }
                }
            }

            this.options.onEnd?.({ compilation });
        });
    }

    /**
     *
     * @param {string} initialModule
     * @param {string} currentModule
     * @param {ModuleMap} modulesById
     * @param {Record<string, boolean>} seenModules
     * @returns {string[] | undefined}
     */
    isCyclic(initialModule, currentModule, modulesById, seenModules = {}) {
        // Add the current module to the seen modules cache
        seenModules[currentModule] = true;

        // Iterate over the current modules dependencies
        for (const reason of modulesById[currentModule].reasons ?? []) {
            const reasonModule = reason.moduleId ? modulesById[reason.moduleId] : undefined;

            if (!reasonModule?.id) {
                continue;
            }

            if (this.options.allowAsyncCycles && reason.type === "dynamic import") {
                continue;
            }

            if (reasonModule.id in seenModules) {
                if (reasonModule.id === initialModule) {
                    // Initial module has a circular dependency
                    return [normalizePath(reasonModule.id), normalizePath(currentModule)];
                }
                // Found a cycle, but not for this module
                continue;
            }

            const maybeCyclicalPathsList = this.isCyclic(initialModule, reasonModule.id, modulesById, seenModules);

            if (maybeCyclicalPathsList) {
                return [...maybeCyclicalPathsList, normalizePath(currentModule)];
            }
        }
    }
}

module.exports = RspackCircularDependencyPlugin;
