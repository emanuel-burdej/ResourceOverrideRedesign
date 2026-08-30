/* globals chrome */

// Paths match uBOL style: root-absolute from extension base
// https://github.com/uBlockOrigin/uBOL-home/blob/main/chromium/js/action.js
const ICONS_ON = {
    "16": "/icons/icon_16.png",
    "32": "/icons/icon_32.png",
    "64": "/icons/icon_64.png",
    "128": "/icons/icon_128.png"
};

const ICONS_OFF = {
    "16": "/icons/icon_16_off.png",
    "32": "/icons/icon_32_off.png",
    "64": "/icons/icon_64_off.png",
    "128": "/icons/icon_128_off.png"
};

export const countGroupsOn = (ruleGroups = []) => {
    if (!Array.isArray(ruleGroups)) {
        return 0;
    }
    return ruleGroups.filter((group) => group && group.on !== false).length;
};

export const hasAnyGroupOn = (ruleGroups = []) => countGroupsOn(ruleGroups) > 0;

const setToolbarBadge = (count) => {
    // Dark badge + white digits, similar to uBOL toolbar badge.
    chrome.action.setBadgeBackgroundColor({ color: "#3c4043" });
    if (chrome.action.setBadgeTextColor) {
        chrome.action.setBadgeTextColor({ color: "#ffffff" });
    }
    chrome.action.setBadgeText({
        text: count > 0 ? String(count) : ""
    });
};

export const setToolbarIcon = (active, onCount = 0) => {
    chrome.action.setIcon({
        path: active ? ICONS_ON : ICONS_OFF
    });
    setToolbarBadge(onCount);
    chrome.action.setTitle({
        title: onCount > 0
            ? `ResourceOverrideRedesign (${onCount} group${onCount === 1 ? "" : "s"} on)`
            : "ResourceOverrideRedesign (no groups on)"
    });
};

export const updateToolbarIconFromGroups = (ruleGroups) => {
    const onCount = countGroupsOn(ruleGroups);
    setToolbarIcon(onCount > 0, onCount);
};

export const updateToolbarIconFromStorage = async () => {
    const { ruleGroups = [] } = await chrome.storage.local.get({ ruleGroups: [] });
    updateToolbarIconFromGroups(ruleGroups);
    return ruleGroups;
};
