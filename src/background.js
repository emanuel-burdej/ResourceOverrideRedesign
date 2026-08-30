/* globals chrome */
import setupNetRequestRules, { transformMatchReplace } from "./netRequestRules.js";
import {
    updateToolbarIconFromGroups,
    updateToolbarIconFromStorage
} from "./actionIcon.js";
import { dedupeRuleGroups } from "./util.js";

let allRuleGroups = [];

const hydrateGroupFiles = (ruleGroups, storage) => {
    ruleGroups.forEach((group) => {
        (group.rules || []).forEach((rule) => {
            if ((rule.type === "fileOverride" || rule.type === "fileInject") && rule.file === undefined) {
                const file = storage[`f${rule.id}`];
                if (file !== undefined) {
                    rule.file = file;
                }
            }
        });
    });
};

const reloadData = async () => {
    allRuleGroups = await updateToolbarIconFromStorage();
    return allRuleGroups;
};

const applyGroups = async (ruleGroups = []) => {
    const storage = await chrome.storage.local.get(null);
    for (const group of ruleGroups) {
        const rules = group.rules || [];
        rules.forEach((rule) => {
            if ((rule.type === "fileOverride" || rule.type === "fileInject") && rule.file === undefined) {
                rule.file = storage[`f${rule.id}`];
            }
        });
        await setupNetRequestRules(group);
    }
};

const reloadAndApplyGroups = async () => {
    const storage = await chrome.storage.local.get(null);
    const ruleGroups = dedupeRuleGroups(storage.ruleGroups || []);
    allRuleGroups = ruleGroups;
    updateToolbarIconFromGroups(ruleGroups);
    hydrateGroupFiles(allRuleGroups, storage);
    await applyGroups(allRuleGroups);
    return allRuleGroups;
};

const actions = {
    sync: async () => {
        await reloadData();
    },
    updateIcon: async () => {
        await reloadData();
    },
    persistGroups: async (request) => {
        const ruleGroups = dedupeRuleGroups(request.ruleGroups || []);
        await chrome.storage.local.set({ ruleGroups });
        allRuleGroups = ruleGroups;
        updateToolbarIconFromGroups(ruleGroups);
        await applyGroups(ruleGroups);
    }
};

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.ruleGroups) {
        return;
    }
    allRuleGroups = changes.ruleGroups.newValue || [];
    updateToolbarIconFromGroups(allRuleGroups);
});

chrome.runtime.onInstalled.addListener(() => {
    reloadAndApplyGroups().catch((err) => {
        console.error("Failed to apply groups on install:", err);
    });
});

chrome.runtime.onStartup.addListener(() => {
    reloadAndApplyGroups().catch((err) => {
        console.error("Failed to apply groups on startup:", err);
    });
});

reloadAndApplyGroups().catch((err) => {
    console.error("Failed to apply groups on service worker start:", err);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) {
        console.error("BG message handler: rejected sender", sender.id);
        sendResponse({ error: "Unauthorized sender" });
        return;
    }
    const action = actions[request.action];
    if (!action) {
        console.error(`BG message handler: No action named ${request.action}`);
        return;
    }
    (async () => {
        let sentResponse = false;
        const mySendResponse = (...args) => {
            sentResponse = true;
            sendResponse(...args);
        };
        try {
            await action(request, sender, mySendResponse);
            if (!sentResponse) {
                sendResponse();
            }
        } catch (err) {
            console.error("BG message handler failed:", err);
            if (!sentResponse) {
                sendResponse({ error: String(err) });
            }
        }
    })();
    return true;
});

// eslint-disable-next-line no-unused-vars
const urlMatches = (matchStr, url) => {
    const result = transformMatchReplace(matchStr);
    let regex;
    try {
        regex = new RegExp(result.match);
    } catch {}
    return regex && regex.test(url);
};

chrome.webNavigation.onCommitted.addListener((details) => {
    allRuleGroups.forEach((ruleGroup) => {
        if (ruleGroup.on) {
            const rules = ruleGroup.rules || [];
            rules.forEach((rule) => {
                if (rule.on && rule.type === "fileInject" && urlMatches(rule.match, details.url)) {
                    if (rule.fileType === "js") {
                        chrome.scripting.executeScript({
                            target: { tabId: details.tabId, frameIds: [details.frameId] },
                            func: code => {
                                const el = document.createElement('script');
                                el.textContent = code;
                                document.head.appendChild(el);
                                el.remove();
                            },
                            args: [rule.file],
                            world: 'MAIN',
                        });
                    } else if (rule.fileType === 'css') {
                        chrome.scripting.insertCSS({
                            target: { tabId: details.tabId },
                            css: rule.file,
                            origin: "USER"
                        });
                    }
                }
            });
        }
    });
});
