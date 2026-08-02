(() => {
  const style = document.createElement("style");
  style.textContent = (window.__POLYGON_STYLE_PARTS__ || []).join("");
  document.head.appendChild(style);
  const source = (window.__POLYGON_SCRIPT_PARTS__ || []).join("");
  (0, eval)(source);
  delete window.__POLYGON_STYLE_PARTS__;
  delete window.__POLYGON_SCRIPT_PARTS__;
})();
