import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/team/page.tsx", "utf8");
const styles = readFileSync("app/team/workspace.module.css", "utf8");
const focusStyles = readFileSync("app/components/spatial.module.css", "utf8");
const project = readFileSync("app/components/ProjectConnection.tsx", "utf8");

describe("focus-first workspace structure", () => {
  it("renders one primary evidence panel for the selected agent", () => {
    assert.match(styles, /grid-template-areas: "content side"/);
    assert.match(styles, /data-focus="team_memory"\] \.layout > \[data-zone="code_navigator"\]/);
    assert.match(styles, /data-focus="code_navigator"\] \.layout > \[data-zone="team_memory"\]/);
    assert.match(styles, /data-focus="leader_desk"\] \.layout > \[data-zone\]/);
    assert.match(page, /data-focus=\{focus\}/);
  });
  it("keeps evidence flows and optional controls accessible via disclosure", () => {
    for (const name of ["flowDetails", "sourceDisclosure", "leadDisclosure", "focusDisclosure"]) {
      assert.match(page, new RegExp("className=\\{w\\." + name + "\\}"));
    }
    assert.match(project, /className=\{w\.voiceDisclosure\}/);
    assert.match(page, /<FlowRail stage=\{flow\.stage\}/);
    assert.match(page, /<CodeFocus request=\{sourceRequest\}/);
  });
  it("supports narrow widths and permits long labels to wrap", () => {
    assert.match(styles, /@media \(max-width: 960px\)/);
    assert.match(styles, /@media \(max-width: 640px\)/);
    assert.match(styles, /\.meetRow b, \.meetRow small \{ overflow-wrap: anywhere; \}/);
    assert.match(focusStyles, /\.compactInput \.inputChoice small \{ display: none; \}/);
    assert.match(focusStyles, /\.compactInput \.routeIndicator strong \{[^}]*overflow-wrap: anywhere/s);
  });
});
