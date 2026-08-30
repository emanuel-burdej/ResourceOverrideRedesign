import assert from "node:assert/strict";
import { syncInputTitle } from "../src/util.js";

const listeners = {};
const input = {
    value: "https://example.com/a/very/long/resource/url.js",
    title: "",
    addEventListener: (eventName, listener) => {
        listeners[eventName] = listener;
    }
};

syncInputTitle(input);
assert.equal(input.title, input.value);

input.value = "https://localhost:4334/resource.js";
listeners.input();
assert.equal(input.title, input.value);

console.log("All tests succeeded!");
