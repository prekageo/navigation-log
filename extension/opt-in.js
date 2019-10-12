window.addEventListener("load", () => {
    var understand = document.getElementById("understand");
    var incognito = document.getElementById("incognito");
    var enable = document.getElementById("enable");
    understand.addEventListener('change', () => {
        incognito.disabled = !understand.checked;
        enable.disabled = !understand.checked;
    });
    enable.addEventListener('click', () => {
        browser.runtime.sendMessage({
            "optin" : true,
            "optin_incognito" : incognito.checked,
        });
    });
});
