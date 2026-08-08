(() => {
  const style = document.createElement("style");
  style.textContent = (window.__POLYGON_STYLE_PARTS__ || []).join("") + (window.__POLYGON_STYLE_PATCH__ || "");
  document.head.appendChild(style);
  const source = window.__POLYGON_SCRIPT_V2__ || (window.__POLYGON_SCRIPT_V2_PARTS__ || []).join("") || (window.__POLYGON_SCRIPT_PARTS__ || []).join("");
  (0, eval)(source);
  delete window.__POLYGON_STYLE_PARTS__;
  delete window.__POLYGON_STYLE_PATCH__;
  delete window.__POLYGON_SCRIPT_PARTS__;
  delete window.__POLYGON_SCRIPT_V2_PARTS__;
  delete window.__POLYGON_SCRIPT_V2__;
})();
