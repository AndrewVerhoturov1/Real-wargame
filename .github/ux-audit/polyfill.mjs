globalThis.CSS ??= {};
globalThis.CSS.escape ??= (value) => String(value)
  .replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0).toString(16)} `);
