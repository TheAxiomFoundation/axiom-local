/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const artifact_format_version: () => number;
export const compile: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const engine_version: () => [number, number];
export const execute: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const init: () => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
