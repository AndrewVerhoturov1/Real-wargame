interface Array<T> {
  /** ES2022 Array.at, available in the supported Node.js and modern browser runtimes. */
  at(index: number): T | undefined;
}

interface ReadonlyArray<T> {
  /** ES2022 Array.at, available in the supported Node.js and modern browser runtimes. */
  at(index: number): T | undefined;
}
