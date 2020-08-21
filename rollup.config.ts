import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import sourceMaps from 'rollup-plugin-sourcemaps';
import globals from 'rollup-plugin-node-globals';
import camelCase from 'lodash/camelCase';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import pkg from './package.json';

const libraryName = 'TSUrlFilter';

const contentScriptFilename = 'TSUrlFilterContentScript';
const contentScriptConfig = {
    input: 'src/content-script/index.ts',
    output: [
        {
            file: `dist/${contentScriptFilename}.js`,
            name: libraryName,
            format: 'iife',
            sourcemap: true,
        },
    ],
    watch: {
        include: 'src/**',
    },
    plugins: [
        typescript(),
        commonjs(),
        resolve(),
        sourceMaps(),
    ],
};

export default [
    contentScriptConfig,
    {
        input: 'src/index.ts',
        output: [
            {
                file: pkg.main,
                name: camelCase(libraryName),
                format: 'umd',
                sourcemap: true,
            },
            {
                file: pkg.module,
                format: 'esm',
                sourcemap: true,
            },
            {
                file: pkg.iife,
                name: libraryName,
                format: 'iife',
                sourcemap: false,
            },
        ],
        // Indicate here external modules you don't wanna include in your bundle (i.e.: 'lodash')
        external: [],
        watch: {
            include: 'src/**',
        },
        plugins: [
            // Allow json resolution
            json(),

            // Compile TypeScript files
            typescript(),

            // Allow bundling cjs modules (unlike webpack, rollup doesn't understand cjs)
            commonjs(),
            globals(),

            // Allow node_modules resolution, so you can use 'external' to control
            // which external modules to include in the bundle
            // https://github.com/rollup/rollup-plugin-node-resolve#usage
            resolve({ preferBuiltins: false }),

            // Resolve source maps to the original source
            sourceMaps(),
        ],
    },
];
