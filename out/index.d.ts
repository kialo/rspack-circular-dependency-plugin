export = RspackCircularDependencyPlugin;
declare class RspackCircularDependencyPlugin {
    /**
     * @param {Options} options
     */
    constructor(options?: Options);
    /** @type {FullOptions} */
    options: FullOptions;
    /**
     * @param {import('@rspack/core').Compiler} compiler
     */
    apply(compiler: import('@rspack/core').Compiler): void;
    /**
     *
     * @param {string} initialModule
     * @param {string} currentModule
     * @param {ModuleMap} modulesById
     * @param {Record<string, boolean>} seenModules
     * @returns {string[] | undefined}
     */
    isCyclic(initialModule: string, currentModule: string, modulesById: ModuleMap, seenModules?: Record<string, boolean>): string[] | undefined;
}
declare namespace RspackCircularDependencyPlugin {
    export { ModuleMap, Options, FullOptions };
}
type FullOptions = Required<Omit<Options, 'onStart' | 'onEnd' | 'onDetected'>> & Pick<Options, 'onStart' | 'onEnd' | 'onDetected'>;
type ModuleMap = Record<string, import('@rspack/core').StatsModule>;
type Options = {
    exclude?: RegExp | undefined;
    include?: RegExp | undefined;
    failOnError?: boolean | undefined;
    allowAsyncCycles?: boolean | undefined;
    onStart?: ((x: {
        compilation: import('@rspack/core').Compilation;
    }) => void) | undefined;
    onDetected?: ((x: {
        paths: string[];
        compilation: import('@rspack/core').Compilation;
    }) => void) | undefined;
    onEnd?: ((x: {
        compilation: import('@rspack/core').Compilation;
    }) => void) | undefined;
};
