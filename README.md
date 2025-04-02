# This repository is no longer developed
rspack has its own version of this plugin since v1.3.0, see [here](https://rspack.dev/plugins/rspack/circular-dependency-rspack-plugin).

# Circular Dependency Plugin

Note that this is a rudimentary re-implementation of `circular-dependency-plugin` to fulfill our needs at Kialo.
It is not intended to support all configuration options (namely `cwd` is not implemented) and is not tested on other people's code.

## The Plugin

Detect modules with circular dependencies when bundling with rspack.

Circular dependencies are often a necessity in complex software, the presence of a circular dependency doesn't always imply a bug, but in the case where you believe a bug exists, this module may help find it.

### Basic Usage

```js
// rspack.config.js
const RspackCircularDependencyPlugin = require("rspack-circular-dependency-plugin");

module.exports = {
    entry: "./src/index",
    plugins: [
        new RspackCircularDependencyPlugin({
            // exclude detection of files based on a RegExp
            exclude: /a\.js|node_modules/,
            // include specific files based on a RegExp
            include: /dir/,
            // add errors to rspack instead of warnings
            failOnError: true,
            // allow import cycles that include an asyncronous import,
            // e.g. via import(/* webpackChunkName: "dashboard" */ './file.js')
            allowAsyncCycles: false,
        }),
    ],
};
```

### Advanced Usage

```js
// rspack.config.js
const RspackCircularDependencyPlugin = require("rspack-circular-dependency-plugin");

module.exports = {
    entry: "./src/index",
    plugins: [
        new RspackCircularDependencyPlugin({
            // `onStart` is called before the cycle detection starts
            onStart({ compilation }) {
                console.log("start detecting rspack modules cycles");
            },
            // `onDetected` is called for each module that is cyclical
            onDetected({ paths, compilation }) {
                // `paths` will be an Array of the relative module paths that make up the cycle
                compilation.errors.push(new Error(paths.join(" -> ")));
            },
            // `onEnd` is called before the cycle detection ends
            onEnd({ compilation }) {
                console.log("end detecting rspack modules cycles");
            },
        }),
    ],
};
```

If you have some number of cycles and want to fail if any new ones are
introduced, you can use the life cycle methods to count and fail when the
count is exceeded. (Note if you care about detecting a cycle being replaced by
another, this won't catch that.)

```js
// rspack.config.js
const RspackCircularDependencyPlugin = require("rspack-circular-dependency-plugin");

const MAX_CYCLES = 5;
let numCyclesDetected = 0;

module.exports = {
    entry: "./src/index",
    plugins: [
        new RspackCircularDependencyPlugin({
            onStart({ compilation }) {
                numCyclesDetected = 0;
            },
            onDetected({ paths, compilation }) {
                numCyclesDetected++;
                compilation.warnings.push(new Error(paths.join(" -> ")));
            },
            onEnd({ compilation }) {
                if (numCyclesDetected > MAX_CYCLES) {
                    compilation.errors.push(
                        new Error(
                            `Detected ${numCyclesDetected} cycles which exceeds configured limit of ${MAX_CYCLES}`,
                        ),
                    );
                }
            },
        }),
    ],
};
```
