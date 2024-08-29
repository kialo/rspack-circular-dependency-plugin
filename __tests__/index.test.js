const path = require("path");
const MemoryFS = require("memory-fs");
const CircularDependencyPlugin = require("../index");
const webpack = require("@rspack/core");

const wrapRun = (run) => {
    return () =>
        new Promise((resolve, reject) => {
            run((err, result) => {
                if (err) {
                    return reject(err);
                }
                return resolve(result.toJson());
            });
        });
};

const getWarningMessage = (stats, index) => {
    return getStatsMessage(stats, index, "warnings");
};

const getErrorsMessage = (stats, index) => {
    return getStatsMessage(stats, index, "errors");
};

const getStatsMessage = (stats, index, type) => {
    if (stats[type][index] == null) {
        return null;
    } else if (stats[type][index].message) {
        // handle webpack 5
        return stats[type][index].message;
    } else {
        throw new Error("Unknown stats format");
    }
};

describe("RspackCircularDependencyPlugin", () => {
    let fs;

    beforeEach(() => {
        fs = new MemoryFS();
    });

    it("detects circular dependencies from a -> b -> c -> b", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/a.js"),
            output: { path: "/tmp" },
            plugins: [new CircularDependencyPlugin()],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg0 = getWarningMessage(stats, 0);
        const msg1 = getWarningMessage(stats, 1);
        expect(msg0).toContain("__tests__/deps/b.js -> __tests__/deps/c.js -> __tests__/deps/b.js");
        expect(msg0).toMatch(/Circular/);
        expect(msg1).toMatch(/b\.js/);
        expect(msg1).toMatch(/c\.js/);
    });

    it("detects circular dependencies from d -> e -> f -> g -> e", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/d.js"),
            output: { path: "/tmp" },
            plugins: [new CircularDependencyPlugin()],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg0 = getWarningMessage(stats, 0);
        const msg1 = getWarningMessage(stats, 1);
        expect(msg0).toContain(
            "__tests__/deps/e.js -> __tests__/deps/f.js -> __tests__/deps/g.js -> __tests__/deps/e.js",
        );
        expect(msg0).toMatch(/Circular/);
        expect(msg1).toMatch(/e\.js/);
        expect(msg1).toMatch(/f\.js/);
        expect(msg1).toMatch(/g\.js/);
    });

    it("uses errors instead of warnings with failOnError", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/d.js"),
            output: { path: "/tmp" },
            plugins: [
                new CircularDependencyPlugin({
                    failOnError: true,
                }),
            ],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const err0 = getErrorsMessage(stats, 0);
        const err1 = getErrorsMessage(stats, 1);
        expect(err0).toContain(
            "__tests__/deps/e.js -> __tests__/deps/f.js -> __tests__/deps/g.js -> __tests__/deps/e.js",
        );
        expect(err0).toMatch(/Circular/);
        expect(err1).toMatch(/e\.js/);
        expect(err1).toMatch(/f\.js/);
        expect(err1).toMatch(/g\.js/);
    });

    it("can exclude cyclical deps from being output", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/d.js"),
            output: { path: "/tmp" },
            plugins: [
                new CircularDependencyPlugin({
                    exclude: /f\.js/,
                }),
            ],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        expect(stats.warnings).toHaveLength(0);
    });

    it("can include only specific cyclical deps in the output", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/d.js"),
            output: { path: "/tmp" },
            plugins: [
                new CircularDependencyPlugin({
                    include: /f\.js/,
                }),
            ],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();
        stats.warnings.forEach((warning) => {
            const msg = typeof warning == "string" ? warning : warning.message;
            const firstFile = msg.match(/\w+\.js/)[0];
            expect(firstFile).toMatch(/f\.js/);
        });
    });

    it(`can handle context modules that have an undefined resource h -> i -> a -> i`, async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/h.js"),
            output: { path: "/tmp" },
            plugins: [new CircularDependencyPlugin()],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();
        expect(stats.warnings.length).toEqual(0);
        expect(stats.errors.length).toEqual(0);
    });

    it("allows hooking into detection cycle", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/nocycle.js"),
            output: { path: "/tmp" },
            plugins: [
                new CircularDependencyPlugin({
                    onStart({ compilation }) {
                        compilation.warnings.push(new Error("started"));
                    },
                    onEnd({ compilation }) {
                        compilation.errors.push(new Error("ended"));
                    },
                }),
            ],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        expect(stats.warnings).toHaveLength(1);
        expect(stats.warnings[0].message).toMatch(/started/);

        expect(stats.errors).toHaveLength(1);
        expect(stats.errors[0].message).toMatch(/ended/);
    });

    it("allows overriding all behavior with onDetected", async () => {
        let cyclesPaths;

        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/d.js"),
            output: { path: "/tmp" },
            plugins: [
                new CircularDependencyPlugin({
                    onDetected({ paths }) {
                        cyclesPaths = paths;
                    },
                }),
            ],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        await runAsync();
        expect(cyclesPaths).toEqual([
            "__tests__/deps/g.js",
            "__tests__/deps/e.js",
            "__tests__/deps/f.js",
            "__tests__/deps/g.js",
        ]);
    });

    it("detects circular dependencies from d -> e -> f -> g -> e", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/d.js"),
            output: { path: "/tmp" },
            plugins: [
                new CircularDependencyPlugin({
                    onDetected({ paths, compilation }) {
                        compilation.warnings.push(paths.join(" -> "));
                    },
                }),
            ],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg0 = getWarningMessage(stats, 0);
        const msg1 = getWarningMessage(stats, 1);
        expect(msg0).toContain(
            "__tests__/deps/e.js -> __tests__/deps/f.js -> __tests__/deps/g.js -> __tests__/deps/e.js",
        );
        expect(msg1).toMatch(/e\.js/);
        expect(msg1).toMatch(/f\.js/);
        expect(msg1).toMatch(/g\.js/);
    });

    it("can detect circular dependencies when module concatenation is not used", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/module-concat-plugin-compat/index.js"),
            optimization: {
                concatenateModules: false,
            },
            output: { path: "/tmp" },
            plugins: [new CircularDependencyPlugin()],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        const msg0 = getWarningMessage(stats, 0);
        const msg1 = getWarningMessage(stats, 1);
        expect(msg0).toContain(
            "__tests__/deps/module-concat-plugin-compat/a.js -> __tests__/deps/module-concat-plugin-compat/b.js -> __tests__/deps/module-concat-plugin-compat/a.js",
        );
        expect(msg1).toContain(
            "__tests__/deps/module-concat-plugin-compat/b.js -> __tests__/deps/module-concat-plugin-compat/a.js -> __tests__/deps/module-concat-plugin-compat/b.js",
        );
    });

    it("does not detect circular dependencies in concatenated modules", async () => {
        const compiler = webpack({
            mode: "development",
            entry: path.join(__dirname, "deps/module-concat-plugin-compat/index.js"),
            optimization: {
                concatenateModules: true,
            },
            output: { path: "/tmp" },
            plugins: [new CircularDependencyPlugin()],
        });
        compiler.outputFileSystem = fs;

        const runAsync = wrapRun(compiler.run.bind(compiler));
        const stats = await runAsync();

        expect(stats.warnings).toHaveLength(0);
        expect(stats.errors).toHaveLength(0);
    });

    describe("ignores self referencing webpack internal dependencies", () => {
        it("ignores this references", async () => {
            const compiler = webpack({
                mode: "development",
                entry: path.join(__dirname, "deps", "self-referencing", "uses-this.js"),
                output: { path: "/tmp" },
                plugins: [new CircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.errors.length).toEqual(0);
            expect(stats.warnings.length).toEqual(0);
        });

        it("ignores module.exports references", async () => {
            const compiler = webpack({
                mode: "development",
                entry: path.join(__dirname, "deps", "self-referencing", "uses-exports.js"),
                output: { path: "/tmp" },
                plugins: [new CircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.errors.length).toEqual(0);
            expect(stats.warnings.length).toEqual(0);
        });

        it("ignores self references", async () => {
            const compiler = webpack({
                mode: "development",
                entry: path.join(__dirname, "deps", "self-referencing", "imports-self.js"),
                output: { path: "/tmp" },
                plugins: [new CircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.warnings.length).toEqual(0);
            expect(stats.errors.length).toEqual(0);
        });

        it("works with typescript", async () => {
            const compiler = webpack({
                mode: "development",
                entry: path.join(__dirname, "deps", "ts", "a.tsx"),
                output: { path: "/tmp" },
                resolve: {
                    tsConfig: path.resolve(path.join(__dirname, "deps", "ts", "tsconfig.json")),
                },
                module: {
                    rules: [{ test: /\.tsx?$/, use: "builtin:swc-loader", exclude: /node_modules/ }],
                },
                plugins: [new CircularDependencyPlugin()],
            });
            compiler.outputFileSystem = fs;

            const runAsync = wrapRun(compiler.run.bind(compiler));
            const stats = await runAsync();

            expect(stats.errors.length).toEqual(0);
            expect(stats.warnings.length).toEqual(0);
        });
    });
});
