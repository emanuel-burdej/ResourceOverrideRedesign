import {
    getUiElements,
    getTabResources,
    fadeOut,
    fadeIn,
    getNextGroupId,
    getNextRuleId,
    saveDataAndSync,
    dedupeRuleGroups,
    normalizeRuleGroupId
} from "./util.js";
import { mainSuggest, requestHeadersSuggest, responseHeadersSuggest } from "./suggest.js";
import setupNetRequestRules from "./netRequestRules.js";
import { requestHeaders, responseHeaders } from "./headers.js";
import { tabGroupsInit, createDomainMarkup, installPopupPersistGuard } from "./tabGroup.js";
import initOptions, { updateOptions, closeHeaderMenu } from "./options.js";
import { updateToolbarIconFromStorage } from "./actionIcon.js";

/* globals chrome */
const ui = getUiElements(document);

// Toolbar popup vs Options tab / DevTools panel
try {
    const views = chrome.extension?.getViews?.({ type: "popup" }) || [];
    const isPopup = views.includes(window);
    const isOptionsTab = !isPopup && !chrome.devtools && window.outerHeight > 700;
    if (isPopup || (!isOptionsTab && window.innerHeight <= 650 && !chrome.devtools)) {
        document.documentElement.classList.add("popupMode");
        installPopupPersistGuard();
    }
} catch (e) {
    if (!chrome.devtools && Math.min(window.innerHeight, window.outerHeight) <= 650) {
        document.documentElement.classList.add("popupMode");
        installPopupPersistGuard();
    }
}

// Refresh toolbar icon from this page context (uBOL-style setIcon paths).
updateToolbarIconFromStorage().catch(() => {});

let allRuleErrors = {};
let saveRuleGroupsChain = Promise.resolve();

const saveRuleGroup = async (group, removedIds = []) => {
    const runSave = async () => {
        const groupId = normalizeRuleGroupId(group.id);
        if (groupId == null) {
            return;
        }
        const normalizedGroup = { ...group, id: groupId };
        const ruleGroups = dedupeRuleGroups(
            (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups
        );
        const groupIndex = ruleGroups.findIndex((rGroup) => Number(rGroup.id) === groupId);
        if (groupIndex > -1) {
            ruleGroups[groupIndex] = normalizedGroup;
        } else {
            ruleGroups.push(normalizedGroup);
        }
        await saveDataAndSync({ ruleGroups: dedupeRuleGroups(ruleGroups) });

        const ruleErrors = await setupNetRequestRules(normalizedGroup, removedIds);
        allRuleErrors[groupId] = ruleErrors;
    };

    saveRuleGroupsChain = saveRuleGroupsChain.then(runSave, runSave);
    return saveRuleGroupsChain;
};

async function renderData() {
    ui.domainDefs.innerHTML = "";
    const stored = (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups;
    const ruleGroups = dedupeRuleGroups(stored);
    if (ruleGroups.length !== stored.length) {
        await saveDataAndSync({ ruleGroups });
    }

    if (ruleGroups.length) {
        for (const group of ruleGroups) {
            const markup = await createDomainMarkup(group);
            ui.domainDefs.appendChild(markup);
        }
    } else {
        const newGroupData = {
            id: 1,
            name: "",
            rules: [{ id: 1, type: "normalOverride", on: true }],
            on: true,
            expanded: true,
        };
        const newGroup = await createDomainMarkup(newGroupData);
        ui.domainDefs.appendChild(newGroup);
        saveRuleGroup(newGroupData);
    }
    const isSuggestSupported = getTabResources((res) => {
        mainSuggest.fillOptions(res);
    });
    if (!isSuggestSupported) {
        mainSuggest.setShouldSuggest(false);
    }
}

const renderErrors = () => {
    document.querySelectorAll(".ruleContainer").forEach(el => {
        el.classList.remove("error");
        el.title = "";
    });
    Object.keys(allRuleErrors).forEach((groupId) => {
        const groupRuleErrors = allRuleErrors[groupId];
        Object.keys(groupRuleErrors).forEach((key) => {
            const rule = document.querySelector(`#r${key}`);
            rule.classList.add("error");
            rule.title = groupRuleErrors[key];
        });
    });
};

async function init() {
    tabGroupsInit(saveRuleGroup);
    mainSuggest.init();
    requestHeadersSuggest.init();
    responseHeadersSuggest.init();
    requestHeadersSuggest.fillOptions(requestHeaders);
    responseHeadersSuggest.fillOptions(responseHeaders);
    initOptions();
    updateOptions();

    ui.addDomainBtn.addEventListener("click", async () => {
        const ruleGroups = (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups;
        const id = getNextGroupId(ruleGroups);
        const newGroupData = {
            id,
            name: "",
            rules: [{ id: getNextRuleId(ruleGroups), type: "normalOverride", on: true }],
            on: true,
            expanded: true,
        };
        const newGroup = await createDomainMarkup(newGroupData);
        ui.domainDefs.appendChild(newGroup);
        saveRuleGroup(newGroupData);
    });

    ui.helpBtn.addEventListener("click", () => {
        ui.helpOverlay.style.display = ui.helpOverlay.style.display === "block" ? "none" : "block";
        closeHeaderMenu(ui);
        if (ui.helpOverlay.style.display === "block") {
            ui.helpOverlay.scrollTop = 0;
            const helpContent = document.getElementById("helpContent");
            if (helpContent) {
                helpContent.scrollTop = 0;
            }
        }
    });

    ui.helpCloseBtn.addEventListener("click", () => {
        ui.helpOverlay.style.display = "none";
    });

    if (ui.openDetailBtn) {
        ui.openDetailBtn.addEventListener("click", () => {
            closeHeaderMenu(ui);
            chrome.runtime.openOptionsPage();
        });
    }

    if (!chrome.devtools) {
        const storage = await chrome.storage.local.get({ tabPageNotice: false });
        if (!storage.tabPageNotice) {
            ui.tabPageNotice.querySelector("a").addEventListener("click", (e) => {
                e.preventDefault();
                chrome.storage.local.set({ tabPageNotice: true });
                fadeOut(ui.tabPageNotice);
            });
            fadeIn(ui.tabPageNotice);
            setTimeout(function() {
                fadeOut(ui.tabPageNotice);
            }, 6000);
        }
    }

    const messageActions = {
        sync: () => {
            renderData();
        },
    };

    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
        // util.debug('got message! action: ' + request.action);
        let sentResponse = false;
        const mySendResponse = (...args) => {
            sentResponse = true;
            sendResponse(...args);
        };
        const action = messageActions[request.action];
        if (action) {
            await action(request, sender, mySendResponse);
            if (!sentResponse) {
                sendResponse();
            }
            // !!!Important!!! Need to return true for sendResponse to work.
            return true;
        }
        console.error(`Message handler: No action named ${request.action}`);
    });

    chrome.storage.onChanged.addListener(async (changes) => {
        const optionChanged = Object.keys(changes).find(changeKey => changeKey.includes("option"));
        if (optionChanged) {
            updateOptions();
        }
    });

    if (navigator.userAgent.indexOf("Firefox") > -1 && !!chrome.devtools) {
        // Firefox is really broken with the "/" and "'" keys. They just dont work.
        // So try to fix them here.. wow.. just wow. I can't believe I'm fixing the ability to type.
        const brokenKeys = { "/": 1, "?": 1, "'": 1, '"': 1 };
        window.addEventListener("keydown", e => {
            const brokenKey = brokenKeys[e.key];
            const activeEl = document.activeElement;
            if (brokenKey && (activeEl.nodeName === "INPUT" || activeEl.nodeName === "TEXTAREA") &&
                activeEl.className !== "ace_text-input") {

                e.preventDefault();
                const start = activeEl.selectionStart;
                const end = activeEl.selectionEnd;
                activeEl.value = activeEl.value.substring(0, start) + e.key +
                    activeEl.value.substring(end, activeEl.value.length);
                activeEl.selectionStart = start + 1;
                activeEl.selectionEnd = start + 1;
            }
        });
    }

    await renderData();
    allRuleErrors = {};

    const ruleGroups = (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups;
    const ruleErrorsPairedWithGroup = await Promise.all(ruleGroups.map(
        (group) => setupNetRequestRules(group).then(ruleErrors => ({ group, ruleErrors }))
    ));
    ruleErrorsPairedWithGroup.forEach(ruleErrorWithGroup => {
        allRuleErrors[ruleErrorWithGroup.group.id] = ruleErrorWithGroup.ruleErrors;
        renderErrors();
    });
}

init();
