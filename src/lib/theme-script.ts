export const THEME_STORAGE_KEY = "myfin-theme";

/** Resolves the saved theme preference to data-theme before paint. */
export const themeScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"#000000":"#f2f2f7")}catch(e){}})()`;
