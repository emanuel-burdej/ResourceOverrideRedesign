import assert from "node:assert/strict";
import * as importExport from "../src/importExport.js";

const { getDomainData } = importExport;

const domain = {
    id: "d1",
    classList: {
        contains: (className) => className === "collapsed"
    },
    querySelectorAll: () => [],
    querySelector: (selector) => {
        if (selector === ".domainMatchInput") {
            return { value: "My Group" };
        }
        if (selector === ".onoffswitch-checkbox" || selector === ".domainHeader .onoffswitch-checkbox") {
            return { checked: true };
        }
        throw new Error(`Unexpected selector: ${selector}`);
    }
};

const data = getDomainData(domain);

assert.equal(data.name, "My Group");
assert.equal(data.expanded, false);
assert.equal(Object.hasOwn(data, "matchUrl"), false);

assert.equal(typeof importExport.exportDataJson, "function");

globalThis.chrome = {
    storage: {
        local: {
            get: async () => ({
                ruleGroups: [{
                    id: 1,
                    name: "My Group",
                    rules: [],
                    on: true
                }]
            })
        }
    }
};

const exported = JSON.parse(await importExport.exportDataJson());

assert.equal(exported.v, 2);
assert.equal(exported.data[0].name, "My Group");
assert.equal(Object.hasOwn(exported, "ruleGroups"), false);

const options = await import("../src/options.js");

assert.equal(typeof options.importRulesAndRefresh, "function");

let refreshCount = 0;
await options.importRulesAndRefresh(
    { v: 2, data: [] },
    async () => true,
    () => refreshCount++
);
assert.equal(refreshCount, 1);

await options.importRulesAndRefresh(
    { v: 2, data: [] },
    async () => false,
    () => refreshCount++
);
assert.equal(refreshCount, 1);

const userRulesText = await import("node:fs/promises").then((fs) =>
    fs.readFile("/Users/em/Downloads/resource_override_rules.json", "utf8")
).catch(() => null);

if (userRulesText) {
    const userValidation = importExport.validateImportFile(userRulesText, userRulesText.length);
    assert.equal(userValidation.valid, true, userValidation.error || "user rules file should validate");
    assert.equal(userValidation.warnings.length, 0);
    assert.equal(userValidation.payload.v, 2);
    assert.equal(userValidation.payload.data.length, 5);
}

const injectWarningPayload = {
    v: 2,
    data: [{
        id: 1,
        name: "Inject test",
        on: true,
        rules: [{
            id: 1,
            type: "fileInject",
            match: "https://example.com/*",
            fileName: "test.js",
            fileType: "js",
            file: "console.log(1)",
            on: true
        }]
    }]
};
const injectValidation = importExport.validateImportFile(JSON.stringify(injectWarningPayload));
assert.equal(injectValidation.valid, true);
assert.equal(injectValidation.warnings.length, 1);

const oversizeValidation = importExport.validateImportFile("{}", importExport.MAX_IMPORT_JSON_BYTES + 1);
assert.equal(oversizeValidation.valid, false);

console.log("All tests succeeded!");
