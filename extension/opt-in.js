window.addEventListener("load", () => {
    var understand = document.getElementById("understand");
    var enable = document.getElementById("enable");
    understand.addEventListener('change', () => {
        enable.disabled = !understand.checked;
    });
    enable.addEventListener('click', () => {
        browser.runtime.sendMessage({
            "optin" : true,
        });
    });
});
