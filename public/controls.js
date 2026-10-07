const shapes={
  play:'<path class="icon-solid" d="M8 5.5 18 12 8 18.5Z"/>',
  pause:'<rect class="icon-solid" x="7" y="5.5" width="3.5" height="13" rx=".7"/><rect class="icon-solid" x="13.5" y="5.5" width="3.5" height="13" rx=".7"/>',
  reset:'<rect class="icon-solid" x="6.5" y="6.5" width="11" height="11" rx="1"/>',
  previous:'<path d="M5 5v14"/><path class="icon-solid" d="m18 5.5-10 6.5 10 6.5Z"/>',
  next:'<path d="M19 5v14"/><path class="icon-solid" d="m6 5.5 10 6.5-10 6.5Z"/>',
  remove:'<path d="M6 12h12"/>',
  add:'<path d="M6 12h12M12 6v12"/>',
  restore:'<path d="M4 4v6h6M4.5 10a8 8 0 1 1 .5 7"/>',
  time:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  display:'<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M12 17v4m-4 0h8"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 5H4v15h15v-6"/>',
  tournaments:'<path d="M8 3h8v5a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v5m-4 4h8m-7-4h6v4H9Z"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  settings:'<path d="m9 3-.6 2.4-1.8 1L4.2 6l-2 3.5L4 11v2l-1.8 1.5 2 3.5 2.4-.4 1.8 1L9 21h4l.6-2.4 1.8-1 2.4.4 2-3.5L18 13v-2l1.8-1.5-2-3.5-2.4.4-1.8-1L13 3Z" transform="translate(1)"/><circle cx="12" cy="12" r="3"/>',
  fullscreen:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>'
};
export function setControlIcon(button,icon) {
  if(!button||button.dataset.icon===icon)return;
  button.innerHTML=`<svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shapes[icon]}</svg>`;
  button.dataset.icon=icon;
}
export function installControlIcons() {
  document.querySelectorAll('[data-control-icon]').forEach(el=>setControlIcon(el,el.dataset.controlIcon));
  setControlIcon(document.getElementById('display-fullscreen'),'fullscreen');
  const row=document.querySelector('.director-actions'),hint=document.getElementById('controls-scroll-hint');
  if(row&&hint&&typeof ResizeObserver!=='undefined') {
    // Reflow is the default. Keep a fallback hint if an unusually narrow or
    // enlarged viewport still makes the command area overflow.
    const update=()=>{hint.hidden=row.scrollWidth<=row.clientWidth+1;};
    new ResizeObserver(update).observe(row);update();
  }
}
