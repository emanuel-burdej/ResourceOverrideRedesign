import { showToast, parseRuleId, getNextRuleId, getNextGroupId, saveDataAndSync } from "./util.js";

/* global chrome */

export const getDomainData = (domain) => {
    const rules = [];
    domain.querySelectorAll(".ruleContainer").forEach((el) => {
        if (el.classList.contains("normalOverride")) {
            rules.push({
                id: parseRuleId(el.id),
                type: "normalOverride",
                match: el.querySelector(".matchInput").value,
                replace: el.querySelector(".replaceInput").value,
                on: el.querySelector(".onoffswitch-checkbox").checked
            });
        } else if (el.classList.contains("fileOverride")) {
            rules.push({
                id: parseRuleId(el.id),
                type: "fileOverride",
                match: el.querySelector(".matchInput").value,
                on: el.querySelector(".onoffswitch-checkbox").checked
            });
        } else if (el.classList.contains("fileInject")) {
            rules.push({
                id: parseRuleId(el.id),
                type: "fileInject",
                match: el.querySelector(".matchInput").value,
                fileName: el.querySelector(".fileName").value,
                fileType: el.querySelector(".fileTypeSelect").value,
                on: el.querySelector(".onoffswitch-checkbox").checked
            });
        } else if (el.classList.contains("headerRule")) {
            rules.push({
                id: parseRuleId(el.id),
                type: "headerRule",
                match: el.querySelector(".matchInput").value,
                requestRules: el.querySelector(".requestRules").dataset.rules || "",
                responseRules: el.querySelector(".responseRules").dataset.rules || "",
                on: el.querySelector(".onoffswitch-checkbox").checked
            });
        }
    });

    return {
        id: parseInt(domain.id.substring(1), 10),
        name: domain.querySelector(".domainMatchInput").value,
        rules: rules,
        on: domain.querySelector(".domainHeader .onoffswitch-checkbox").checked,
        expanded: !domain.classList.contains("collapsed")
    };
};

export const cloneGroupData = async (sourceDomain, ruleGroups = []) => {
    const source = getDomainData(sourceDomain);
    const storage = await chrome.storage.local.get(null);
    const newGroupId = getNextGroupId(ruleGroups);
    let nextRuleId = getNextRuleId(ruleGroups);
    const fileCopies = {};
    const newRules = source.rules.map((rule) => {
        const newRuleId = nextRuleId++;
        const newRule = { ...rule, id: newRuleId };
        if (rule.type === "fileOverride" || rule.type === "fileInject") {
            const fileKey = `f${rule.id}`;
            if (storage[fileKey] !== undefined) {
                fileCopies[`f${newRuleId}`] = storage[fileKey];
            }
        }
        return newRule;
    });

    if (Object.keys(fileCopies).length) {
        await chrome.storage.local.set(fileCopies);
    }

    return {
        id: newGroupId,
        name: source.name ? `${source.name} copy` : "",
        rules: newRules,
        on: source.on,
        expanded: source.expanded,
    };
};

const checkObject = (obj, requiredFields = [], customTests = {}) => {
    requiredFields.forEach(requiredField => {
        const val = obj[requiredField];
        const customTest = customTests[requiredField] || (() => true);
        if (val === undefined || !customTest(val)) {
            throw new Error("Invalid field: ", requiredField);
        }
    });
    return true;
};

const copyFields = (to, from, fields) => {
    fields.forEach(field => {
        to[field] = from[field];
    });
};

export const MAX_IMPORT_JSON_BYTES = 10 * 1024 * 1024;
export const LARGE_EMBEDDED_FILE_CHARS = 50 * 1024;

const formatSizeLimit = (bytes) => {
    if (bytes >= 1024 * 1024) {
        return `${Math.round(bytes / (1024 * 1024))} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
};

const validateRule = (rule) => {
    if (rule.type === "normalOverride") {
        return checkObject(rule, ["type", "match", "replace", "on"]);
    }
    if (rule.type === "fileOverride") {
        return checkObject(rule, ["type", "match", "file", "on"]);
    }
    if (rule.type === "fileInject") {
        return checkObject(rule, ["type", "match", "file", "fileName", "fileType", "on"], {
            fileType: (val) => ["js", "css"].includes(val)
        });
    }
    if (rule.type === "headerRule") {
        return checkObject(rule, ["type", "match", "requestRules", "responseRules", "on"]);
    }
    throw new Error("Invalid rule type: " + rule.type);
};

const validateImportDataArray = (data, ruleGroupFields, rulesField = "rules") => {
    checkObject({ data }, ["data"], {
        data: (val) => Array.isArray(val) && val.every((group) => checkObject(group, ruleGroupFields, {
            [rulesField]: (val) => Array.isArray(val) && val.every((rule) => validateRule(rule))
        }))
    });
};

export const collectImportWarnings = (importedObj) => {
    const warnings = [];
    const data = importedObj?.data;
    if (!Array.isArray(data)) {
        return warnings;
    }

    let injectCount = 0;
    let largeFileCount = 0;

    data.forEach((group) => {
        (group.rules || []).forEach((rule) => {
            if (rule.type === "fileInject") {
                injectCount++;
            }
            if (rule.file !== undefined && rule.file !== null) {
                const fileLen = String(rule.file).length;
                if (fileLen >= LARGE_EMBEDDED_FILE_CHARS) {
                    largeFileCount++;
                }
            }
        });
    });

    if (injectCount > 0) {
        warnings.push(
            `${injectCount} file inject rule(s) can run JavaScript or CSS on matched pages.`
        );
    }
    if (largeFileCount > 0) {
        warnings.push(
            `${largeFileCount} embedded file(s) exceed ${formatSizeLimit(LARGE_EMBEDDED_FILE_CHARS)}.`
        );
    }

    return warnings;
};

export const validateImportStructure = (importedObj) => {
    if (typeof importedObj !== "object" || importedObj === null || Array.isArray(importedObj)) {
        return "Load Failed: Invalid Resource Override JSON.";
    }
    const version = importedObj.v;
    if (version !== 1 && version !== 2) {
        return "Load Failed: Invalid format version.";
    }
    try {
        if (version === 1) {
            validateImportDataArray(importedObj.data, ["matchUrl", "on", "rules"]);
        } else {
            validateImportDataArray(importedObj.data, ["id", "name", "on", "rules"]);
        }
    } catch (e) {
        console.error(e);
        return "Load Failed: Invalid Resource Override JSON.";
    }
    return null;
};

export const validateImportFile = (text, byteLength = text.length) => {
    if (byteLength > MAX_IMPORT_JSON_BYTES) {
        return {
            valid: false,
            error: `Load Failed: File exceeds ${formatSizeLimit(MAX_IMPORT_JSON_BYTES)} limit.`
        };
    }

    let importedObj;
    try {
        importedObj = JSON.parse(text);
    } catch (e) {
        return {
            valid: false,
            error: "Load Failed: Invalid JSON in file."
        };
    }

    const structureError = validateImportStructure(importedObj);
    if (structureError) {
        return {
            valid: false,
            error: structureError
        };
    }

    return {
        valid: true,
        payload: importedObj,
        warnings: collectImportWarnings(importedObj)
    };
};

const versionedImports = {
    v1: (data, existingRuleGroups = []) => {
        validateImportDataArray(data, ["matchUrl", "on", "rules"]);

        const ruleGroups = existingRuleGroups.slice();
        const dataToStore = { ruleGroups };
        let nextRuleId = getNextRuleId(existingRuleGroups);
        let nextGroupId = getNextGroupId(ruleGroups);

        data.forEach(ruleGroup => {
            const rules = [];
            ruleGroup.rules.forEach(rule => {
                const importedRule = { id: nextRuleId++ };
                if (rule.type === "normalOverride") {
                    copyFields(importedRule, rule, ["type", "match", "replace", "on"]);
                } else if (rule.type === "fileOverride") {
                    copyFields(importedRule, rule, ["type", "match", "on"]);
                    dataToStore[`f${importedRule.id}`] = rule.file;
                } else if (rule.type === "fileInject") {
                    copyFields(importedRule, rule, ["type", "match", "fileName", "fileType", "on"]);
                    dataToStore[`f${importedRule.id}`] = rule.file;
                } else if (rule.type === "headerRule") {
                    copyFields(importedRule, rule, ["type", "match", "requestRules", "responseRules", "on"]);
                }
                rules.push(importedRule);
            });
            ruleGroups.push({
                id: nextGroupId++,
                name: ruleGroup.matchUrl,
                rules,
                on: ruleGroup.on
            });
        });

        return saveDataAndSync(dataToStore);
    },
    v2: (data, existingRuleGroups = []) => {
        validateImportDataArray(data, ["id", "name", "on", "rules"]);

        const ruleGroups = existingRuleGroups.slice();
        const dataToStore = { ruleGroups };
        let nextRuleId = getNextRuleId(existingRuleGroups);
        let nextGroupId = getNextGroupId(ruleGroups);

        data.forEach(ruleGroup => {
            const rules = [];
            ruleGroup.rules.forEach(rule => {
                const importedRule = { id: nextRuleId++ };
                if (rule.type === "normalOverride") {
                    copyFields(importedRule, rule, ["type", "match", "replace", "on"]);
                } else if (rule.type === "fileOverride") {
                    copyFields(importedRule, rule, ["type", "match", "on"]);
                    dataToStore[`f${importedRule.id}`] = rule.file;
                } else if (rule.type === "fileInject") {
                    copyFields(importedRule, rule, ["type", "match", "fileName", "fileType", "on"]);
                    dataToStore[`f${importedRule.id}`] = rule.file;
                } else if (rule.type === "headerRule") {
                    copyFields(importedRule, rule, ["type", "match", "requestRules", "responseRules", "on"]);
                }
                rules.push(importedRule);
            });
            ruleGroups.push({
                id: nextGroupId++,
                name: ruleGroup.name,
                rules,
                on: ruleGroup.on,
                expanded: ruleGroup.expanded === true
            });
        });

        return saveDataAndSync(dataToStore);
    },
};

// eslint-disable-next-line no-unused-vars
export const importData = async (data, version) => {
    const importFunc = versionedImports[`v${version}`];
    if (!importFunc) {
        showToast("Load Failed: Invalid format version.");
        return false;
    }
    const structureError = validateImportStructure({ v: version, data });
    if (structureError) {
        showToast(structureError);
        return false;
    }
    const existingData = await chrome.storage.local.get({ ruleGroups: [] });
    try {
        await importFunc(data, existingData.ruleGroups);
        showToast("Load Succeeded!");
        return true;
    } catch (e) {
        console.error(e);
        showToast("Load Failed: Invalid Resource Override JSON.");
        return false;
    }
};

export const exportData = async () => {
    const existingData = await chrome.storage.local.get({ ruleGroups: [] });
    const toExport = { v: 2, data: [] };
    toExport.data = await Promise.all(existingData.ruleGroups.map(async ruleGroup => {
        const fileIds = {};
        let hasFileRule = false;
        ruleGroup.rules.forEach(rule => {
            if (rule.type === "fileOverride" || rule.type === "fileInject") {
                fileIds[`f${rule.id}`] = "";
                hasFileRule = true;
            }
        });
        let files = {};
        if (hasFileRule) {
            files = await chrome.storage.local.get(fileIds);
        }
        ruleGroup.rules.forEach(rule => {
            if (rule.type === "fileOverride" || rule.type === "fileInject") {
                rule.file = files[`f${rule.id}`];
            }
        });
        return ruleGroup;
    }));

    return toExport;
};

export const exportDataJson = async () => JSON.stringify(await exportData());
