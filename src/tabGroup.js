import setupNetRequestRules from "./netRequestRules.js";
import { getDomainData, cloneGroupData } from "./importExport.js";
import createWebOverrideMarkup from "./webRule.js";
import createFileOverrideMarkup from "./fileRule.js";
import createFileInjectMarkup from "./injectRule.js";
import createHeaderRuleMarkup from "./headerRule.js";
import moveableRules from "./moveableRules.js";
import {
    getUiElements,
    fadeOut,
    instanceTemplate,
    debounce,
    cancelAllPendingDebounced,
    deleteButtonIsSure,
    deleteButtonIsSureReset,
    showCopySuccessFeedback,
    getNextGroupId,
    saveDataAndSync,
    dedupeRuleGroups
} from "./util.js";

/* globals chrome */

let ui;
let saveRuleGroup;

let currentAddRuleBtn;
let currentAddRuleFunc;
let currentSaveFunc;
const immediateSaveByGroupId = new Map();
let mvGroups;

const saveAllGroupsOrder = async () => {
    const ruleGroups = dedupeRuleGroups(
        Array.from(document.querySelectorAll(".domainContainer")).map((domain) => {
            return getDomainData(domain);
        })
    );
    await saveDataAndSync({ ruleGroups });
};

const persistAllGroupsNow = () => {
    // DOM already has the latest values; skip pending debounced saves to avoid races.
    cancelAllPendingDebounced();
    const ruleGroups = dedupeRuleGroups(
        Array.from(document.querySelectorAll(".domainContainer")).map((domain) => {
            return getDomainData(domain);
        })
    );
    // SW continues after popup teardown.
    chrome.runtime.sendMessage({
        action: "persistGroups",
        ruleGroups
    }).catch(() => {});
    try {
        // Also set icon in popup context before it closes.
        import("./actionIcon.js").then(({ updateToolbarIconFromGroups }) => {
            updateToolbarIconFromGroups(ruleGroups);
        });
    } catch (e) { /* ignore */ }
    return ruleGroups;
};

export const installPopupPersistGuard = () => {
    const flush = () => {
        persistAllGroupsNow();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flush();
        }
    });
};


function positionRuleDropdown(addBtn) {
    ui.addRuleDropdown.style.top = (addBtn.offsetTop + 40) + "px";
    ui.addRuleDropdown.style.left = (addBtn.offsetLeft - 40) + "px";

    const rect = ui.addRuleDropdown.getBoundingClientRect();
    if (rect.top + rect.height > window.innerHeight && addBtn.offsetTop - rect.height > 0) {
        ui.addRuleDropdown.style.top = (addBtn.offsetTop - rect.height) + "px";
        ui.addRuleDropdown.style.left = (addBtn.offsetLeft - 40) + "px";
        ui.addRuleDropdown.classList.add("reverse");
    } else {
        ui.addRuleDropdown.classList.remove("reverse");
    }
}

function showRuleDropdown(addBtn, addRuleFunc, saveFunc) {
    if (ui.addRuleDropdown.style.display !== "none" && currentAddRuleFunc === addRuleFunc) {
        ui.addRuleDropdown.style.display = "none";
    } else {
        currentAddRuleBtn = addBtn;
        currentAddRuleFunc = addRuleFunc;
        currentSaveFunc = saveFunc;
        ui.addRuleDropdown.style.display = "block";
        positionRuleDropdown(addBtn);
    }
}

function createSaveFunction(groupId) {
    return async (opts = {}) => {
        const domain = document.getElementById(`d${groupId}`);
        if (domain) {
            const data = getDomainData(domain);
            await saveRuleGroup(data, opts.removeIds);
        } else {
            setupNetRequestRules({ rules: [] }, opts.removeIds);
            const ruleGroups = dedupeRuleGroups(
                (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups
            );
            const newRuleGroups = ruleGroups.filter((g) => Number(g.id) !== Number(groupId));
            await saveDataAndSync({ ruleGroups: newRuleGroups });
        }
    };
}

const isExpandExcludedTarget = (target) => {
    return Boolean(target.closest(
        "input, textarea, select, button, .onoffswitch, .onoffswitch-label, .onoffswitch-checkbox, .groupHandle, .handle, .copy, .copyGroupBtn"
    ));
};

const setGroupCollapsed = (domain, collapsed, saveFunc) => {
    domain.classList.toggle("collapsed", collapsed);
    domain.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (saveFunc) {
        saveFunc();
    }
    updateExpandAllButton();
};

const updateExpandAllButton = () => {
    if (!ui || !ui.expandAllGroupsBtn) {
        return;
    }
    const groups = Array.from(document.querySelectorAll(".domainContainer"));
    const allExpanded = groups.length > 0 && groups.every((group) => !group.classList.contains("collapsed"));
    const label = allExpanded ? "Collapse all" : "Expand all";
    ui.expandAllGroupsBtn.title = label;
    ui.expandAllGroupsBtn.setAttribute("aria-label", label);
    ui.expandAllGroupsBtn.dataset.mode = allExpanded ? "collapse" : "expand";
};

export const createDomainMarkup = async (savedData) => {
    savedData = savedData || {};
    const domain = instanceTemplate(ui.domainTemplate);
    const overrideRulesContainer = domain.querySelector(".overrideRules");
    const addRuleBtn = domain.querySelector(".addRuleBtn");
    const domainMatchInput = domain.querySelector(".domainMatchInput");
    const onOffBtn = domain.querySelector(".onoffswitch-checkbox");
    const copyBtn = domain.querySelector(".copyGroupBtn");
    const deleteBtn = domain.querySelector(".deleteBtn");
    const onOffSwitch = domain.querySelector(".domainHeader .onoffswitch");
    const rules = savedData.rules || [];

    let id = savedData.id;
    if (!id) {
        const ruleGroups = (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups;
        id = getNextGroupId(ruleGroups);
    }
    domain.id = `d${id}`;
    addRuleBtn.dataset.gid = id;
    const immediateSave = createSaveFunction(id);
    immediateSaveByGroupId.set(id, immediateSave);
    const saveFunc = debounce(immediateSave, document.documentElement.classList.contains("popupMode") ? 200 : 700);

    for (let idx = 0, len = rules.length; idx < len; idx++) {
        const rule = rules[idx];
        if (rule.type === "normalOverride") {
            const el = await createWebOverrideMarkup(rule, saveFunc);
            overrideRulesContainer.appendChild(el);
        } else if (rule.type === "fileOverride") {
            const el = await createFileOverrideMarkup(rule, saveFunc);
            overrideRulesContainer.appendChild(el);
        } else if (rule.type === "fileInject") {
            const el = await createFileInjectMarkup(rule, saveFunc);
            overrideRulesContainer.appendChild(el);
        } else if (rule.type === "headerRule") {
            const el = await createHeaderRuleMarkup(rule, saveFunc);
            overrideRulesContainer.appendChild(el);
        }
    }

    const mvRules = moveableRules(overrideRulesContainer, ".handle");
    mvRules.onMove(saveFunc);

    const groupHandle = domain.querySelector(".groupHandle");
    if (groupHandle && mvGroups) {
        groupHandle.addEventListener("click", (e) => e.stopPropagation());
        groupHandle.addEventListener("mousedown", (e) => e.stopPropagation());
        mvGroups.assignHandleListener(groupHandle);
    }

    domainMatchInput.value = savedData.name || "";
    onOffBtn.checked = savedData.on === false ? false : true;
    onOffBtn.setAttribute("aria-label", "Enable group");
    setGroupCollapsed(domain, savedData.expanded !== true);

    if (savedData.on === false) {
        domain.classList.add("disabled");
    }

    const addRuleCallback = (markup) => {
        mvRules.assignHandleListener(markup.querySelector(".handle"));
        overrideRulesContainer.appendChild(markup);
        setGroupCollapsed(domain, false, saveFunc);
    };

    domain.addEventListener("click", (e) => {
        if (e.target.closest(".overrideRules")) {
            return;
        }
        if (isExpandExcludedTarget(e.target)) {
            return;
        }

        const header = domain.querySelector(".domainHeader");
        if (!domain.classList.contains("collapsed") && header) {
            const headerBottom = header.getBoundingClientRect().bottom;
            if (e.clientY > headerBottom + 6) {
                return;
            }
        }

        setGroupCollapsed(domain, !domain.classList.contains("collapsed"), saveFunc);
    });

    addRuleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showRuleDropdown(addRuleBtn, addRuleCallback, saveFunc);
    });

    domainMatchInput.addEventListener("click", (e) => {
        e.stopPropagation();
    });
    domainMatchInput.addEventListener("keyup", saveFunc);

    if (onOffSwitch) {
        onOffSwitch.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (copyBtn.disabled || copyBtn.classList.contains("is-success")) {
                return;
            }
            copyBtn.disabled = true;
            try {
                const ruleGroups = dedupeRuleGroups(
                    Array.from(document.querySelectorAll(".domainContainer")).map((d) => getDomainData(d))
                );
                const clonedGroup = await cloneGroupData(domain, ruleGroups);
                const newDomain = await createDomainMarkup(clonedGroup);
                domain.insertAdjacentElement("afterend", newDomain);
                await saveAllGroupsOrder();
                if (saveRuleGroup) {
                    await saveRuleGroup(clonedGroup);
                }
                showCopySuccessFeedback(copyBtn);
                updateExpandAllButton();
            } catch (err) {
                copyBtn.disabled = false;
            }
        });
    }

    deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!deleteButtonIsSure(deleteBtn)) {
            return;
        }
        fadeOut(domain);
        setTimeout(async () => {
            domain.remove();
            updateExpandAllButton();
            const ruleGroups = (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups;
            const ruleGroup = ruleGroups.find(g => g.id === id);
            if (ruleGroup) {
                const rules = ruleGroup.rules || [];
                chrome.storage.local.remove(rules.map(r => `f${r.id}`));
                saveFunc({ id, removeIds: rules.map(rule => rule.id) });
            }
        }, 300);
    });

    const changeOnOffSwitch = (e) => {
        if (e) {
            e.stopPropagation();
        }
        if (onOffBtn.checked) {
            domain.classList.remove("disabled");
        } else {
            domain.classList.add("disabled");
        }
        saveFunc.cancel();
        immediateSave();
    };
    onOffBtn.addEventListener("change", changeOnOffSwitch);

    deleteBtn.addEventListener("mouseout", function() {
        deleteButtonIsSureReset(deleteBtn);
    });

    return domain;
};

export const tabGroupsInit = (saveRuleGroupFunc) => {
    ui = getUiElements(document);
    saveRuleGroup = saveRuleGroupFunc;

    mvGroups = moveableRules(ui.domainDefs, ".groupHandle");
    mvGroups.onMove(() => {
        saveAllGroupsOrder();
    });

    ui.expandAllGroupsBtn.addEventListener("click", async () => {
        const groups = Array.from(document.querySelectorAll(".domainContainer"));
        const shouldExpand = groups.some((group) => group.classList.contains("collapsed"));
        groups.forEach((group) => {
            setGroupCollapsed(group, !shouldExpand);
        });
        const ruleGroups = (await chrome.storage.local.get({ ruleGroups: [] })).ruleGroups;
        const updatedGroups = ruleGroups.map((group) => {
            const domain = document.getElementById(`d${group.id}`);
            if (!domain) {
                return group;
            }
            return {
                ...group,
                expanded: !domain.classList.contains("collapsed")
            };
        });
        await saveDataAndSync({ ruleGroups: updatedGroups });
    });

    ui.addWebRuleBtn.addEventListener("click", async () => {
        const el = await createWebOverrideMarkup({}, currentSaveFunc);
        currentAddRuleFunc(el);
        createSaveFunction(currentAddRuleBtn.dataset.gid)();
    });

    ui.addFileRuleBtn.addEventListener("click", async () => {
        const el = await createFileOverrideMarkup({}, currentSaveFunc);
        currentAddRuleFunc(el);
        createSaveFunction(currentAddRuleBtn.dataset.gid)();
    });

    ui.addInjectRuleBtn.addEventListener("click", async () => {
        const el = await createFileInjectMarkup({}, currentSaveFunc);
        currentAddRuleFunc(el);
        createSaveFunction(currentAddRuleBtn.dataset.gid)();
    });

    ui.addHeaderRuleBtn.addEventListener("click", async () => {
        const el = await createHeaderRuleMarkup({}, currentSaveFunc);
        currentAddRuleFunc(el);
        createSaveFunction(currentAddRuleBtn.dataset.gid)();
    });

    window.addEventListener("resize", () => {
        if (currentAddRuleBtn) {
            positionRuleDropdown(currentAddRuleBtn);
        }
    });

    window.addEventListener("click", (e) => {
        const target = e.target;
        if (!target.classList.contains("addRuleBtn") && target.id !== "addRuleDropdown") {
            ui.addRuleDropdown.style.display = "none";
        }
    });
};
