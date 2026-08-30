import { exportData, importData, validateImportFile, collectImportWarnings } from "./importExport.js";
import {
    getUiElements,
    showToast,
} from "./util.js";

/* global chrome */

const applyDarkMode = (enabled) => {
    document.body.classList.toggle("darkMode", enabled);
    document.documentElement.style.colorScheme = enabled ? "dark" : "light";
    const appShell = document.getElementById("appShell");
    if (appShell) {
        appShell.classList.toggle("darkMode", enabled);
    }
};

export const updateOptions = async () => {
    const options = await chrome.storage.local.get({
        optionDevTools: true,
        optionDarkMode: false
    });
    const showDevTools = document.getElementById("showDevTools");
    const darkMode = document.getElementById("darkMode");
    if (showDevTools) {
        showDevTools.checked = options.optionDevTools;
    }
    if (darkMode) {
        darkMode.checked = options.optionDarkMode;
    }
    applyDarkMode(Boolean(options.optionDarkMode));
};

export const importRulesAndRefresh = async (
    importedObj,
    importRules = importData,
    refresh = () => window.location.reload()
) => {
    const succeeded = await importRules(importedObj.data, importedObj.v);
    if (succeeded) {
        refresh();
    }
    return succeeded;
};

export const closeHeaderMenu = (ui) => {
    if (!ui || !ui.headerMenuDropdown) {
        return;
    }
    ui.headerMenuDropdown.style.display = "none";
    if (ui.headerMenuBtn) {
        ui.headerMenuBtn.setAttribute("aria-expanded", "false");
    }
};

const toggleHeaderMenu = (ui) => {
    const open = ui.headerMenuDropdown.style.display === "block";
    ui.headerMenuDropdown.style.display = open ? "none" : "block";
    if (ui.headerMenuBtn) {
        ui.headerMenuBtn.setAttribute("aria-expanded", open ? "false" : "true");
    }
};

const initOptions = () => {
    const ui = getUiElements(document);

    window.addEventListener("click", (e) => {
        const target = e.target;
        if (target.id === "headerMenuBtn" || target.closest("#headerMenuBtn")) {
            toggleHeaderMenu(ui);
            return;
        }
        if (target.closest("#headerMenuDropdown")) {
            if (target.closest(".headerMenuItem")) {
                closeHeaderMenu(ui);
            }
            return;
        }
        closeHeaderMenu(ui);
    });

    ui.showDevTools.addEventListener("change", async () => {
        chrome.storage.local.set({
            optionDevTools: ui.showDevTools.checked,
        });
    });

    ui.darkMode.addEventListener("change", async () => {
        const enabled = ui.darkMode.checked;
        applyDarkMode(enabled);
        chrome.storage.local.set({
            optionDarkMode: enabled,
        });
    });

    ui.saveRulesLink.addEventListener("click", async () => {
        const exported = await exportData();
        const warnings = collectImportWarnings(exported);
        if (warnings.length) {
            const proceed = window.confirm(
                warnings.join("\n\n") + "\n\nExport anyway?"
            );
            if (!proceed) {
                return;
            }
        }
        const json = JSON.stringify(exported);
        const blob = new Blob([json], {type: "text/plain"});
        const downloadLink = document.createElement("a");
        downloadLink.download = "resource_override_rules.json";
        downloadLink.href = window.URL.createObjectURL(blob);
        downloadLink.click();
    });


    ui.loadRulesLink.addEventListener("click", () => {
        ui.loadRulesInput.click();
    });

    ui.loadRulesInput.addEventListener("change", () => {
        const file = ui.loadRulesInput.files[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = async function() {
            const text = reader.result;
            const validation = validateImportFile(text, file.size);
            if (!validation.valid) {
                showToast(validation.error);
                return;
            }
            if (validation.warnings.length) {
                const proceed = window.confirm(
                    validation.warnings.join("\n\n") + "\n\nImport anyway?"
                );
                if (!proceed) {
                    return;
                }
            }
            await importRulesAndRefresh(validation.payload);
        };
        reader.readAsText(file);
        ui.loadRulesInput.value = "";
    });
};

export default initOptions;
