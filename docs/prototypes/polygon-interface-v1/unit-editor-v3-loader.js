(async () => {
  const encoded = window.__POLYGON_V3_PAYLOAD__ || "";
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const html = await new Response(stream).text();
  delete window.__POLYGON_V3_PAYLOAD__;
  document.open();
  document.write(html);
  document.close();
})().catch(error => {
  document.body.innerHTML = `<pre style="padding:20px;font:14px/1.5 system-ui">Не удалось открыть прототип: ${String(error)}</pre>`;
  console.error(error);
});
